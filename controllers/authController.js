const axios = require('axios');

exports.googleLogin = (req, res) => {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    
    // Check if there is a 'state' param passed from the frontend (contains the return path & file info)
    const state = req.query.state || null;

    const options = {
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.GOOGLE_CLIENT_ID,
        access_type: 'offline',
        response_type: 'code',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.file' // Required to upload files
        ].join(' '),
        state: state // Pass the file/return info to Google so we get it back later
    };

    res.redirect(`${rootUrl}?${new URLSearchParams(options)}`);
};

exports.googleCallback = async (req, res) => {
    const { code, state } = req.query;

    try {
        // 1. Exchange code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: process.env.REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        const tokens = tokenResponse.data;

        // 2. Get user info
        const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        // 3. Save to session
        req.session.userGoogle = userRes.data; // Optional: store Google profile separately
        req.session.tokens = tokens; // CRITICAL: Used by driveController

        // 4. Handle "Autosave" Redirect
        if (state) {
            try {
                const stateData = JSON.parse(decodeURIComponent(state));
                const returnTo = stateData.returnTo || '/chat'; 

                if (stateData.action === 'save_to_drive') {
                    // Redirect back to Profile with flags to trigger the immediate upload
                    return res.redirect(`${returnTo}?autosave=true&fileUrl=${encodeURIComponent(stateData.fileUrl)}`);
                }
            } catch (e) {
                console.error("State parsing failed", e);
            }
        }

        res.redirect('/chat'); // Default fallback

    } catch (error) {
        console.error('Auth error:', error.response?.data || error.message);
        res.redirect('/login?error=google_auth_failed');
    }
};