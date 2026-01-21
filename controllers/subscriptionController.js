const db = require('../db');

// CONFIGURATION: Define plans here since the 'subscription_plans' table is gone.
// This acts as the source of truth for your pricing and limits.
const PLAN_CONFIG = {
    '1': { id: '1', name: 'Pay-As-You-Go', price: 0.75, billing: 'per clip', credit: 5.00, limit: 10, template: 'Basic' },
    '2': { id: '2', name: 'Personal', price: 25.00, billing: 'month', credit: 60.00, limit: 100, template: 'Standard' },
    '3': { id: '3', name: 'Production', price: 120.00, billing: 'month', credit: 400.00, limit: 1000, template: 'Premium' }
};

/**
 * GET /subscriptions
 * Automation: Checks 'subscriptions_combined'. 
 * If active sub exists -> Redirects. 
 * If not -> Shows Plans.
 */
exports.getSubscriptions = (req, res) => {
    // Convert PLAN_CONFIG object to an array so the EJS can loop through it
    const plansArray = Object.values(PLAN_CONFIG);

    if (req.session.user) {
        const userId = req.session.user.userId;

        // FIXED: Changed table from 'subscription' to 'subscriptions_combined'
        const checkSubSql = 'SELECT subscription_id FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';
        
        db.query(checkSubSql, [userId], (err, results) => {
            if (err) {
                console.error('Error checking user subscription:', err);
                return res.status(500).send('Database error.');
            }

            // AUTOMATION: If a record exists, instantly redirect to the detail page
            if (results.length > 0) {
                return res.redirect(`/subscription/${results[0].subscription_id}`);
            }

            // If logged in but no active subscription, show history + plans
            // FIXED: Changed table to 'subscriptions_combined'
            const historySql = 'SELECT * FROM subscriptions_combined WHERE user_id = ?';
            db.query(historySql, [userId], (err, history) => {
                if (err) {
                    console.error('Error loading history:', err);
                    return res.status(500).send('Error loading history.');
                }
                
                res.render('viewSubscriptions', { 
                    subscriptions: history, 
                    plans: plansArray, 
                    session: req.session 
                });
            });
        });
    } else {
        // Guest access: Render plans only
        res.render('viewSubscriptions', { 
            subscriptions: [], 
            plans: plansArray, 
            session: req.session 
        });
    }
};

/**
 * POST /subscribe
 * Handles the "Confirm Purchase" button.
 * Logic: Maps the planId to actual data and inserts into 'subscriptions_combined'.


/**
 * GET /subscription/:id
 * Displays the specific details for a single subscription.
 */
// ... existing imports and PLAN_CONFIG ...
// ... existing code ...

/**
 * POST /subscribe
 * Logic: 
 * 1. If User has NO active subscription -> Create new one starting today.
 * 2. If User HAS active subscription -> Extend the End Date & Add Credits.
 */
