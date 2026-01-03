// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { userName, userEmail, userPassword, userRole } = req.body;

    if (!userName || !userEmail || !userPassword ||  !userRole) {
        return res.status(400).send('All fields are required.');
    }

    if (userPassword.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
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