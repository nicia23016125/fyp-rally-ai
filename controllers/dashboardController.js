const db = require('../db');

exports.index = (req, res) => {
    // Only admins can view the dashboard
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }

    const queries = [
        'SELECT COUNT(*) AS totalUsers FROM users',
        'SELECT COUNT(*) AS totalSubscriptions FROM subscription',
        'SELECT COUNT(*) AS totalReviews FROM reviews',
        'SELECT COUNT(*) AS totalCartItems FROM cart_items',
        'SELECT * FROM subscription ORDER BY subscription_id DESC LIMIT 5'
    ];

    Promise.all(
        queries.map(sql => new Promise((resolve, reject) => {
            db.query(sql, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        }))
    ).then(([usersRes, ticketsRes, reviewsRes, cartItemsRes, latestTickets]) => {
        const data = {
            totalUsers: usersRes[0] ? usersRes[0].totalUsers : 0,
            totalSubscriptions: ticketsRes[0] ? ticketsRes[0].totalSubscriptions : 0,
            totalReviews: reviewsRes[0] ? reviewsRes[0].totalReviews : 0,
            totalCartItems: cartItemsRes[0] ? cartItemsRes[0].totalCartItems : 0,
            latestSubscriptions: latestTickets || []
        };

        res.render('dashboard', { session: req.session, data });
    }).catch(err => {
        console.error('Dashboard DB error:', err);
        res.status(500).send('Database error loading dashboard');
    });
};
