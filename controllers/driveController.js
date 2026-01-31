const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

exports.uploadToFile = async (req, res) => {
    // 1. Check Authentication
    if (!req.session.tokens) {
        return res.status(401).json({ error: 'Please log in to Google first.' });
    }

    // 2. Setup Drive Client properly (Include ID/Secret to allow token refreshing)
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.REDIRECT_URI
    );
    oauth2Client.setCredentials(req.session.tokens);
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        let { fileUrl, fileName } = req.body;
        let mediaBody;

        console.log("📂 Processing upload for:", fileUrl);

        // 3. Determine Source (Local File vs External URL)
        if (fileUrl.startsWith('http')) {
            // Case A: External URL (AI Images)
            const response = await axios.get(fileUrl, { responseType: 'stream' });
            mediaBody = response.data;
        } else {
            // Case B: Local File (Generated Videos)
            
            // Remove leading slash (e.g., "/videos/..." -> "videos/...")
            const cleanPath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
            
            // --- FIX START: Check multiple locations ---
            
            // Path 1: Inside 'public' folder (Standard)
            // Note: We use '..' because we are inside the 'controllers' folder
            const publicPath = path.join(__dirname, '..', 'public', cleanPath);

            // Path 2: Root level folder (e.g., 'videosforindex')
            const rootPath = path.join(__dirname, '..', cleanPath);

            let finalPath;

            if (fs.existsSync(publicPath)) {
                finalPath = publicPath;
            } else if (fs.existsSync(rootPath)) {
                finalPath = rootPath;
            } else {
                // Debugging help
                console.error(`❌ File not found. Checked:\n1. ${publicPath}\n2. ${rootPath}`);
                throw new Error(`Local file not found: ${cleanPath}`);
            }
            // --- FIX END ---

            mediaBody = fs.createReadStream(finalPath);
        }

        // 4. Determine MimeType
        const mimeType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/png';

        const fileMetadata = { name: fileName };
        const media = {
            mimeType: mimeType,
            body: mediaBody,
        };

        // 5. Upload
        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });

        console.log("✅ Upload successful. File ID:", file.data.id);
        res.json({ success: true, fileId: file.data.id });

    } catch (err) {
        console.error('❌ Drive Upload Error:', err.message);
        res.status(500).json({ error: 'Failed to upload: ' + err.message });
    }
};