// controllers/aicontroller.js
const { GoogleGenAI } = require('@google/genai'); 
const fs = require('fs-extra');
const path = require('path');

const genai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY 
});

exports.animateImage = async (req, res) => {
    try {
        const { image, prompt } = req.body;

        if (!image || !prompt) {
            return res.status(400).json({ error: 'Missing image or prompt' });
        }

        console.log(`🎬 Request received: "${prompt.substring(0, 30)}..."`);
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        // 1. Start the Video Generation
        // We use 'imageBytes' (Fixed from previous turn)
        let operation = await genai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            image: {
                imageBytes: base64Data,
                mimeType: 'image/png'
            }
        });

        console.log("⏳ Video generation started... Waiting for result (~30-50s)");

        // 2. Polling Loop (Fixed for Node.js SDK)
        // We use 'getVideosOperation' instead of the generic 'get'
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
            
            // FIX: Pass the entire operation object to the helper
            operation = await genai.operations.getVideosOperation({
                operation: operation
            });
            
            process.stdout.write("."); // Show progress
        }
        console.log(" Done!");

        // 3. Extract Result
        // The result is nested in the final operation object
        const videoResult = operation.result?.generatedVideos?.[0];
        const videoData = videoResult?.video?.imageBytes || videoResult?.video?.bytesBase64Encoded;

        if (!videoData) {
            console.log("⚠️ Full Debug:", JSON.stringify(operation, null, 2));
            throw new Error("No video data returned. The prompt might have been blocked by safety filters.");
        }

        const videoBuffer = Buffer.from(videoData, 'base64');

        // 4. Save & Respond
        const filename = `video_${Date.now()}.mp4`;
        const savePath = path.join(__dirname, '../static/generated', filename);
        
        await fs.ensureDir(path.dirname(savePath));
        await fs.writeFile(savePath, videoBuffer);
        console.log(`✅ Video saved: ${filename}`);

        res.json({
            status: 'success',
            video_b64: videoData,
            video_url: `/static/generated/${filename}`
        });

    } catch (error) {
        console.error("\n❌ Generation Error:", error);
        res.status(500).json({ error: error.message || "Failed to generate video" });
    }
};