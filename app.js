const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const flash = require('connect-flash');
const session = require('express-session');
const bodyParser = require("body-parser");
const app = express();

require('dotenv').config();

// Import Controllers
const cartController = require('./controllers/cartController');
const userController = require('./controllers/userController');
const paypalController = require('./controllers/paypalController');
const netsQrController = require("./controllers/netsQrController");
const ticketController = require('./controllers/ticketController');

// Import middleware
const { checkAuthenticated, checkAdmin, checkUser } = require('./middleware/auth');
const { validateRegistration, validateLogin } = require('./middleware/validation');

// ✅ Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// ✅ Set up view engine
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Session Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // Session lasts 1 week
}));

// ✅ Flash Messages (After session)
app.use(flash());

// ✅ Middleware to make session & messages available in views
app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

// ✅ Home Page
app.get('/', (req, res) => {
    res.render('index', { session: req.session });
});

// ✅ User Routes (Login, Register, Logout)
app.get('/login', userController.loginForm);
app.post('/login', userController.login);
app.get('/logout', checkAuthenticated, userController.logout);

app.get('/register', userController.registerForm);
app.post('/register', upload.single('userImage'), validateRegistration, userController.register);

// Forgot Password Routes
app.get('/forgetPassword', userController.forgetPasswordForm);
app.post('/forgetPassword', userController.verifyPin);



// ✅ View My Profile (Ensuring the user is logged in)
app.get('/viewMyself', checkAuthenticated, userController.getMyself);
app.get('/editMyself', checkAuthenticated, userController.editMyselfForm);
app.post('/editMyself', checkAuthenticated, upload.single('userImage'), userController.editMyself);
app.post('/deleteMyself', checkAuthenticated, userController.deleteMyself);

// ✅ Ticket Routes
app.get('/tickets', ticketController.getTickets);
app.get('/ticket/:id', ticketController.getTicket);

// ✅ Admin-only routes
app.get('/addTicket', checkAdmin, ticketController.addTicketForm);
app.post('/addTicket', checkAdmin, upload.single('eventImage'), ticketController.addTicket);
app.get('/editTicket/:id', checkAdmin, ticketController.editTicketForm);
app.post('/editTicket/:id', checkAdmin, upload.single('eventImage'), ticketController.editTicket);
app.post('/deleteTicket/:id', checkAdmin, ticketController.deleteTicket);

// ✅ Cart Routes (Users Only)
app.get('/cart', checkAuthenticated, cartController.getCart);
app.post('/addToCart/:id', checkAuthenticated, checkUser, cartController.addToCart);
app.post('/updateCart/:id', checkAuthenticated, checkUser, cartController.updateCartTicket);
app.post('/removeFromCart/:id', checkAuthenticated, checkUser, cartController.removeFromCart);
app.post('/updateCartTicket/:id', checkAuthenticated, checkUser, cartController.updateCartTicket);
app.get('/removeFromCart/:id', checkAuthenticated, checkUser, cartController.removeFromCart);
app.post('/removeFromCart/:id', checkAuthenticated, checkUser, cartController.removeFromCart);

// ✅ View All Users (Admins Only)
app.get('/users', checkAdmin, userController.getUsers);
app.get('/user/:id', checkAdmin, userController.getUser);
app.get('/editUser/:id', checkAdmin, userController.editUserForm);
app.post('/editUser/:id', checkAdmin, upload.single('userImage'), userController.editUser);
app.post('/deleteUser/:id', checkAdmin, userController.deleteUser);

// ✅ Checkout Route
app.post('/checkout', checkAuthenticated, checkUser, cartController.checkout);

// ✅ Order Routes
// Orders pages removed as per request.


// ✅ Unauthorized Access Page
app.get('/401', (req, res) => {
    res.status(401).render('401', { message: "Unauthorized Access", errors: [] });
});

// ✅ Generate NETS QR Payment Route
app.get("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);
app.post("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);


// ✅ Start Express Server
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
