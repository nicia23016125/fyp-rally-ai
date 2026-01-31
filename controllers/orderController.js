const db = require('../db');

// Get orders for the currently logged-in user
exports.getmyOrders = (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const userId = req.session.user.userId;

    // Updated query: assumes table 'orders' with subscription purchases
    const sql = `
        SELECT o.order_id, o.user_id, u.username, o.plan_name, o.amount_paid,
               o.order_date, o.duration_months
        FROM orders o
        JOIN users u ON o.user_id = u.userId
        WHERE o.user_id = ?
        ORDER BY o.order_date DESC;
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).send('Error retrieving your orders');

        let totalAmount = results.reduce((sum, r) => sum + r.amount_paid, 0);

        res.render('viewOrders', {
            orders: results,
            totalAmount,
            msg: results.length ? "" : "No orders"
        });
    });
};

// Get all orders (admin view)
exports.getOrders = (req, res) => {
    // Admin query: fetch all orders joined with users
    const sql = `
        SELECT o.order_id, o.user_id, u.username, o.plan_name, o.amount_paid,
               o.order_date, o.duration_months
        FROM orders o
        JOIN users u ON o.user_id = u.userId
        ORDER BY o.order_date DESC;
    `;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).send('Error retrieving all orders');

        let totalAmount = results.reduce((sum, r) => sum + r.amount_paid, 0);

        res.render('viewOrders', {
            orders: results,
            totalAmount,
            msg: results.length ? "" : "No orders"
        });
    });
};
