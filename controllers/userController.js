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
    const { userEmail, userPassword, userPIN } = req.body;
    let sql, values;

    // ✅ Hardcoded PIN Login (Temporary)
    if (userPIN === "777777") {
        req.session.user = { userEmail, userRole: 'user' }; // Simulate session
        req.flash('success', 'Login successful!');
        return res.redirect('/cart'); // Redirect to user dashboard
    }

    if (userPassword) {
        sql = 'SELECT * FROM users WHERE userEmail = ? AND userPassword = SHA1(?)';
        values = [userEmail, userPassword];
    } else {
        req.flash('error', 'Please enter a valid password or PIN.');
        return res.redirect('/login');
    }

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error logging in.");
        }

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        req.session.user = results[0];
        req.flash('success', 'Login successful!');
        return res.redirect(req.session.user.userRole === 'user' ? '/cart' : '/tickets');
    });
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/');
};
exports.forgetPasswordForm = (req, res) => {
    res.render('forgetpassword');
};
exports.verifyPin = (req, res) => {
    const { userEmail, pinCode } = req.body;

    if (!userEmail || !pinCode) {
        req.flash('error', 'Email and PIN are required.');
        return res.redirect('/forgetPassword');
    }

    const checkEmailSql = 'SELECT * FROM users WHERE userEmail = ?';

    db.query(checkEmailSql, [userEmail], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Error processing request.");
        }

        if (results.length === 0) {
            req.flash('error', 'Email not found. Please enter a registered email.');
            return res.redirect('/forgetPassword');
        }

        const user = results[0];

        // ✅ Hardcoded PIN logic
        if (pinCode === "777777") {
            req.session.user = user; // Log in as this user
            req.flash('success', 'Login successful!');
            return res.redirect('/cart'); // Redirect to cart/dashboard
        }

        // ✅ Regular PIN verification
        if (pinCode !== user.userPIN) {
            req.flash('error', 'Invalid PIN. Please try again.');
            return res.redirect('/forgetPassword');
        }

        req.flash('success', 'PIN verified! Redirecting to login.');
        return res.redirect('/login');
    });
};


exports.registerForm = (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
};

exports.register = (req, res) => {
    const { userName, userEmail, userPassword, userPIN, userRole } = req.body;
    let userImage = req.file ? req.file.filename : 'default.png'; // Default image if none uploaded

    // Ensure all fields are provided
    if (!userName || !userEmail || !userPassword || !userPIN || !userRole) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/register');
    }

    // Ensure PIN is exactly 6 digits
    if (!/^\d{6}$/.test(userPIN)) {
        req.flash('error', 'PIN must be exactly 6 digits.');
        return res.redirect('/register');
    }

    const sql = `INSERT INTO users (username, userEmail, userPassword, userPIN, userImage, userRole) 
                 VALUES (?, ?, SHA1(?), ?, ?, ?)`;

    db.query(sql, [userName, userEmail, userPassword, userPIN, userImage, userRole], (err, result) => {
        if (err) {
            console.error("Error registering user:", err);

            // Check for duplicate email error
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'This email is already registered.');
                return res.redirect('/register');
            }

            return res.status(500).send("Database error: Unable to register user.");
        }

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



// ✅ Fetch the logged-in user's profile
exports.getMyself = (req, res) => {
    const userId = req.session.user.userId;
    const sql = 'SELECT * FROM users WHERE userId = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving user profile');
        }

        if (results.length > 0) {
            res.render('viewMyself', { userProfile: results[0] });
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
};exports.deleteMyself = (req, res) => {
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
