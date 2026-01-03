// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.userRole === 'admin') {
        console.log("User has admin rights")
        return next();
    } else {
        console.log("User DO NOT have admin rights")
        req.flash('error', 'Access denied');
        res.redirect('/401');
        // res.render('401')
    }
};

// Middleware to check if user is logged in and a user
const checkUser= (req, res, next) => {
    if (req.session.user && req.session.user.userRole === 'user') {
        console.log("User is logged in")
        return next();
    } else {
        console.log("This function is for users only.")
        req.flash('error', 'This function is for users only.');
        res.redirect('/401');
        // res.render('401')
    }
};

module.exports = {
    checkAuthenticated,
    checkAdmin,
    checkUser
};