exports.subscribe = (req, res) => {
    // 1. Ensure user is logged in
    if (!req.session.user) {
        req.flash('error', 'Please log in to purchase a plan.');
        return res.redirect('/login');
    }

    const userId = req.session.user.userId;
    const planId = req.body.planId;
    const durationMonths = parseInt(req.body.months) || 1;

    const selectedPlan = PLAN_CONFIG[planId];

    if (!selectedPlan) {
        return res.status(400).send('Invalid Plan Selected');
    }

    // 2. Check for an EXISTING active subscription to extend
    const checkSql = 'SELECT * FROM subscriptions_combined WHERE user_id = ? AND status = "active" ORDER BY end_date DESC LIMIT 1';

    db.query(checkSql, [userId], (err, results) => {
        if (err) {
            console.error('Database error checking sub:', err);
            return res.status(500).send('Database error.');
        }

        if (results.length > 0) {
            // === SCENARIO A: EXTEND EXISTING SUBSCRIPTION ===
            const existingSub = results[0];

            // 1. Calculate New End Date (Add months to the OLD end date)
            const currentEndDate = new Date(existingSub.end_date);
            const newEndDate = new Date(currentEndDate);
            newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

            // 2. Calculate New Credits (Existing Credits + New Plan Credits)
            // Ensure we treat existing credits as a number
            const currentCredits = parseFloat(existingSub.credit) || 0;
            const addedCredits = selectedPlan.credit * durationMonths;
            const totalCredits = currentCredits + addedCredits;

            // 3. Update the existing row
            const updateSql = `
                UPDATE subscriptions_combined 
                SET end_date = ?, 
                    credit = ?, 
                    plan_name = ?, 
                    ai_generation_limit = ?, 
                    template_access = ? 
                WHERE subscription_id = ?
            `;
            
            const updateValues = [
                newEndDate, 
                totalCredits, 
                selectedPlan.name,      // Update name (in case they upgraded)
                selectedPlan.limit,     // Update limit (in case they upgraded)
                selectedPlan.template,  // Update template access
                existingSub.subscription_id
            ];

            db.query(updateSql, updateValues, (updateErr) => {
                if (updateErr) {
                    console.error('Update error:', updateErr);
                    return res.status(500).send('Error extending subscription.');
                }
                req.flash('success', 'Subscription extended successfully!');
                res.redirect(`/subscription/${existingSub.subscription_id}`);
            });

        } else {
            // === SCENARIO B: CREATE NEW SUBSCRIPTION (Standard Logic) ===
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(startDate.getMonth() + durationMonths);

            const insertSql = `
                INSERT INTO subscriptions_combined 
                (user_id, status, start_date, end_date, plan_name, credit, ai_generation_limit, template_access) 
                VALUES (?, 'active', ?, ?, ?, ?, ?, ?)
            `;
            
            const insertValues = [
                userId, 
                startDate, 
                endDate, 
                selectedPlan.name, 
                selectedPlan.credit * durationMonths, 
                selectedPlan.limit, 
                selectedPlan.template
            ];

            db.query(insertSql, insertValues, (insertErr, result) => {
                if (insertErr) {
                    console.error('Subscription insertion error:', insertErr);
                    return res.status(500).send('Error processing subscription.');
                }

                const newSubId = result.insertId;
                req.flash('success', 'Plan activated!');
                res.redirect(`/subscription/${newSubId}`);
            });
        }
    });
};









exports.getSubscription = (req, res) => {
    const subId = req.params.id;
    const currentUserId = req.session.user ? req.session.user.userId : null;
    
    // 1. THIS IS THE MISSING PART: Prepare the plans data
    const plansArray = Object.values(PLAN_CONFIG); 

    const sql = 'SELECT * FROM subscriptions_combined WHERE subscription_id = ?';
    
    db.query(sql, [subId], (err, results) => {
        if (err) return res.status(500).send('Database error.');
        
        if (results.length > 0) {
            const sub = results[0];
            
            // Security Check
            if (req.session.user && (req.session.user.userRole === 'admin' || sub.user_id === currentUserId)) {
                
                // 2. PASS 'plans' TO THE VIEW
                res.render('viewSubscription', { 
                    subscription: sub, 
                    session: req.session,
                    plans: plansArray // <--- Only now will your EJS code work
                });

            } else {
                res.status(403).send('Unauthorized: You do not own this subscription.');
            }
        } else {
            res.status(404).send('Subscription not found.');
        }
    });
};

// =========================================================
// ADMIN FUNCTIONS (Updated for new Table Schema)
// =========================================================

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
    
    // FIXED: Destructuring new column names
    const { user_id, plan_name, credit, ai_generation_limit, template_access, status, start_date, end_date } = req.body;
    
    // FIXED: SQL uses 'subscriptions_combined' and new columns
    const sql = `INSERT INTO subscriptions_combined (user_id, plan_name, credit, ai_generation_limit, template_access, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const values = [user_id, plan_name, credit, ai_generation_limit, template_access, status || 'active', start_date, end_date];
    
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
    
    // FIXED: Changed table to 'subscriptions_combined'
    const sql = 'SELECT * FROM subscriptions_combined WHERE subscription_id = ?';
    
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
    
    // FIXED: Destructuring new column names
    const { user_id, plan_name, credit, ai_generation_limit, template_access, status, start_date, end_date } = req.body;
    
    // FIXED: Update query uses 'subscriptions_combined' and new columns
    const sql = `UPDATE subscriptions_combined SET user_id=?, plan_name=?, credit=?, ai_generation_limit=?, template_access=?, status=?, start_date=?, end_date=? WHERE subscription_id=?`;
    
    const values = [user_id, plan_name, credit, ai_generation_limit, template_access, status, start_date, end_date, id];
    
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error updating subscription:', err);
            return res.status(500).render('editSubscription', { session: req.session, subscription: req.body, errors: ['Database error'] });
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
    
    // FIXED: Changed table to 'subscriptions_combined'
    const sql = 'DELETE FROM subscriptions_combined WHERE subscription_id = ?';
    
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error deleting subscription:', err);
            return res.status(500).send('Database error');
        }
        res.redirect('/subscriptions');
    });
};