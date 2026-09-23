const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/reviews — 1-5 star rating + comment, only after the tour is completed
router.post('/', authenticateToken, requireRole('tourist'), async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5 || !Number.isInteger(ratingNum)) {
      return res.status(400).json({ error: 'Rating must be a whole number between 1 and 5' });
    }

    const bRes = await db.query('SELECT * FROM bookings WHERE id = $1 AND tourist_id = $2', [bookingId, req.user.id]);
    const booking = bRes.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Prevent pre-tour reviews: only a completed booking can be reviewed.
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'You can only review a tour after it has been completed' });
    }

    // Prevent duplicate reviews: one review per booking (booking_id is UNIQUE in the schema too).
    const existing = await db.query('SELECT id FROM reviews WHERE booking_id = $1', [bookingId]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'You have already reviewed this booking' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const review = await client.query(
        `INSERT INTO reviews (booking_id, tourist_id, guide_id, package_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [bookingId, req.user.id, booking.guide_id, booking.package_id, ratingNum, comment || '']
      );

      // Recompute guide rating rollup
      await client.query(
        `UPDATE users SET
           avg_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE guide_id = $1),
           review_count = (SELECT COUNT(*) FROM reviews WHERE guide_id = $1)
         WHERE id = $1`,
        [booking.guide_id]
      );

      // Recompute package rating rollup
      await client.query(
        `UPDATE packages SET
           avg_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE package_id = $1),
           review_count = (SELECT COUNT(*) FROM reviews WHERE package_id = $1)
         WHERE id = $1`,
        [booking.package_id]
      );

      await client.query('COMMIT');
      res.status(201).json(review.rows[0]);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/guide/:id
router.get('/guide/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, u.name AS tourist_name, p.title AS package_title
       FROM reviews r JOIN users u ON u.id = r.tourist_id JOIN packages p ON p.id = r.package_id
       WHERE r.guide_id = $1 ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

module.exports = router;
