const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs-extra');
const path = require('path');
const db = require('../db'); // Ensure this matches your actual db file path
const axios = require('axios');
const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY 
});



// ==========================================
// FILE: controllers/videoController.js
// ==========================================
// Note: Ensure you have the latest SDK installed:
// npm install @google/genai
exports.generateNanoImage = async (req, res) => {
    // 1. Auth Check
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please log in.' });
    }

    const userId = req.session.user.userId;
    const userRole = req.session.user.userRole;
    const isAdmin = (userRole === 'admin');
    const COST_PER_IMAGE = 1.00;
    const DAILY_LIMIT = 20;

    // 2. Get User's Daily Usage & Subscription
    // ✅ FIX: Changed 'WHERE id = ?' to 'WHERE userId = ?'
    const userSql = 'SELECT daily_gen_count, last_gen_date FROM users WHERE userId = ?';
    const subSql = 'SELECT credit, subscription_id FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';

    try {
        const [userRows, subRows] = await Promise.all([
            new Promise((resolve, reject) => db.query(userSql, [userId], (err, res) => err ? reject(err) : resolve(res))),
            new Promise((resolve, reject) => db.query(subSql, [userId], (err, res) => err ? reject(err) : resolve(res)))
        ]);

        const userData = userRows[0];
        const userSub = subRows[0];

        // --- DAILY LIMIT LOGIC ---
        const todayStr = new Date().toISOString().split('T')[0]; 
        let currentDailyCount = userData.daily_gen_count || 0;
        
        // Lazy Reset: If last gen date is not today, treat count as 0
        if (userData.last_gen_date && userData.last_gen_date.toISOString().split('T')[0] !== todayStr) {
            currentDailyCount = 0;
        }

        const isFreeGeneration = (currentDailyCount < DAILY_LIMIT);

        // 3. Validation
        if (!isAdmin && !isFreeGeneration) {
            if (!userSub) {
                return res.status(403).json({ error: `You have used your ${DAILY_LIMIT} free daily images. Please subscribe.` });
            }
            if (userSub.credit < COST_PER_IMAGE) {
                return res.status(403).json({ error: "Daily limit reached and insufficient credits." });
            }
        }

        console.log(`🚀 User ${userId} | Used: ${currentDailyCount}/${DAILY_LIMIT} | Mode: ${isFreeGeneration ? 'FREE' : 'PAID'}`);

        // 4. Generate Image (Nano Banana)
        const { prompt } = req.body;
        const response = await genai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: prompt
        });

        let finalBase64 = "";
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    finalBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (!finalBase64) throw new Error("Model generated text instead of image.");

        // 5. Save to History
        const saveSql = 'INSERT INTO generation_history (user_id, prompt, image_base64) VALUES (?, ?, ?)';
        db.query(saveSql, [userId, prompt, finalBase64], (err) => {
            if (err) console.error("⚠️ History Save Error:", err.message);
        });

        // 6. UPDATE USAGE
        if (isFreeGeneration) {
            // Free Mode: Increment Count
            const newCount = (userData.last_gen_date && userData.last_gen_date.toISOString().split('T')[0] === todayStr) 
                             ? currentDailyCount + 1 
                             : 1;

            // ✅ FIX: Changed 'WHERE id = ?' to 'WHERE userId = ?'
            const updateDailySql = 'UPDATE users SET daily_gen_count = ?, last_gen_date = ? WHERE userId = ?';
            db.query(updateDailySql, [newCount, todayStr, userId]);
            
            return res.json({
                status: 'success',
                image_base64: finalBase64,
                cost: 0,
                remaining_credits: userSub ? userSub.credit : 'Free Tier',
                msg: `Free usage: ${newCount}/${DAILY_LIMIT}`
            });

        } else if (!isAdmin) {
            // Paid Mode: Deduct Credits
            const updateCreditSql = 'UPDATE subscriptions_combined SET credit = credit - ? WHERE subscription_id = ?';
            db.query(updateCreditSql, [COST_PER_IMAGE, userSub.subscription_id]);

            return res.json({
                status: 'success',
                image_base64: finalBase64,
                cost: COST_PER_IMAGE,
                remaining_credits: userSub.credit - COST_PER_IMAGE
            });
        } 
        
        // Admin Case
        res.json({ status: 'success', image_base64: finalBase64, cost: 0, remaining_credits: 'Unlimited' });

    } catch (error) {
        console.error("❌ Generation Error:", error.message);
        res.status(500).json({ error: "Generation failed." });
    }
};

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