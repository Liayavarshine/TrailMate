const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const BOOKING_SELECT = `
  SELECT b.*, p.title AS package_title, p.destination, p.image_url, p.duration_days,
         t.name AS tourist_name, t.phone AS tourist_phone,
         g.name AS guide_name, g.languages AS guide_languages
  FROM bookings b
  JOIN packages p ON p.id = b.package_id
  JOIN users t ON t.id = b.tourist_id
  LEFT JOIN users g ON g.id = b.guide_id
`;

// POST /api/bookings — package -> date -> tourists -> guide -> total price -> confirmation
router.post('/', requireRole('tourist'), async (req, res) => {
  try {
    const { packageId, tourDate, numTourists, guideId } = req.body;
    if (!packageId || !tourDate || !numTourists || !guideId) {
      return res.status(400).json({ error: 'packageId, tourDate, numTourists and guideId are all required' });
    }
    if (new Date(tourDate) < new Date(new Date().toDateString())) {
      return res.status(400).json({ error: 'Tour date cannot be in the past' });
    }

    const pkgRes = await db.query(`SELECT * FROM packages WHERE id = $1 AND status = 'active'`, [packageId]);
    const pkg = pkgRes.rows[0];
    if (!pkg) return res.status(404).json({ error: 'Package not found or no longer available' });
    if (Number(numTourists) < 1 || Number(numTourists) > pkg.max_group_size) {
      return res.status(400).json({ error: `Number of tourists must be between 1 and ${pkg.max_group_size}` });
    }

    const guideRes = await db.query(
      `SELECT u.* FROM package_guides pg JOIN users u ON u.id = pg.guide_id
       WHERE pg.package_id = $1 AND pg.guide_id = $2 AND u.status = 'active'`,
      [packageId, guideId]
    );
    const guide = guideRes.rows[0];
    if (!guide) return res.status(400).json({ error: 'Selected guide is not assigned to this package' });
    if (!guide.availability) return res.status(400).json({ error: 'Selected guide is not currently available' });

    const totalPrice = Math.round(Number(pkg.price_inr) * Number(numTourists) * 100) / 100;

    const { rows } = await db.query(
      `INSERT INTO bookings (tourist_id, package_id, guide_id, tour_date, num_tourists, total_price_inr, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [req.user.id, packageId, guideId, tourDate, numTourists, totalPrice]
    );

    const full = await db.query(`${BOOKING_SELECT} WHERE b.id = $1`, [rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// GET /api/bookings/mine — tourist's own bookings
router.get('/mine', requireRole('tourist'), async (req, res) => {
  try {
    const { rows } = await db.query(`${BOOKING_SELECT} WHERE b.tourist_id = $1 ORDER BY b.created_at DESC`, [req.user.id]);
    // attach whether a review already exists for each completed booking
    const ids = rows.map((r) => r.id);
    let reviewed = new Set();
    if (ids.length) {
      const rv = await db.query(`SELECT booking_id FROM reviews WHERE booking_id = ANY($1)`, [ids]);
      reviewed = new Set(rv.rows.map((r) => r.booking_id));
    }
    res.json(rows.map((r) => ({ ...r, hasReview: reviewed.has(r.id) })));
  } catch (err) {
    console.error('Get my bookings error:', err);
    res.status(500).json({ error: 'Failed to load your bookings' });
  }
});

// GET /api/bookings/received — bookings assigned to this guide
router.get('/received', requireRole('guide'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.id, b.tourist_id, b.package_id, b.guide_id, b.tour_date, b.num_tourists, b.status, b.created_at,
              p.title AS package_title, p.destination, p.image_url, p.duration_days,
              t.name AS tourist_name, t.phone AS tourist_phone,
              g.name AS guide_name, g.languages AS guide_languages,
              ROUND(b.total_price_inr * 0.15, 2) AS guide_payout_inr,
              (pc.id IS NOT NULL) AS payout_claimed
       FROM bookings b
       JOIN packages p ON p.id = b.package_id
       JOIN users t ON t.id = b.tourist_id
       LEFT JOIN users g ON g.id = b.guide_id
       LEFT JOIN payout_claims pc ON pc.booking_id = b.id
       WHERE b.guide_id = $1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get received bookings error:', err);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// PUT /api/bookings/:id/status
// tourist -> cancelled (while pending/confirmed) | guide/admin -> completed (while confirmed)
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const bRes = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    const booking = bRes.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isTourist = req.user.role === 'tourist' && booking.tourist_id === req.user.id;
    const isGuide = req.user.role === 'guide' && booking.guide_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (status === 'cancelled') {
      if (!isTourist && !isAdmin) return res.status(403).json({ error: 'Only the tourist (or admin) can cancel a booking' });
      if (!['pending', 'confirmed'].includes(booking.status)) {
        return res.status(400).json({ error: `Cannot cancel a booking that is already ${booking.status}` });
      }
    } else if (status === 'completed') {
      if (!isGuide && !isAdmin) return res.status(403).json({ error: 'Only the assigned guide (or admin) can mark a booking completed' });
      if (booking.status !== 'confirmed') {
        return res.status(400).json({ error: 'Only a confirmed (paid) booking can be marked completed' });
      }
    } else {
      return res.status(400).json({ error: 'status must be "cancelled" or "completed"' });
    }

    await db.query('UPDATE bookings SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (status === 'completed') {
      await db.query('UPDATE users SET completed_tours = completed_tours + 1 WHERE id = $1', [booking.guide_id]);
    }

    const full = await db.query(`${BOOKING_SELECT} WHERE b.id = $1`, [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) {
    console.error('Update booking status error:', err);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

module.exports = router;
