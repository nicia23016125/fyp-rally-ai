const db = require('../db');

/**
 * GET /subscriptions
 * Automation: If logged in and has a subscription, redirects to /subscription/:id
 * Otherwise, shows available plans.
 */
exports.getSubscriptions = (req, res) => {
    // 1. Check if the user is logged in
    if (req.session.user) {
        const userId = req.session.user.userId;

        // 2. Query to see if this specific user already has a subscription
        const checkSubSql = 'SELECT subscription_id FROM subscription WHERE user_id = ? LIMIT 1';
        
        db.query(checkSubSql, [userId], (err, results) => {
            if (err) {
                console.error('Error checking user subscription:', err);
                return res.status(500).send('Database error.');
            }

            // 3. AUTOMATION: If a record exists, instantly redirect to the detail page
            if (results.length > 0) {
                return res.redirect(`/subscription/${results[0].subscription_id}`);
            }

            // 4. Logged in but no subscription? Render plans
            renderGeneralPlans(req, res);
        });
    } else {
        // 5. Guest access: Render plans
        renderGeneralPlans(req, res);
    }
};

/**
 * POST /subscribe
 * Handles the "Confirm Purchase" button click from the dropdown form.
 */
exports.subscribe = (req, res) => {
    // 1. Ensure user is logged in
    if (!req.session.user) {
        req.flash('error', 'Please log in to purchase a plan.');
        return res.redirect('/login');
    }

    const userId = req.session.user.userId;
    const planId = req.body.planId; // From the hidden input in your EJS
    
    // 2. Calculate dates (30-day duration)
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 30);

    // 3. Insert into the database
    const sql = 'INSERT INTO subscription (user_id, plan_id, status, start_date, end_date) VALUES (?, ?, "active", ?, ?)';
    
    db.query(sql, [userId, planId, startDate, endDate], (err, result) => {
        if (err) {
            console.error('Subscription insertion error:', err);
            return res.status(500).send('Error processing subscription.');
        }

        // 4. REDIRECT: Sends the user to their new automated ID page
        const newSubId = result.insertId;
        req.flash('success', 'Plan activated!');
        res.redirect(`/subscription/${newSubId}`);
    });
};

/**
 * GET /subscription/:id
 * Displays the specific details for a single subscription.
 */
exports.getSubscription = (req, res) => {
    const subId = req.params.id;
    const currentUserId = req.session.user ? req.session.user.userId : null;

    const sql = 'SELECT * FROM subscription WHERE subscription_id = ?';
    
    db.query(sql, [subId], (err, results) => {
        if (err) return res.status(500).send('Database error.');
        
        if (results.length > 0) {
            const sub = results[0];
            
            // SECURITY: Only the owner or an admin can view this specific ID
            if (req.session.user && (req.session.user.userRole === 'admin' || sub.user_id === currentUserId)) {
                res.render('viewSubscription', { subscription: sub, session: req.session });
            } else {
                res.status(403).send('Unauthorized: You do not own this subscription.');
            }
        } else {
            res.status(404).send('Subscription not found.');
        }
    });
};

/**
 * Helper: Fetches plans to keep the main code clean.
 */
function renderGeneralPlans(req, res) {
    const sql = 'SELECT * FROM subscription_plans';
    db.query(sql, (err, plans) => {
        if (err) return res.status(500).send('Error loading plans.');
        
        // Render the combined view (Table for admins, Cards for users)
        res.render('viewSubscriptions', { 
            subscriptions: [], // Empty since we didn't find a personal sub
            plans: plans, 
            session: req.session 
        });
    });
}
// Admin: show add form
exports.addSubscriptionForm = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }
    res.render('addSubscription', { session: req.session, errors: [] });
};

// Admin: create subscription
exports.createSubscription = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }
    const { user_id, plan_id, status, start_date, end_date } = req.body;
    const sql = 'INSERT INTO subscription (user_id, plan_id, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)';
    const values = [user_id, plan_id, status || 'active', start_date || null, end_date || null];
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error creating subscription:', err);
            return res.status(500).render('addSubscription', { session: req.session, errors: ['Database error'] });
        }
        res.redirect('/subscriptions');
    });
};

// Admin: edit form
exports.editSubscriptionForm = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }
    const id = req.params.id;
    const sql = 'SELECT * FROM subscription WHERE subscription_id = ?';
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Error fetching subscription for edit:', err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) return res.status(404).send('Subscription not found');
        res.render('editSubscription', { session: req.session, subscription: results[0], errors: [] });
    });
};

// Admin: update subscription
exports.updateSubscription = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }
    const id = req.params.id;
    const { user_id, plan_id, status, start_date, end_date } = req.body;
    const sql = 'UPDATE subscription SET user_id = ?, plan_id = ?, status = ?, start_date = ?, end_date = ? WHERE subscription_id = ?';
    const values = [user_id, plan_id, status || 'active', start_date || null, end_date || null, id];
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error updating subscription:', err);
            return res.status(500).render('editSubscription', { session: req.session, subscription: { subscription_id: id, user_id, plan_id, status, start_date, end_date }, errors: ['Database error'] });
        }
        res.redirect('/subscriptions');
    });
};

// Admin: delete subscription
exports.deleteSubscription = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== 'admin') {
        return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
    }
    const id = req.params.id;
    const sql = 'DELETE FROM subscription WHERE subscription_id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error deleting subscription:', err);
            return res.status(500).send('Database error');
        }
        res.redirect('/subscriptions');
    });
};