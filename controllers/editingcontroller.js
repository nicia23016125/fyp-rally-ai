const db = require('../db'); 
const axios = require('axios');

// Renders the main video gallery page
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

// Handles AI Advice requests via n8n
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