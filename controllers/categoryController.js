const db = require('../db');

exports.getCategories = (req, res) => {
    const sql = 'SELECT * FROM categories';
    // Fetch data from MySQL
    db.query(sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving categories');
        }

        if (results.length > 0) {
            console.log('All categories:', results[0].categoryName);
            res.render('viewAllCategories', { categories: results });
        } else {
            // If no category with the given ID was found, 
            //render a 404 page or handle it accordingly
            res.status(404).send('No Categories');
        }
    });
};

exports.getCategory = (req, res) => {
    const categoryId = req.params.id;
    const sql = 'SELECT * FROM categories WHERE categoryId = ?';
    // Fetch data from MySQL
    db.query(sql, [categoryId], (error, results) => {

        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving category by ID');
        }

        // Check if any category with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the category data
            res.render('viewCategory', { category: results[0] });
        } else {
            // If no category with the given ID was found, 
            //render a 404 page or handle it accordingly
            res.status(404).send('Category not found');
        }
    });
};

exports.addCategoryForm = (req, res) => {
    res.render('addCategory');
};


exports.addCategory = (req, res) => {
    const { categoryName, categoryDescription } = req.body;
    let categoryImage;
    if (req.file) {
        categoryImage = req.file.filename; // Save only the filename
    } else {
        categoryImage = null;
    }

    const sql = 'INSERT INTO categories (categoryName, categoryDescription, categoryImage) VALUES (?, ?, ?)';

    // Insert the new category into the database
    db.query(sql, [categoryName, categoryDescription, categoryImage], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding category:", error);
            res.status(500).send('Error adding Category');
        } else {
            // Send a success response
            res.redirect('/categories');
        }
    });
};

//edit category form 
exports.editCategoryForm = (req, res) => {
    const categoryId = req.params.id;
    const sql = 'SELECT * FROM categories WHERE categoryId = ?';
    //const category = db.Category.findByPk(categoryId);

    db.query(sql, [categoryId], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving category by ID');
        }

        // Check if any category with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the category data
            res.render('editCategory', { category: results[0] });
        } else {
            // If no category with the given ID was found, 
            //render a 404 page or handle it accordingly
            res.status(404).send('Category not found');
        }
    });

};

//edit category form processing
exports.editCategory = (req, res) => {

    const categoryId = req.params.id;
    const { categoryName, categoryDescription } = req.body;
    let categoryImage = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        categoryImage = req.file.filename; // set image to be new image filename
    }
    console.log("new file: " + categoryImage);
    const sql = 'UPDATE categories SET categoryName = ? , categoryDescription = ?, categoryImage = ? WHERE categoryId = ?';

    // Insert the new category into the database
    db.query(sql, [categoryName, categoryDescription, categoryImage, categoryId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating category:", error);
            res.status(500).send('Error updating category');
        } else {
            // Send a success response
            res.redirect('/categories');
        }
    });

};

//delete category
exports.deleteCategory = (req, res) => {
    const categoryId = req.params.id;
    const sql = 'DELETE FROM categories WHERE categoryId = ?';
    db.query(sql, [categoryId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting category:", error);
            res.status(500).send('Error deleting category');
        } else {
            // Send a success response
            res.redirect('/categories');
        }
    });
}