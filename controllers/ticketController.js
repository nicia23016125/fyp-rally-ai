const db = require('../db');

// ✅ Add a new ticket (Admin only)
exports.addTicket = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "admin") {
        return res.status(403).send("Unauthorized Access");
    }

    const { eventName, eventDescription, ticketPrice, availableTickets, categoryId } = req.body;
    let eventImage = req.file ? req.file.filename : 'default.jpg';

    const sql = "INSERT INTO tickets (eventName, eventDescription, eventImage, ticketPrice, availableTickets, categoryId) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sql, [eventName, eventDescription, eventImage, ticketPrice, availableTickets, categoryId], (error) => {
        if (error) {
            console.error("Error adding ticket:", error);
            return res.status(500).send("Database Error: Unable to add ticket.");
        }
        res.redirect('/subscriptions');
    });
};

// ✅ Fetch categories before rendering the Add Ticket Form (Admin only)
exports.addTicketForm = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "admin") {
        return res.status(403).send("Unauthorized Access");
    }

    const sql = "SELECT * FROM categories";
    db.query(sql, (error, results) => {
        if (error) {
            console.error("Database error fetching categories:", error);
            return res.status(500).send("Database Error: Unable to fetch categories.");
        }
        res.render('addTicket', { categories: results, session: req.session });
    });
};

// ✅ Show Edit Ticket Form (Admin only)
exports.editTicketForm = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "admin") {
        return res.status(403).send("Unauthorized Access");
    }

    const ticketId = req.params.id;
    const sqlTicket = 'SELECT * FROM tickets WHERE ticketId = ?';
    const sqlCategories = 'SELECT * FROM categories';

    db.query(sqlTicket, [ticketId], (error, ticketResults) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving ticket details');
        }

        if (ticketResults.length > 0) {
            db.query(sqlCategories, (error, categoryResults) => {
                if (error) {
                    console.error('Database error fetching categories:', error);
                    return res.status(500).send('Database Error: Unable to fetch categories.');
                }
                res.render('editTicket', { ticket: ticketResults[0], categories: categoryResults, session: req.session });
            });
        } else {
            res.status(404).send('Ticket not found');
        }
    });
};

// ✅ Update a ticket (Admin only)
exports.editTicket = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "admin") {
        return res.status(403).send("Unauthorized Access");
    }

    const ticketId = req.params.id;
    const { eventName, eventDescription, ticketPrice, availableTickets, categoryId } = req.body;
    let eventImage = req.body.currentImage;
    if (req.file) {
        eventImage = req.file.filename;
    }

    const sql = "UPDATE tickets SET eventName = ?, eventDescription = ?, eventImage = ?, ticketPrice = ?, availableTickets = ?, categoryId = ? WHERE ticketId = ?";
    db.query(sql, [eventName, eventDescription, eventImage, ticketPrice, availableTickets, categoryId, ticketId], (error) => {
        if (error) {
            console.error("Error updating ticket:", error);
            return res.status(500).send("Database Error: Unable to update ticket.");
        }
        res.redirect('/subscriptions');
    });
};

// ✅ Fetch all tickets (For users & admins)
exports.getTickets = (req, res) => {
    let searchQuery = req.query.search ? req.query.search.trim() : "";

    let sql = "SELECT t.*, c.categoryName FROM tickets t LEFT JOIN categories c ON t.categoryId = c.categoryId";
    let queryParams = [];

    if (searchQuery) {
        sql += " WHERE t.eventName LIKE ?";
        queryParams.push(searchQuery + "%"); // Matches events starting with input
    }

    db.query(sql, queryParams, (error, results) => {
        if (error) {
            console.error("Database error fetching tickets:", error);
            return res.status(500).send("Database Error: Unable to fetch tickets.");
        }

        // ✅ If no search query, reset tickets to full list
        if (!searchQuery) {
            sql = "SELECT t.*, c.categoryName FROM tickets t LEFT JOIN categories c ON t.categoryId = c.categoryId";
            db.query(sql, (err, fullResults) => {
                if (err) {
                    console.error("Database error fetching all tickets:", err);
                    return res.status(500).send("Database Error: Unable to fetch tickets.");
                }

                res.render("viewAllTickets", { 
                    tickets: fullResults, 
                    session: req.session,
                    searchQuery: "" // Empty the search bar when refreshing
                });
            });
        } else {
            res.render("viewAllTickets", { 
                tickets: results, 
                session: req.session,
                searchQuery // Keeps search term in the input field
            });
        }
    });
};

// ✅ Fetch a single ticket by ID (For users & admins)
exports.getTicket = (req, res) => {
    const ticketId = req.params.id;
    const sql = "SELECT t.*, c.categoryName FROM tickets t LEFT JOIN categories c ON t.categoryId = c.categoryId WHERE t.ticketId = ?";

    db.query(sql, [ticketId], (error, results) => {
        if (error) {
            console.error("Database error fetching ticket:", error);
            return res.status(500).send("Database Error: Unable to fetch ticket.");
        }
        if (results.length > 0) {
            res.render('viewTicket', { ticket: results[0], session: req.session });
        } else {
            res.status(404).send("Ticket not found.");
        }
    });
};

// ✅ Delete a ticket (Admin only)
exports.deleteTicket = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "admin") {
        return res.status(403).send("Unauthorized Access");
    }

    const ticketId = req.params.id;
    const sql = "DELETE FROM tickets WHERE ticketId = ?";

    db.query(sql, [ticketId], (error) => {
        if (error) {
            console.error("Error deleting ticket:", error);
            return res.status(500).send("Database Error: Unable to delete ticket.");
        }
        res.redirect('/subscriptions');
    });
};

// ✅ Ensure `ticketController` is correctly required in `app.js`
exports.checkController = () => {
    console.log("ticketController loaded successfully");
};
