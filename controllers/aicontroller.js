const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs-extra');
const path = require('path');
const db = require('../db'); // Ensure this matches your actual db file path

const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY 
});

exports.animateImage = async (req, res) => {
    // 1. Initial Check
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please log in.' });
    }

    const userId = req.session.user.userId;
    const userRole = req.session.user.userRole; 
    const isAdmin = (userRole === 'admin');
    const COST_PER_VIDEO = 2.00;

    console.log(`🚀 Request from User: ${userId} (Role: ${userRole})`);

    // 2. Credit Check
    const checkSql = 'SELECT credit, subscription_id FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';

    db.query(checkSql, [userId], async (err, results) => {
        if (err) {
            console.error("❌ DB Error:", err);
            return res.status(500).json({ error: "Database error." });
        }

        let userSub = results[0];

        if (!isAdmin) {
            if (!userSub) return res.status(403).json({ error: "No active subscription." });
            if (userSub.credit < COST_PER_VIDEO) return res.status(403).json({ error: "Insufficient credits." });
        }

        try {
            const { image, prompt } = req.body;
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // 3. AI Generation
            console.log("🎬 Creating Video and API...");
            let operation = await genai.models.generateVideos({
                model: 'veo-3.1-generate-preview',
                prompt: prompt,
                image: { imageBytes: base64Data, mimeType: 'image/png' }
            });

            while (!operation.done) {
                await new Promise(r => setTimeout(r, 5000));
                operation = await genai.operations.getVideosOperation({ operation });
            }

            const videoResult = (operation.result || operation.response)?.generatedVideos?.[0];
            if (!videoResult) throw new Error("API returned no video result.");

            // 4. Handle Video Data
            let videoBuffer;
            let finalBase64String;

            if (videoResult.video?.uri) {
                const vidResponse = await fetch(videoResult.video.uri, {
                    headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY }
                });
                videoBuffer = Buffer.from(await vidResponse.arrayBuffer());
                finalBase64String = videoBuffer.toString('base64');
            } else {
                finalBase64String = videoResult.video?.imageBytes || videoResult.video?.bytesBase64Encoded;
                videoBuffer = Buffer.from(finalBase64String, 'base64');
            }

            // ============================================================
            // 5. CHANGE: Save File (Adjusted for consistency & Native FS)
            // ============================================================
            const filename = `video_${Date.now()}.mp4`;
            
            // CHANGED: Use 'public/videos' to match your Drive Controller logic
            const saveDir = path.join(__dirname, '..', 'public', 'videos'); 
            const savePath = path.join(saveDir, filename);
            
            // CHANGED: URL must match the public folder structure
            const publicUrl = `/videos/${filename}`; 

            // CHANGED: Use standard fs.mkdirSync (recursive) instead of fs-extra
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }
            
            await fs.promises.writeFile(savePath, videoBuffer);
            console.log("✅ File saved to:", savePath);

            // 6. DB Logging
            const finalCost = isAdmin ? 0 : COST_PER_VIDEO;
            const insertSql = 'INSERT INTO generated_videos (user_id, file_path, prompt, credit_cost) VALUES (?, ?, ?, ?)';
            
            db.query(insertSql, [userId, publicUrl, prompt, finalCost], (insErr) => {
                if (insErr) console.error("❌ Insert error:", insErr);

                // Prepare response object
                // CHANGED: key is now 'video_path' to match frontend request
                const responsePayload = { 
                    status: 'success', 
                    video_b64: finalBase64String, 
                    video_path: publicUrl, // <--- Matching Frontend
                    remaining_credits: isAdmin ? 'Unlimited' : (userSub.credit - COST_PER_VIDEO)
                };

                if (isAdmin) {
                    return res.json(responsePayload);
                }

                const updateSql = 'UPDATE subscriptions_combined SET credit = credit - ? WHERE subscription_id = ?';
                db.query(updateSql, [COST_PER_VIDEO, userSub.subscription_id], () => {
                    res.json(responsePayload);
                });
            });

        } catch (error) {
            console.error("❌ Generation Error:", error);
            res.status(500).json({ error: error.message });
        }
    });
};