// controllers/chatController.js

exports.getChatbot = (req, res) => {
    // req.user contains the logged-in user's info (from Passport/Auth)
    res.render('chatbot', { 
        session: req.session,
        user: req.user  // <--- CRITICAL: You must pass this!
    });
};