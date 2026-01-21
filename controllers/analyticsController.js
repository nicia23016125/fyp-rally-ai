const db = require('../db'); // Your database connection

exports.getAdminStats = async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
        // 1. New Users & Subscriptions
        const [userStats] = await db.query(
            `SELECT 
                (SELECT COUNT(*) FROM users WHERE created_at BETWEEN ? AND ?) as newUsers,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND start_date BETWEEN ? AND ?) as newSubs,
                (SELECT SUM(amount) FROM payments WHERE status = 'completed' AND payment_date BETWEEN ? AND ?) as earnings`,
            [startDate, endDate, startDate, endDate, startDate, endDate]
        );

        // 2. Constant Renewals
        const [renewals] = await db.query(
            `SELECT COUNT(*) as count FROM subscriptions 
             WHERE is_renewal = 1 AND start_date BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        // 3. Reviews Breakdown (By Month)
        const [reviews] = await db.query(
            `SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as good,
                SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as bad,
                COUNT(*) as total
             FROM reviews 
             WHERE created_at BETWEEN ? AND ?
             GROUP BY month ORDER BY month ASC`,
            [startDate, endDate]
        );

        res.json({
            summary: userStats[0],
            renewalCount: renewals[0].count,
            reviews: reviews
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};