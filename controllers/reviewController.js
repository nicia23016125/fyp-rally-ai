const db = require('../db');

// ADD REVIEW
exports.addReview = (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Please log in to leave a review.');
        return res.redirect('/login');
    }

    const { content_id, rating, comment } = req.body;
    const userId = req.session.user.userId;
    const userName = req.session.user.username; // Assuming username is in session

    const sql = 'INSERT INTO reviews (reviewedByUserId, contentId, rating, comment) VALUES (?, ?, ?, ?)';
    
    db.query(sql, [userId, content_id, rating, comment], (err, result) => {
        if (err) {
            console.error('Error adding review:', err);
            return res.status(500).send('Database error: ' + err.message);
        }

        // --- n8n Alert Logic ---
        // Trigger only for low ratings (1 or 2 stars)
        if (parseInt(rating) < 3) {
            fetch('https://n8ngc.codeblazar.org/webhook/0c895076-989e-46b6-af32-e9ecf663d52f', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'LOW_RATING_ALERT',
                    user: userName,
                    rating: rating,
                    comment: comment,
                    contentId: content_id,
                    timestamp: new Date().toISOString()
                })
            })
            .then(() => console.log('Low rating alert sent to n8n.'))
            .catch(err => console.error('Failed to trigger n8n alert:', err));
        }
        // -----------------------

        req.flash('success', 'Review added successfully!');
        res.redirect('back');
    });
};

// GET /content/:id/reviews
exports.getReviews = (req, res) => {
    const contentId = req.params.id || 1; 

    // SCHEMA MATCH: Sorts by 'createdAt'
    const sql = `
        SELECT reviews.*, users.username 
        FROM reviews 
        JOIN users ON reviews.reviewedByUserId = users.userId 
        WHERE contentId = ? 
        ORDER BY createdAt DESC
    `;

    db.query(sql, [contentId], (err, results) => {
        if (err) {
            console.error('Error fetching reviews:', err);
            return res.status(500).send('Error loading reviews');
        }

        // Calculate Stats using 'rating'
        let totalStars = 0;
        let starCounts = { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 };

        results.forEach(review => {
            const r = parseInt(review.rating); // Uses 'rating'
            totalStars += r;
            
            if (r >= 1 && r <= 5) {
                starCounts['star' + r]++;
            }
        });

        const stats = {
            totalReviews: results.length,
            avgRating: results.length > 0 ? (totalStars / results.length).toFixed(1) : 0,
            ...starCounts
        };

        res.render('viewreviews', { 
            reviews: results, 
            stats: stats, 
            contentId: contentId,
            session: req.session 
        });
    });
};

// EDIT REVIEW
exports.editReview = (req, res) => {
    if (!req.session.user) return res.status(403).send('Unauthorized');

    const { rating, comment, review_id } = req.body;
    const userId = req.session.user.userId;

    // SCHEMA MATCH: Updates 'rating'
    const sql = 'UPDATE reviews SET rating = ?, comment = ? WHERE reviewId = ? AND reviewedByUserId = ?';
    
    db.query(sql, [rating, comment, review_id, userId], (err, result) => {
        if (err) {
            console.error('Error updating review:', err);
            return res.status(500).send('Database error.');
        }
        res.redirect('back');
    });
};

// DELETE REVIEW
exports.deleteReview = (req, res) => {
    if (!req.session.user) return res.status(403).send('Unauthorized');

    const id = req.params.id;
    const userId = req.session.user.userId;

    let sql = 'DELETE FROM reviews WHERE reviewId = ? AND reviewedByUserId = ?';
    let params = [id, userId];

    if (req.session.user.userRole === 'admin') {
        sql = 'DELETE FROM reviews WHERE reviewId = ?';
        params = [id];
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error deleting review:', err);
            return res.status(500).send('Database error.');
        }
        req.flash('success', 'Review deleted.');
        res.redirect('back');
    });
};