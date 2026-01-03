const db = require('../db');

exports.getCart = (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    if (req.session.user.userRole === "admin") {
        return res.render('viewCart', { cart_items: [], totalAmount: "0.00", unauthorized: true });
    }

    const userId = req.session.user.userId;
    const sql = `SELECT t.ticketId, t.eventName, t.ticketPrice, 
                        IFNULL(t.eventImage, 'default.png') AS eventImage, c.cartTicketQuantity
                FROM cart_items c
                JOIN tickets t ON c.cartTicketId = t.ticketId
                WHERE c.cartUserId = ?`;

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error("❌ Database error fetching cart:", error);
            return res.status(500).send("Database Error: Unable to fetch cart.");
        }

        let totalAmount = results.reduce((acc, item) => acc + (parseFloat(item.ticketPrice) * item.cartTicketQuantity), 0) || 0;

        res.render('viewCart', { 
            cart_items: results, 
            totalAmount: totalAmount.toFixed(2),
            unauthorized: false 
        });
    });
};

exports.addToCart = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "user") {
        return res.redirect('/cart');
    }

    const ticketId = req.params.id;
    const { ticketQuantityToAdd } = req.body;
    const userId = req.session.user.userId;

    const checkCartQuery = 'SELECT * FROM cart_items WHERE cartTicketId = ? AND cartUserId = ?';
    db.query(checkCartQuery, [ticketId, userId], (err, cartResult) => {
        if (err) {
            console.error("Database Error: Unable to check cart:", err);
            return res.status(500).send("Database Error: Unable to check cart.");
        }

        if (cartResult.length > 0) {
            const updateCartQuery = `
                UPDATE cart_items SET cartTicketQuantity = cartTicketQuantity + ?
                WHERE cartTicketId = ? AND cartUserId = ?
            `;
            db.query(updateCartQuery, [ticketQuantityToAdd, ticketId, userId], (err) => {
                if (err) {
                    console.error("Database Error: Unable to update cart:", err);
                    return res.status(500).send("Database Error: Unable to update cart.");
                }
                res.redirect('/cart');
            });
        } else {
            const addToCartQuery = `
                INSERT INTO cart_items (cartTicketQuantity, cartTicketId, cartUserId)
                VALUES (?, ?, ?)
            `;
            db.query(addToCartQuery, [ticketQuantityToAdd, ticketId, userId], (err) => {
                if (err) {
                    console.error("Database Error: Unable to add to cart:", err);
                    return res.status(500).send("Database Error: Unable to add to cart.");
                }
                res.redirect('/cart');
            });
        }
    });
};

exports.updateCartTicket = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "user") {
        return res.redirect('/cart');
    }

    const ticketId = req.params.id;
    const { cartTicketQuantity } = req.body;
    const userId = req.session.user.userId;

    const updateCartQuery = ` 
        UPDATE cart_items SET cartTicketQuantity = ?
        WHERE cartTicketId = ? AND cartUserId = ?
    `;
    
    db.query(updateCartQuery, [cartTicketQuantity, ticketId, userId], (err) => {
        if (err) {
            console.error("Error updating cart:", err);
            return res.status(500).send("Database Error: Unable to update cart.");
        }
        res.redirect('/cart');
    });
};

exports.removeFromCart = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "user") {
        return res.redirect('/cart');
    }

    const ticketId = req.params.id;
    const userId = req.session.user.userId;
    const sql = 'DELETE FROM cart_items WHERE cartTicketId = ? AND cartUserId = ?';
    
    db.query(sql, [ticketId, userId], (error) => {
        if (error) {
            console.error("Error deleting ticket from cart:", error);
            return res.status(500).send('Error deleting ticket from cart');
        }
        res.redirect('/cart');
    });
};

// ✅ Checkout Function (Handles Payment Methods)
exports.checkout = (req, res) => {
    if (!req.session.user || req.session.user.userRole !== "user") {
        return res.redirect('/cart');
    }

    const userId = req.session.user.userId;

    const sql = `SELECT t.ticketId, t.eventName, t.ticketPrice, 
                        IFNULL(t.eventImage, 'default.png') AS eventImage, c.cartTicketQuantity
                FROM cart_items c
                JOIN tickets t ON c.cartTicketId = t.ticketId
                WHERE c.cartUserId = ?;`;

    db.query(sql, [userId], (error, cartItems) => {
        if (error) {
            console.error('Error retrieving cart items:', error);
            return res.status(500).send('Error retrieving cart items');
        }

        if (cartItems.length === 0) {
            return res.redirect('/cart'); // Prevent checkout with empty cart
        }

        let orderId = "ORD" + Date.now(); 
        let transactionId = "TXN" + Date.now(); 
        let totalAmount = cartItems.reduce((acc, item) => acc + (parseFloat(item.ticketPrice) * item.cartTicketQuantity), 0) || 0;

        const orderItemsSql = `
            INSERT INTO order_items (orderTicketId, orderTicketQuantity, orderUserId, orderDate, paymentMethod, orderId, transactionId)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        `;

        const orderDate = new Date();
        cartItems.forEach(orderItem => {
            db.query(orderItemsSql, [
                orderItem.ticketId, orderItem.cartTicketQuantity, userId, orderDate, "Not Paid", orderId, transactionId
            ]);
        });

        const clearCartSql = `DELETE FROM cart_items WHERE cartUserId = ?`;
        db.query(clearCartSql, [userId], (clearCartError) => {
            if (clearCartError) {
                console.error('Error clearing cart:', clearCartError);
                return res.status(500).send('Error clearing cart');
            }

            // ✅ Ensure `cart_items` is passed when rendering invoice
            res.render('invoice', { 
                cart_items: cartItems, 
                orderId, 
                transactionId, 
                totalAmount: totalAmount.toFixed(2) 
            });
        });
    });
};

