const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/payments — confirms a pending booking (mock gateway, INR only)
router.post('/', authenticateToken, requireRole('tourist'), async (req, res) => {
  try {
    const { bookingId, method } = req.body;
    const bRes = await db.query(
      `SELECT * FROM bookings WHERE id = $1 AND tourist_id = $2`,
      [bookingId, req.user.id]
    );
    const booking = bRes.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') {
      return res.status(400).json({ error: `Booking is already ${booking.status}` });
    }

    // --- Mock payment gateway (INR) --------------------------------------------
    // A real integration (Razorpay/PayU/Stripe) would create an order here and
    // verify a signed webhook callback. This simulates an always-successful response.
    const gatewayResponse = { success: true, transactionId: `TXN-${Date.now()}` };
    // -----------------------------------------------------------------------------

    const payment = await db.query(
      `INSERT INTO payments (booking_id, amount_inr, method, status, transaction_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [booking.id, booking.total_price_inr, method || 'upi', gatewayResponse.success ? 'success' : 'failed', gatewayResponse.transactionId]
    );

    await db.query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [booking.id]);
    res.status(201).json(payment.rows[0]);
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ error: 'Payment failed. Please try again.' });
  }
});

// GET /api/payments/booking/:bookingId
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const bookingRes = await db.query('SELECT tourist_id FROM bookings WHERE id = $1', [req.params.bookingId]);
    const booking = bookingRes.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && !(req.user.role === 'tourist' && booking.tourist_id === req.user.id)) {
      return res.status(403).json({ error: 'You are not allowed to view this payment' });
    }
    const { rows } = await db.query('SELECT * FROM payments WHERE booking_id = $1', [req.params.bookingId]);
    if (!rows.length) return res.status(404).json({ error: 'No payment found for this booking' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payment' });
  }
});

module.exports = router;
