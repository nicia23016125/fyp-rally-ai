const db = require('../db');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// --- FFmpeg Setup ---
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

exports.trimVideo = (req, res) => {
    console.log("✂️ TRIM REQUEST RECEIVED:", req.body); // Debugging

    const { videoUrl, startTime, endTime } = req.body;
    
    // Safety Check: User must be logged in
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.session.user.userId;

    // Validation
    if (!videoUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: "Missing parameters (videoUrl, startTime, or endTime)" });
    }

    // 1. Resolve Input Path
    let inputPath = "";
    
    // CASE A: It's a web URL (Cloudinary or External)
    if (videoUrl.startsWith('http')) {
        inputPath = videoUrl;
    } 
    // CASE B: It's a local file (e.g., "/images/video.mp4")
    else {
        // Remove leading slash if present to join correctly
        const cleanUrl = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
        inputPath = path.join(__dirname, '../public', cleanUrl);
    }

    // 2. Prepare Output Path (Save locally to public/images)
    const outputFileName = `trimmed_${Date.now()}_${userId}.mp4`;
    const localOutputPath = path.join(__dirname, '../public/images', outputFileName);
    const webOutputPath = `/images/${outputFileName}`;

    // Calculate duration
    const duration = parseFloat(endTime) - parseFloat(startTime);
    if (duration <= 0) return res.status(400).json({ error: "End time must be after start time." });

    console.log(`🎬 Processing: ${inputPath} -> ${localOutputPath}`);

    // 3. Run FFmpeg
    ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(localOutputPath)
        .on('end', () => {
            console.log("✅ Trim Successful");

            // 4. Save to Database so it appears in library
            // Adjust table name 'generated_videos' if you store uploaded clips elsewhere
            const sql = 'INSERT INTO generated_videos (user_id, prompt, file_path) VALUES (?, ?, ?)';
            const promptText = `Trimmed clip (${startTime}s - ${endTime}s)`;

            db.query(sql, [userId, promptText, webOutputPath], (err) => {
                if (err) {
                    console.error("❌ DB Save Error:", err);
                    // Even if DB fails, the file exists, so we return success to frontend
                    return res.json({ success: true, newUrl: webOutputPath, warning: "Saved to disk but DB failed." });
                }
                res.json({ success: true, newUrl: webOutputPath });
            });
        })
        .on('error', (err) => {
            console.error("❌ FFmpeg Error:", err);
            res.status(500).json({ error: "Failed to process video. FFmpeg error." });
        })
        .run();
};
// =========================================================
// 1. GET LIBRARY: Display videos with DEBUGGING
exports.getLibrary = (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');
    const userId = req.session.user.userId;

    const userSql = 'SELECT * FROM users WHERE userId = ?';
    db.query(userSql, [userId], (error, userResults) => {
        if (error) return res.status(500).send("Database error");

        // Query 1: Source Clips (generated_videos)
        const vidSql = 'SELECT * FROM generated_videos WHERE user_id = ? ORDER BY created_at DESC';
        db.query(vidSql, [userId], (vidError, vidResults) => {
            if (vidError) return res.status(500).send("Error loading clips");

            // Query 2: Merged Projects (edited_videos)
            const mergedSql = 'SELECT * FROM edited_videos WHERE user_id = ? AND edit_type = "merged" ORDER BY created_at DESC';
            db.query(mergedSql, [userId], (mergedError, mergedResults) => {
                if (mergedError) return res.status(500).send("Error loading merged videos");

                // Helper to normalize paths
                const normalize = (vid, isMerged = false) => {
                    let rawPath = vid.file_path || vid.video_url || vid.url || '';
                    let normalized = rawPath.replace(/\\/g, '/');
                    // Ensure leading slash
                    if (!normalized.startsWith('/') && !normalized.startsWith('http')) {
                        normalized = '/' + normalized;
                    }
                    return {
                        ...vid,
                        cleanUrl: normalized,
                        displayName: vid.project_name || vid.prompt || `Video ${vid.id}`
                    };
                };

                res.render('mergeVideos', { 
                    user: req.session.user,
                    userProfile: userResults[0],
                    videos: (vidResults || []).map(v => normalize(v)), 
                    mergedVideos: (mergedResults || []).map(v => normalize(v, true)), // New data
                    message: req.query.success ? "Merge successful!" : null,
                    videoUrl: req.query.videoUrl || null
                });
            });
        });
    });
};// =========================================================
// ✅ ERROR FIX: Ensure this closing brace and semicolon exist!
// =========================================================
// 2. MERGE VIDEOS: Handle the merge
// =========================================================

