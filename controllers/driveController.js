// controllers/driveController.js
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

exports.uploadToFile = async (req, res) => {
    // 1. Check Authentication
    if (!req.session.tokens) {
        return res.status(401).json({ error: 'Please log in to Google first.' });
    }

    // 2. Setup Drive Client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials(req.session.tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        let { fileUrl, fileName } = req.body;
        let mediaBody;

        console.log("📂 processing upload for:", fileUrl);

        // 3. Determine Source (Local File vs External URL)
        if (fileUrl.startsWith('http')) {
            // Case A: It's an external URL (like Pollinations.ai) -> Use Axios
            const response = await axios.get(fileUrl, { responseType: 'stream' });
            mediaBody = response.data;
        } else {
            // Case B: It's a local file (on your computer) -> Use File System (fs)
            
            // Clean up the path: remove leading slash if present (e.g. "/images/..." -> "images/...")
            const cleanPath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
            
            // Construct absolute path assuming your app.js is in the root
            // If your files are in "public", usually the DB stores "images/vid.mp4" or "/images/vid.mp4"
            // We look inside the "public" folder.
            let localPath = path.join(__dirname, '..', 'public', cleanPath);

            // Fallback: If the path in DB already includes "public", don't add it again
            if (!fs.existsSync(localPath)) {
                localPath = path.join(__dirname, '..', cleanPath);
            }

            if (!fs.existsSync(localPath)) {
                throw new Error(`Local file not found at: ${localPath}`);
            }

            mediaBody = fs.createReadStream(localPath);
        }

        // 4. Determine MimeType
        const mimeType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/png';

        const fileMetadata = { name: fileName };
        const media = {
            mimeType: mimeType,
            body: mediaBody,
        };

        // 5. Upload to Google Drive
        const file = await drive.files.create({
            requestBody: fileMetadata, // Note: 'requestBody' is the modern field name, 'resource' is older
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