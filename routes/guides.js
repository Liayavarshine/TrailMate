const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/guides?search=  — directory of all active guides
router.get('/', async (req, res) => {
  try {
    const search = (req.query.search || '').toLowerCase();
    const params = [];
    let where = `role = 'guide' AND status = 'active'`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (LOWER(name) LIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(languages) l WHERE LOWER(l) LIKE $${params.length}))`;
    }
    const { rows } = await db.query(
      `SELECT id, name, bio, languages, experience_years, avg_rating, review_count, completed_tours, availability
       FROM users WHERE ${where} ORDER BY avg_rating DESC NULLS LAST`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('List guides error:', err);
    res.status(500).json({ error: 'Failed to load guides' });
  }
});

// GET /api/guides/:id — profile + reviews + packages they lead
router.get('/:id', async (req, res) => {
  try {
    const guide = await db.query(
      `SELECT id, name, bio, languages, experience_years, avg_rating, review_count, completed_tours, availability
       FROM users WHERE id = $1 AND role = 'guide'`,
      [req.params.id]
    );
    if (!guide.rows.length) return res.status(404).json({ error: 'Guide not found' });

    const reviews = await db.query(
      `SELECT r.rating, r.comment, r.created_at, u.name AS tourist_name, p.title AS package_title
       FROM reviews r JOIN users u ON u.id = r.tourist_id JOIN packages p ON p.id = r.package_id
       WHERE r.guide_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    const packages = await db.query(
      `SELECT p.id, p.title, p.destination, p.image_url
       FROM package_guides pg JOIN packages p ON p.id = pg.package_id
       WHERE pg.guide_id = $1 AND p.status = 'active'`,
      [req.params.id]
    );

    res.json({ ...guide.rows[0], reviews: reviews.rows, packages: packages.rows });
  } catch (err) {
    console.error('Get guide error:', err);
    res.status(500).json({ error: 'Failed to load guide profile' });
  }
});

// PUT /api/guides/me — guide updates own profile
router.put('/me', authenticateToken, requireRole('guide'), async (req, res) => {
  try {
    const { bio, languages, experience_years, availability } = req.body;
    const { rows } = await db.query(
      `UPDATE users SET
         bio = COALESCE($1, bio),
         languages = COALESCE($2, languages),
         experience_years = COALESCE($3, experience_years),
         availability = COALESCE($4, availability)
       WHERE id = $5 RETURNING id, name, email, bio, languages, experience_years, avg_rating, review_count, completed_tours, availability`,
      [bio, Array.isArray(languages) ? languages : null, experience_years, availability, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Update guide profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
