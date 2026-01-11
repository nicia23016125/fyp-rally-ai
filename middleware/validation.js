// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { userName, userEmail, userPassword, userRole } = req.body;

    // Ensure all required fields are present. Use flash messages so the user is redirected back to the form with errors.
    if (!userName || !userEmail || !userPassword || !userRole) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (userPassword.length < 6) {
        req.flash('error', 'Password should be at least 6 characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};


const validateLogin = (req, res, next) => {
    const { userEmail, userPassword } = req.body;

    if (!userEmail || !userPassword) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
    next();
};

module.exports = {
    validateRegistration,
    validateLogin
};