exports.mergeVideos = (req, res) => {
    console.log("Form Body Received:", req.body); 

    if (!req.session || !req.session.user) return res.redirect('/login');
    const userId = req.session.user.userId;

    let { orderedPaths } = req.body;
    
    // 1. Robust cleanup of the input array
    let videoList = [];
    if (Array.isArray(orderedPaths)) {
        videoList = orderedPaths.filter(p => p && p.trim() !== "");
    } else if (orderedPaths && typeof orderedPaths === 'string') {
        videoList = [orderedPaths];
    }

    if (videoList.length < 2) {
        return res.status(400).send("Error: Received fewer than 2 videos. Please try again.");
    }

    // 2. Setup Paths
    const outputFileName = `merged_${Date.now()}.mp4`;
    
    // Ensure Output Directory Exists (Safety Check)
    const outputDir = path.join(__dirname, '../public/output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const absoluteOutputPath = path.join(outputDir, outputFileName);
    const publicUrl = `/output/${outputFileName}`; // This is what goes in the DB
    const tempDir = path.join(__dirname, '../temp');

    // Ensure Temp Directory Exists
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    // 3. Prepare FFmpeg Command
    const command = ffmpeg();
    let validFilesCount = 0;

    console.log("--- PROCESSING MERGE ---");

    videoList.forEach((webUrl) => {
        // Convert Web URL back to File System Path
        // Remove leading slash: /output/abc.mp4 -> output/abc.mp4
        let cleanPath = webUrl.startsWith('/') ? webUrl.substring(1) : webUrl;
        
        // Handle OS specific slashes
        cleanPath = cleanPath.replace(/\//g, path.sep); 

        const absoluteInputPath = path.join(__dirname, '../public', cleanPath);
        
        console.log(`Checking file: ${absoluteInputPath}`);

        if (fs.existsSync(absoluteInputPath)) {
            command.input(absoluteInputPath);
            validFilesCount++;
        } else {
            console.log(`Failed to find file: ${absoluteInputPath}`);
        }
    });

    if (validFilesCount < 2) {
        return res.status(400).send("Server could not locate the video files on disk.");
    }

    // 4. Run Merge
    command
        .on('error', (err) => {
            console.error('FFmpeg Error:', err.message);
            res.status(500).send("Merging failed: " + err.message);
        })
        .on('end', () => {
            console.log('Merge complete!');
            
            // ✅ 5. SAVE TO NEW TABLE (edited_videos)
            const sql = 'INSERT INTO edited_videos (user_id, file_path, edit_type, project_name) VALUES (?, ?, ?, ?)';
            
            db.query(sql, [userId, publicUrl, 'merged', 'Merged Sequence'], (err) => {
                if (err) {
                    console.error("Database Insert Error:", err);
                } 
                // Redirect back to library with the success message
                res.redirect(`/edit-library?success=true&videoUrl=${publicUrl}`);
            });
        })
        .mergeToFile(absoluteOutputPath, tempDir);
};
// =========================================================
// 3. POSTING: Renders the main video gallery page
// =========================================================
exports.posting = (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.userId;

    // Query 1: Get User Details
    const userSql = 'SELECT * FROM users WHERE userId = ?';
    db.query(userSql, [userId], (error, userResults) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user profile');
        }

        if (userResults.length > 0) {
            // Query 2: Get Active Subscription
            const subSql = 'SELECT * FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';
            db.query(subSql, [userId], (subError, subResults) => {
                const subscription = (subResults && subResults.length > 0) ? subResults[0] : null;

                // Query 3: Get Generated Videos
                const vidSql = 'SELECT * FROM generated_videos WHERE user_id = ? ORDER BY created_at DESC';
                db.query(vidSql, [userId], (vidError, vidResults) => {
                    const videos = vidResults || [];

                    res.render('video', { 
                        userProfile: userResults[0], 
                        subscription: subscription,
                        videos: videos,
                        session: req.session 
                    });
                });
            });
        } else {
            res.status(404).send('User not found');
        }
    });
};

// =========================================================
// 4. AI ADVICE: Handles AI Advice requests via n8n
// =========================================================
exports.getAiPromptAdvice = async (req, res) => {
    try {
        const { video_id, user_query } = req.body;

        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Please log in to use AI features' });
        }

        const userId = req.session.user.userId;

        // Verify ownership: Ensure this video belongs to the logged-in user
        const checkSql = 'SELECT * FROM generated_videos WHERE video_id = ? AND user_id = ?';
        db.query(checkSql, [video_id, userId], async (err, results) => {
            if (err) {
                console.error('Database Error:', err.message);
                return res.status(500).json({ error: 'Database verification failed' });
            }

            if (results.length === 0) {
                return res.status(403).json({ error: 'Unauthorized: Video not found' });
            }

            const originalPrompt = results[0].prompt;
            const n8nUrl = 'https://n8ngc.codeblazar.org/webhook/4091fa09-fb9a-4039-9411-7104d213f601/chat';

            try {
                const response = await axios.post(n8nUrl, {
                    video_id: video_id,
                    user_query: user_query,
                    original_prompt: originalPrompt
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                res.status(200).json(response.data);
            } catch (axiosError) {
                console.error('n8n Connection Error:', axiosError.message);
                res.status(502).json({ error: 'AI service unavailable' });
            }
        });
    } catch (error) {
        console.error('System Error:', error.message);
        res.status(500).json({ error: 'Internal error' });
    }
};