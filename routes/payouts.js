const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/payouts/claim — claim all completed, unclaimed guide bookings
router.post('/claim', authenticateToken, requireRole('guide'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: bookings } = await client.query(
      `SELECT b.id, ROUND(b.total_price_inr * 0.15, 2) AS amount_inr
       FROM bookings b
       LEFT JOIN payout_claims pc ON pc.booking_id = b.id
       WHERE b.guide_id = $1 AND b.status = 'completed' AND pc.id IS NULL
       FOR UPDATE OF b SKIP LOCKED`,
      [req.user.id]
    );
    if (!bookings.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'There are no unclaimed completed bookings to claim' });
    }

    const transactionId = `GUIDE-TXN-${Date.now()}-${req.user.id}`;
    let amountInr = 0;
    for (const booking of bookings) {
      amountInr += Number(booking.amount_inr);
      await client.query(
        `INSERT INTO payout_claims (booking_id, guide_id, amount_inr, transaction_id)
         VALUES ($1,$2,$3,$4)`,
        [booking.id, req.user.id, booking.amount_inr, transactionId]
      );
    }
    await client.query('COMMIT');
    res.json({
      message: 'Successful transaction. Your guide payout has been credited.',
      transactionId,
      amountInr: Math.round(amountInr * 100) / 100,
      bookingsClaimed: bookings.length
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Guide payout claim error:', err);
    res.status(500).json({ error: 'Failed to claim guide payout' });
  } finally {
    client.release();
  }
});

module.exports = router;