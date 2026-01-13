const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs-extra');
const path = require('path');
const db = require('../db'); // Ensure this matches your actual db file path

const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY 
});

exports.animateImage = async (req, res) => {
    // 1. Auth Check
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please log in to generate videos.' });
    }

    const userId = req.session.user.userId;
    const COST_PER_VIDEO = 2.00;

    // 2. Check Credit Balance
    const checkSql = 'SELECT credit, subscription_id FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';

    db.query(checkSql, [userId], async (err, results) => {
        if (err) {
            console.error("DB Error checking credits:", err);
            return res.status(500).json({ error: "Database error checking credits." });
        }

        if (results.length === 0) {
            return res.status(403).json({ error: "INSUFFICIENT_CREDITS", message: "No active subscription found." });
        }

        const userSub = results[0];
        if (userSub.credit < COST_PER_VIDEO) {
            return res.status(403).json({ error: "INSUFFICIENT_CREDITS", message: "Not enough credits." });
        }

        // 3. Sufficient Credits -> Proceed with Google Veo
        try {
            const { image, prompt } = req.body;

            if (!image || !prompt) {
                return res.status(400).json({ error: 'Missing image or prompt' });
            }

            console.log(`🎬 Request received: "${prompt.substring(0, 30)}..." (User ID: ${userId})`);
            
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // --- START GENERATION ---
            let operation = await genai.models.generateVideos({
                model: 'veo-3.1-generate-preview',
                prompt: prompt,
                image: {
                    imageBytes: base64Data,
                    mimeType: 'image/png'
                }
            });

            console.log("⏳ Video generation started... Waiting for result (~30-50s)");

            // Polling Loop
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Refresh operation status
                operation = await genai.operations.getVideosOperation({
                    operation: operation
                });
                
                process.stdout.write("."); 
            }
            console.log(" Done!");

            // ---------------------------------------------------------
            // 4. EXTRACT VIDEO DATA (THE FIX)
            // ---------------------------------------------------------
            // The API puts the data in 'result' (completed) or 'response' (long-running op)
            const completionPayload = operation.result || operation.response;
            const videoResult = completionPayload?.generatedVideos?.[0];
            
            let videoBuffer;
            let finalBase64String;

            // ★ IMPORTANT LINE A: Check if we got a download link (URI)
            if (videoResult?.video?.uri) {
                console.log(`📥 Downloading video from URI: ${videoResult.video.uri}`);
                
                // ★ IMPORTANT LINE B: Download the video using your API Key
                const vidResponse = await fetch(videoResult.video.uri, {
                    headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY }
                });

                if (!vidResponse.ok) {
                    throw new Error(`Failed to download video from URI: ${vidResponse.statusText}`);
                }

                // ★ IMPORTANT LINE C: Convert download stream to Buffer
                const arrayBuffer = await vidResponse.arrayBuffer();
                videoBuffer = Buffer.from(arrayBuffer);
                finalBase64String = videoBuffer.toString('base64');

            } 
            // Fallback: Check if we got raw bytes (Old API behavior)
            else {
                const rawBytes = videoResult?.video?.imageBytes || videoResult?.video?.bytesBase64Encoded;
                if (rawBytes) {
                    finalBase64String = rawBytes;
                    videoBuffer = Buffer.from(rawBytes, 'base64');
                }
            }

            // Final Validation
            if (!videoBuffer) {
                console.log("⚠️ Full Debug:", JSON.stringify(operation, null, 2));
                throw new Error("No video data found (neither URI nor imageBytes returned).");
            }

            // ---------------------------------------------------------
            // 5. SAVE FILE LOCALLY
            // ---------------------------------------------------------
            const filename = `video_${Date.now()}.mp4`;
            const savePath = path.join(__dirname, '../static/generated', filename);
            const publicUrl = `/static/generated/${filename}`;
            
            await fs.ensureDir(path.dirname(savePath));
            await fs.writeFile(savePath, videoBuffer);
            console.log(`✅ Video saved locally: ${filename}`);

            // ---------------------------------------------------------
            // 6. DATABASE INSERT & CREDIT DEDUCTION
            // ---------------------------------------------------------
            const insertVideoSql = 'INSERT INTO generated_videos (user_id, file_path, prompt, credit_cost) VALUES (?, ?, ?, ?)';
            
            db.query(insertVideoSql, [userId, publicUrl, prompt, COST_PER_VIDEO], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("❌ Failed to save video record to DB:", insertErr);
                } else {
                    console.log("✅ Video record saved to database.");
                }

                const updateCreditSql = 'UPDATE subscriptions_combined SET credit = credit - ? WHERE subscription_id = ?';
                db.query(updateCreditSql, [COST_PER_VIDEO, userSub.subscription_id], (updateErr) => {
                    if (updateErr) console.error("❌ Failed to deduct credits:", updateErr);
                    else console.log("💰 Credits deducted successfully.");

                    // 7. SEND RESPONSE
                    res.json({
                        status: 'success',
                        video_b64: finalBase64String, // Send base64 so frontend logic stays compatible
                        video_url: publicUrl,
                        remaining_credits: userSub.credit - COST_PER_VIDEO
                    });
                });
            });

        } catch (error) {
            console.error("\n❌ Generation Error:", error);
            res.status(500).json({ error: error.message || "Failed to generate video" });
        }
    });
};