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
const authController = require('./controllers/authController');
const driveController = require('./controllers/driveController');
const videoController = require('./controllers/aiController');
const analyticsController = require('./controllers/analyticsController');
const chatController = require('./controllers/chatController');
// AI Video Controller
// Note: Ensure your file is named 'aicontroller.js' inside the controllers folder
const editingController = require('./controllers/editingcontroller'); 

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
//saving to google drive button
app.get('/auth/google', authController.googleLogin);
app.get('/auth/callback', authController.googleCallback);
app.post('/drive/upload', driveController.uploadToFile);

app.use('/videosforindex', express.static(path.join(__dirname, 'videosforindex'))); // Jerald's videos
app.get('/tiktok', checkAuthenticated, editingController.posting);
app.post('/api/get-ai-advice', editingController.getAiPromptAdvice);

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
app.get('/chat', checkAuthenticated, chatController.getChatbot);
app.post('/api/generate-nano', checkAuthenticated, videoController.generateNanoImage);
// ✅ Generate NETS QR Payment Route
app.get("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);
app.post("/generateNETSQR", checkAuthenticated, netsQrController.generateQrCode);











// --- NEW ANALYTICS API ROUTE ---
// This route handles the actual page load
// Change from '/analytics' to '/admin/analytics' to match your navbar
app.get('/admin/analytics', checkAdmin, async (req, res) => {
    try {
        // 1. Fetch Global Totals
        const [totalStats] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as newUsers,
                (SELECT COUNT(*) FROM subscriptions_combined WHERE status = 'active') as newSubs,
                (SELECT IFNULL(SUM(amount), 0) FROM revenue) as earnings,
                (SELECT COUNT(*) FROM reviews) as totalReviews
        `);

        // 2. Monthly Revenue Trend (Fixes the ONLY_FULL_GROUP_BY error)
        const [revenueTrend] = await db.promise().query(`
            SELECT 
                DATE_FORMAT(createdAt, '%Y-%m') as label, 
                SUM(amount) as value
            FROM revenue 
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
            ORDER BY label ASC
        `);

        const initialData = { 
            newUsers: totalStats[0].newUsers || 0, 
            newSubs: totalStats[0].newSubs || 0, 
            earnings: totalStats[0].earnings || 0, 
            renewals: 0, 
            totalReviews: totalStats[0].totalReviews || 0,
            charts: {
                users: [{ label: 'Total Users', value: totalStats[0].newUsers }],
                revenue: revenueTrend.length > 0 ? revenueTrend : [{ label: 'No Data', value: 0 }],
                reviews: [{ label: 'Total Reviews', value: totalStats[0].totalReviews }]
            }
        };

        res.render('analytics', { initialData, session: req.session });
    } catch (err) {
        console.error("Analytics Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/api/admin/stats', checkAdmin, async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        // 1. Summary Stats for the filtered period
        const [summary] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE createdAt BETWEEN ? AND ?) as newUsers,
                (SELECT COUNT(*) FROM subscriptions_combined WHERE status = 'active' AND start_date BETWEEN ? AND ?) as newSubs,
                (SELECT IFNULL(SUM(amount), 0) FROM revenue WHERE createdAt BETWEEN ? AND ?) as earnings,
                (SELECT COUNT(*) FROM reviews) as totalReviews
        `, [startDate, endDate, startDate, endDate, startDate, endDate]);

        // 2. Filtered Revenue Trend (Grouped by Date for the chart)
        const [revenueTrend] = await db.promise().query(`
            SELECT 
                DATE_FORMAT(createdAt, '%Y-%m-%d') as label, 
                SUM(amount) as value
            FROM revenue 
            WHERE createdAt BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')
            ORDER BY label ASC
        `, [startDate, endDate]);

        res.json({
            summary: summary[0],
            charts: {
                users: [{ label: 'Filtered Users', value: summary[0].newUsers }],
                revenue: revenueTrend.length > 0 ? revenueTrend : [{ label: 'No Data', value: 0 }],
                reviews: [{ label: 'Total Reviews', value: summary[0].totalReviews }]
            }
        });
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});





// ✅ Start Express Server
const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});


