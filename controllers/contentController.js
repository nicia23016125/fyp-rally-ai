const db = require('../db');

exports.index = (req, res) => {
  if (!req.session.user || req.session.user.userRole !== 'admin') {
    return res.status(403).render('401', { message: 'Unauthorized Access', errors: [] });
  }

  const sql = 'SELECT * FROM content_items ORDER BY contentId DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching content items:', err);
      return res.status(500).send('Database error');
    }
    res.render('contentItems', { session: req.session, items: results });
  });
};