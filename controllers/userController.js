const db = require('../db');

exports.getUser = (req, res) => {
    const userId = req.params.id;
    const sql = 'SELECT * FROM users WHERE userId = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving users');
        }

        if (results.length > 0) {
            res.render('viewUser', { userProfile: results[0] });
        } else {
            res.status(404).send('User not found');
        }
    });
};

exports.getUsers = (req, res) => {
    const sql = 'SELECT * FROM users';

    db.query(sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving users');
        }

        res.render('viewAllUsers', { users: results.length > 0 ? results : [] });
    });
};

exports.loginForm = (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
};

exports.login = (req, res) => {
    const { userEmail, userPassword } = req.body;

    if (!userEmail || !userPassword) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE userEmail = ? AND userPassword = SHA1(?)';
    const values = [userEmail, userPassword];

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Error logging in.');
        }

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        req.session.user = results[0];
        req.flash('success', 'Login successful!');
        // Redirect users to the homepage and open the chatbot; keep admins on the subscriptions page
        return res.redirect(req.session.user.userRole === 'user' ? '/?openBot=1' : '/subscriptions');
    });
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/');
};
exports.forgetPasswordForm = (req, res) => {
    res.render('forgetpassword');
};

exports.handlePasswordReset = (req, res) => {
    const { userEmail } = req.body;

    if (!userEmail) {
        req.flash('error', 'Email is required.');
        return res.redirect('/forgetPassword');
    }

    const checkEmailSql = 'SELECT * FROM users WHERE userEmail = ?';

    db.query(checkEmailSql, [userEmail], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Error processing request.');
        }

        if (results.length === 0) {
            req.flash('error', 'Email not found. Please enter a registered email.');
            return res.redirect('/forgetPassword');
        }

        // TODO: Implement sending a secure password reset email/OTP
        req.flash('success', 'If an account exists for that email, a password reset link has been sent.');
        return res.redirect('/login');
    });
};


exports.registerForm = (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
};

// At the top of your controller file, ensure fetch is available
// Node.js 18+ has fetch built-in. For older versions, use: const fetch = require('node-fetch');

exports.register = (req, res) => {
    const { userName, userEmail, userPassword, userRole } = req.body;
    let userImage = req.file ? req.file.filename : 'default.png'; // Default image if none uploaded

    // 1. Ensure all required fields are provided
    if (!userName || !userEmail || !userPassword || !userRole) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/register');
    }

    // 2. Prepare the SQL statement using SHA1 for password hashing as per your login logic
    const sql = `INSERT INTO users (username, userEmail, userPassword, userImage, userRole) 
                 VALUES (?, ?, SHA1(?), ?, ?)`;

    // 3. Execute the database query
    db.query(sql, [userName, userEmail, userPassword, userImage, userRole], (err, result) => {
        if (err) {
            console.error("Error registering user:", err);

            // Check for duplicate email error specifically
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'This email is already registered.');
                return res.redirect('/register');
            }

            return res.status(500).send("Database error: Unable to register user.");
        }

        // --- 4. START n8n WEBHOOK INTEGRATION ---
        // We trigger the welcome automation only after the database confirms success
        fetch('https://n8ngc.codeblazar.org/webhook/7ad08359-fbdb-4647-944c-e580b21b1e08', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: userName,
                email: userEmail,
                role: userRole,
                event: 'user_registration',
                timestamp: new Date().toISOString()
            }),
        })
        .then(response => {
            // Log success for your internal debugging
            if (response.ok) {
                console.log(`n8n Automation triggered successfully for: ${userEmail}`);
            }
        })
        .catch(error => {
            // Log errors if the n8n server is unreachable
            console.error('n8n Webhook Error:', error);
        });
        // --- END n8n WEBHOOK INTEGRATION ---

        // 5. Finalize the response to the user
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
};


exports.editUserForm = (req, res) => {
    const userId = req.params.id;
    const sql = 'SELECT * FROM users WHERE userId = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user');
        }

        if (results.length > 0) {
            res.render('editUser', { user: results[0] });
        } else {
            res.status(404).send('User not found');
        }
    });
};

exports.editUser = (req, res) => {
    const userId = req.params.id;
    const { userName, userRole } = req.body;
    let userImage = req.body.currentImage;

    if (req.file) {
        userImage = req.file.filename;
    }

    const sql = 'UPDATE users SET username = ?, userImage = ?, userRole = ? WHERE userId = ?';
    
    db.query(sql, [userName, userImage, userRole, userId], (err, result) => {
        if (err) throw err;
        req.flash('success', 'User details updated successfully.');
        res.redirect('/users');
    });
};

exports.deleteUser = (req, res) => {
    const userId = req.params.id;

    if (req.session.user && req.session.user.userId == userId) {
        req.flash('error', "You can't delete yourself while logged in.");
        return res.redirect('/users');
    }

    const deleteCartItems = 'DELETE FROM cart_items WHERE cartUserId = ?';
    const deleteOrders = 'DELETE FROM order_items WHERE orderUserId = ?';
    const getUserImage = 'SELECT userImage FROM users WHERE userId = ?';
    const deleteUser = 'DELETE FROM users WHERE userId = ?';

    db.query(getUserImage, [userId], (err, results) => {
        if (err) {
            console.error("Error fetching user image:", err);
            return res.status(500).send("Database error: Unable to fetch user data.");
        }

        const userImage = results.length > 0 ? results[0].userImage : null;

        db.query(deleteCartItems, [userId], (err) => {
            if (err) return res.status(500).send("Error deleting cart items.");

            db.query(deleteOrders, [userId], (err) => {
                if (err) return res.status(500).send("Error deleting orders.");

                db.query(deleteUser, [userId], (err) => {
                    if (err) return res.status(500).send("Error deleting user.");

                    if (userImage && userImage !== 'default.png') {
                        const fs = require('fs');
                        const path = require('path');
                        const imagePath = path.join(__dirname, '../public/images/', userImage);
                        fs.unlink(imagePath, (err) => {
                            if (err) console.error("Error deleting profile image:", err);
                        });
                    }

                    req.flash('success', "User deleted successfully.");
                    res.redirect('/users');
                });
            });
        });
    });
};

