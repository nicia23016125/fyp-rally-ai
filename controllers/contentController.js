const db = require('../db'); 

exports.index = (req, res) => {
    // We use UNION ALL to combine "Edited Projects" and "Raw Generated Videos"
    const sql = `
        SELECT 
            combined.id,
            combined.file_path,
            combined.title,
            combined.type,
            combined.created_at,
            u.username, 
            u.userImage 
        FROM (
            -- 1. Get Edited Videos
            SELECT 
                edit_id AS id, 
                file_path, 
                project_name AS title, 
                edit_type AS type, 
                created_at, 
                user_id 
            FROM edited_videos
            
            UNION ALL
            
            -- 2. Get Raw Generated Videos
            SELECT 
                video_id AS id, 
                file_path, 
                prompt AS title, 
                'generated' AS type, 
                created_at, 
                user_id 
            FROM generated_videos
        ) AS combined
        JOIN users u ON combined.user_id = u.userId
        ORDER BY combined.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).send("Error retrieving content");
        }

        res.render('contentitems', { 
            videos: results,
            pageTitle: "All User Content"
        });
    });
};
// Get a specific content item by ID (Checks BOTH tables)
// Get a specific content item by ID (Checks BOTH tables)
// Get ALL content for a specific User ID
// Get ONLY Edited Content (Merged/Trimmed) for a specific User ID
// Get ONLY Edited Content for a specific User ID
exports.getContentByUserId = (req, res) => {
    const targetUserId = req.params.userId;
    
    const sql = `
        SELECT 
            ev.edit_id AS id, 
            ev.file_path, 
            ev.project_name AS title, 
            ev.edit_type AS type, 
            ev.created_at, 
            u.username, 
            u.userImage 
        FROM edited_videos ev
        LEFT JOIN users u ON ev.user_id = u.userId
        WHERE ev.user_id = ? 
        ORDER BY ev.created_at DESC
    `;

    db.query(sql, [targetUserId], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).send("Error retrieving user content");
        }

        // ✅ CORRECT: Render 'contentitems' (The List View), NOT 'viewContentItems'
        res.render('viewContentItems', { 
            videos: results, 
            pageTitle: `Projects for User ID: ${targetUserId}`
        });
    });
};