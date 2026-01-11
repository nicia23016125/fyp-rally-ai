const db = require('../db');

// ADD REVIEW
exports.addReview = (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Please log in to leave a review.');
        return res.redirect('/login');
    }

    const { content_id, rating, comment } = req.body;
    const userId = req.session.user.userId;

    // Corrected column names: reviewedByUserId, contentId, rating, comment
    const sql = 'INSERT INTO reviews (reviewedByUserId, contentId, rating, comment) VALUES (?, ?, ?, ?)';
    
    db.query(sql, [userId, content_id, rating, comment], (err, result) => {
        if (err) {
            console.error('Error adding review:', err);
            return res.status(500).send('Database error: ' + err.message);
        }
        req.flash('success', 'Review added successfully!');
        res.redirect('back');
    });
};

// GET /content/:id/reviews
exports.getReviews = (req, res) => {
    const contentId = req.params.id;

    // Notice: We do NOT check for req.session.user here. 
    // This allows guests to reach this part of the code.

    const reviewsSql = `
        SELECT reviews.*, users.username 
        FROM reviews 
        JOIN users ON reviews.reviewedByUserId = users.userId 
        WHERE contentId = ? 
        ORDER BY created_at DESC`;

    db.query(reviewsSql, [contentId], (err, reviews) => {
        if (err) {
            console.error('Error fetching reviews:', err);
            return res.status(500).send('Database error.');
        }

        const statsSql = `
            SELECT 
                AVG(rating) as avgRating, 
                COUNT(*) as totalReviews,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as star5,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as star4,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as star3,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as star2,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as star1
            FROM reviews WHERE contentId = ?`;

        db.query(statsSql, [contentId], (err, statsResults) => {
            if (err) {
                console.error('Error fetching statistics:', err);
                return res.status(500).send('Database error.');
            }

            // We pass session to the view. If session.user is null, 
            // the view will know the user is a guest.
            res.render('viewReviews', { 
                reviews: reviews, 
                stats: statsResults[0], 
                contentId: contentId,
                session: req.session 
            });
        });
    });
};

// EDIT REVIEW
exports.editReview = (req, res) => {
    if (!req.session.user) return res.status(403).send('Unauthorized');

    const { rating, comment, review_id } = req.body;
    const userId = req.session.user.userId;

    // Updated WHERE clause to use reviewId and reviewedByUserId
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