// ✅ Fetch the logged-in user's profile AND their active subscription
// ✅ Fetch the logged-in user's profile, active subscription, AND generated videos
// ✅ Fetch the logged-in user's profile, subscription, videos AND IMAGES
exports.getMyself = (req, res) => {
    const userId = req.session.user.userId;

    // Query 1: Get User Details
    const userSql = 'SELECT * FROM users WHERE userId = ?';
    
    db.query(userSql, [userId], (error, userResults) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user profile');
        }

        if (userResults.length > 0) {
            // Query 2: Get Active Subscription
            const subSql = 'SELECT * FROM subscriptions_combined WHERE user_id = ? AND status = "active" LIMIT 1';

            db.query(subSql, [userId], (subError, subResults) => {
                if (subError) {
                    console.error('Subscription query error:', subError);
                    subResults = []; 
                }

                // Query 3: Get Generated Videos
                const vidSql = 'SELECT * FROM generated_videos WHERE user_id = ? ORDER BY created_at DESC';

                db.query(vidSql, [userId], (vidError, vidResults) => {
                    if (vidError) {
                        console.error('Video query error:', vidError);
                        vidResults = [];
                    }

                    // ✅ NEW Query 4: Get Generated Images (from generation_history)
                    const imgSql = 'SELECT * FROM generation_history WHERE user_id = ? ORDER BY created_at DESC';

                    db.query(imgSql, [userId], (imgError, imgResults) => {
                        if (imgError) {
                            console.error('Image query error:', imgError);
                            imgResults = []; // Fail gracefully
                        }

                        // Render with ALL data (User, Sub, Videos, Images)
                        res.render('viewMyself', { 
                            userProfile: userResults[0], 
                            subscription: subResults.length > 0 ? subResults[0] : null,
                            videos: vidResults,
                            images: imgResults, // <--- Passing images to the view
                            tokens: req.session.tokens || null 
                        });
                    });
                });
            });

        } else {
            res.status(404).send('User not found');
        }
    });
};

// ✅ Edit Profile Form for Logged-in User
exports.editMyselfForm = (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.userId;
    const sql = "SELECT * FROM users WHERE userId = ?";

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error("Database query error:", error);
            return res.status(500).send("Database Error: Unable to fetch user data.");
        }

        if (results.length > 0) {
            res.render('editMyself', { user: results[0] });
        } else {
            res.status(404).send("User not found.");
        }
    });
};

// ✅ Update Profile for Logged-in User
exports.editMyself = (req, res) => {
    const userId = req.session.user.userId;
    const { userName } = req.body;
    let userImage = req.body.currentImage;

    if (req.file) {
        userImage = req.file.filename;
    }

    const sql = 'UPDATE users SET username = ?, userImage = ? WHERE userId = ?';

    db.query(sql, [userName, userImage, userId], (err, result) => {
        if (err) throw err;
        req.flash('success', 'Profile updated successfully.');
        res.redirect('/viewMyself');
    });
};

exports.deleteMyself = (req, res) => {
    if (!req.session.user) {
        req.flash('error', "Unauthorized request.");
        return res.redirect('/login');
    }

    const userId = req.session.user.userId;
    
    // SQL queries to delete related user data
    const deleteCartItems = 'DELETE FROM cart_items WHERE cartUserId = ?';
    const deleteReviews = 'DELETE FROM reviews WHERE reviewedByUserId = ?';
    const deleteOrders = 'DELETE FROM order_items WHERE orderUserId = ?';
    const getUserImage = 'SELECT userImage FROM users WHERE userId = ?';
    const deleteUser = 'DELETE FROM users WHERE userId = ?';

    db.query(getUserImage, [userId], (err, results) => {
        if (err) {
            console.error("Error fetching user image:", err);
            return res.status(500).send("Database error: Unable to fetch user data.");
        }

        const userImage = results.length > 0 ? results[0].userImage : null;

        db.query(deleteCartItems, [userId], (err) => {
            if (err) return res.status(500).send("Error deleting cart items.");

            db.query(deleteReviews, [userId], (err) => {
                if (err) return res.status(500).send("Error deleting reviews.");

                db.query(deleteOrders, [userId], (err) => {
                    if (err) return res.status(500).send("Error deleting orders.");

                    db.query(deleteUser, [userId], (err) => {
                        if (err) return res.status(500).send("Error deleting user.");

                        // Delete profile image if not default
                        if (userImage && userImage !== 'default.png') {
                            const fs = require('fs');
                            const path = require('path');
                            const imagePath = path.join(__dirname, '../public/images/', userImage);
                            fs.unlink(imagePath, (err) => {
                                if (err) console.error("Error deleting profile image:", err);
                            });
                        }

                        // ✅ Set flash message before destroying session
                        req.flash('success', "Your account has been deleted.");

                        // ✅ Destroy session and redirect after it's completed
                        req.session.destroy((err) => {
                            if (err) {
                                console.error("Error destroying session:", err);
                                return res.status(500).send("Error deleting session.");
                            }
                            res.redirect('/login');
                        });
                    });
                });
            });
        });
    });
};
