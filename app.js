// 1. LOAD DOTENV FIRST (Crucial!)
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const flash = require('connect-flash');
const session = require('express-session');
const bodyParser = require("body-parser");
const path = require('path');

const app = express();

// 2. Check if Key is Loaded (Debugging for AI Feature)
if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ ERROR: GOOGLE_API_KEY is missing from .env file!");
} else {
    // Show first 8 chars for security verification
    console.log("✅ API Key loaded successfully (Starts with: " + process.env.GOOGLE_API_KEY.substring(0, 8) + "...)");
}

// --- IMPORT CONTROLLERS ---
// Main App Controllers
const cartController = require('./controllers/cartController');
const userController = require('./controllers/userController');
const paypalController = require('./controllers/paypalController');
const netsQrController = require("./controllers/netsQrController");
const ticketController = require('./controllers/ticketController');
const subscriptionController = require('./controllers/subscriptionController');
const dashboardController = require('./controllers/dashboardController');
const contentController = require('./controllers/contentController');
const reviewController = require('./controllers/reviewController');

// AI Video Controller
// Note: Ensure your file is named 'aicontroller.js' inside the controllers folder
const videoController = require('./controllers/aicontroller'); 

// Import middleware
const { checkAuthenticated, checkAdmin, checkUser } = require('./middleware/auth');
const { validateRegistration, validateLogin } = require('./middleware/validation');

// --- MIDDLEWARE CONFIGURATION ---

// 1. Body Parsers (Updated to 50mb for AI Image/Video handling)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Note: bodyParser.json() is technically redundant with express.json(), but kept for compatibility
app.use(bodyParser.json()); 

// 2. Static File Serving
app.use(express.static('public')); // Main public folder
app.use('/static', express.static(path.join(__dirname, 'static'))); // AI static assets
app.use('/videosforindex', express.static(path.join(__dirname, 'videosforindex'))); // Jerald's videos

// 3. View Engine Setup
app.set('view engine', 'ejs');

// 4. File Uploads (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// 5. Session Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // Session lasts 1 week
}));

// 6. Flash Messages & Locals
app.use(flash());
app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

// --- ROUTES ---

// ✅ Home Page
// ✅ UPDATED HOME ROUTE
// Make sure this is at the very top of app.js if not already there
const db = require('./db'); 

// ✅ REPLACED HOME ROUTE WITH DEBUGGING
app.get('/', (req, res) => {
    console.log("------------------------------------------------");
    console.log("1. Accessing Homepage Route...");

    // Fetch up to 6 latest reviews
    const sql = `
        SELECT reviews.*, reviews.rating, users.username 
        FROM reviews 
        JOIN users ON reviews.reviewedByUserId = users.userId 
        ORDER BY createdAt DESC 
        LIMIT 6
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ Database Error:", err);
            // Render page empty to prevent crash
            return res.render('index', { 
                session: req.session, 
                currentPage: 'home', 
                reviews: [], 
                stats: { avgRating: 0, totalReviews: 0 } 
            });
        }

        console.log("2. Reviews Found in DB:", results.length);
        if (results.length > 0) {
            console.log("   -> First review:", results[0]);
        }

        // Calculate Statistics
        let totalStars = 0;
        let starCounts = { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 };

        results.forEach(review => {
            const r = parseInt(review.rating);
            totalStars += r;
            if (r >= 1 && r <= 5) starCounts['star' + r]++;
        });

        const stats = {
            totalReviews: results.length,
            avgRating: results.length > 0 ? (totalStars / results.length).toFixed(1) : 0,
            ...starCounts
        };

        console.log("3. Stats calculated:", stats);

        res.render('index', { 
            session: req.session, 
            currentPage: 'home',
            reviews: results,
            stats: stats
        });
    });
});


// ✅ AI Video Animation Route
app.post('/animate', videoController.animateImage);

// ✅ User Routes (Login, Register, Logout)
app.get('/login', userController.loginForm);
app.post('/login', userController.login);
app.get('/logout', checkAuthenticated, userController.logout);

app.get('/register', userController.registerForm);
app.post('/register', upload.single('userImage'), validateRegistration, userController.register);

// Forgot Password Routes
app.get('/forgetPassword', userController.forgetPasswordForm);
app.post('/forgetPassword', userController.handlePasswordReset);

// ✅ View My Profile (Ensuring the user is logged in)
app.get('/viewMyself', checkAuthenticated, userController.getMyself);
app.get('/editMyself', checkAuthenticated, userController.editMyselfForm);
app.post('/editMyself', checkAuthenticated, upload.single('userImage'), userController.editMyself);
app.post('/deleteMyself', checkAuthenticated, userController.deleteMyself);

// ✅ Subscriptions Routes
// 1. The general page that handles the redirect logic
app.get('/subscriptions', subscriptionController.getSubscriptions);
// 2. The specific page that shows a single subscription
app.get('/subscription/:id', subscriptionController.getSubscription);
// 3. The action that creates the subscription
app.post('/subscribe', subscriptionController.subscribe);

// ✅ Admin-only Subscription routes
app.get('/admin/subscriptions/add', checkAdmin, subscriptionController.addSubscriptionForm);
app.post('/admin/subscriptions/add', checkAdmin, subscriptionController.createSubscription);
app.get('/admin/subscriptions/edit/:id', checkAdmin, subscriptionController.editSubscriptionForm);
app.post('/admin/subscriptions/edit/:id', checkAdmin, subscriptionController.updateSubscription);
app.post('/admin/subscriptions/delete/:id', checkAdmin, subscriptionController.deleteSubscription);

// ✅ Admin-only Ticket routes
app.get('/addTicket', checkAdmin, ticketController.addTicketForm);
app.post('/addTicket', checkAdmin, upload.single('eventImage'), ticketController.addTicket);
app.get('/editTicket/:id', checkAdmin, ticketController.editTicketForm);
app.post('/editTicket/:id', checkAdmin, upload.single('eventImage'), ticketController.editTicket);
app.post('/deleteTicket/:id', checkAdmin, ticketController.deleteTicket);

// ✅ Admin Dashboard
app.get('/dashboard', checkAdmin, dashboardController.index);

// ✅ Admin Content Items
app.get('/admin/content', checkAdmin, contentController.index);

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

// Review 
app.get('/content/:id/reviews', reviewController.getReviews);
// If they visit /review without an ID, redirect them to a default content ID (like 1)
app.get('/review', (req, res) => res.redirect('/content/1/reviews'));
// Auth-protected routes for actions
app.post('/add-review', checkAuthenticated, reviewController.addReview);
app.post('/edit-review', checkAuthenticated, reviewController.editReview);
app.post('/delete-review/:id', checkAuthenticated, reviewController.deleteReview);

// ✅ Checkout Route
app.post('/checkout', checkAuthenticated, checkUser, cartController.checkout);

// ✅ Unauthorized Access Page
app.get('/401', (req, res) => {
    res.status(401).render('401', { message: "Unauthorized Access", errors: [] });
});

// ✅ Chat route - redirect logged-in users to Botpress chatbot
// ✅ Chat route - Renders the internal chatbot page
app.get('/chat', checkAuthenticated, (req, res) => {
    res.render('chatbot', { session: req.session });
});

// ✅ Generate NETS QR Payment Route
app.get("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);
app.post("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);

// ✅ Start Express Server
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});