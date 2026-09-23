const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// ===================== USERS =====================
router.get('/users', async (req, res) => {
  try {
    const { role } = req.query;
    const params = [];
    let where = '1=1';
    if (role) { params.push(role); where += ` AND role = $${params.length}`; }
    const { rows } = await db.query(
      `SELECT id, name, email, phone, role, status, languages, language_prefs, experience_years,
              avg_rating, review_count, completed_tours, created_at
       FROM users WHERE ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.put('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "suspended"' });
    }
    const { rows } = await db.query(
      `UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, email, role, status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// ===================== PACKAGES (list all incl. inactive, for admin table) =====================
router.get('/packages', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, COUNT(pg.guide_id) AS guide_count
       FROM packages p LEFT JOIN package_guides pg ON pg.package_id = p.id
       GROUP BY p.id ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load packages' });
  }
});

// ===================== BOOKINGS =====================
router.get('/bookings', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, p.title AS package_title, t.name AS tourist_name, g.name AS guide_name
       FROM bookings b
       JOIN packages p ON p.id = b.package_id
       JOIN users t ON t.id = b.tourist_id
       LEFT JOIN users g ON g.id = b.guide_id
       ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// ===================== DOCUMENTS =====================
router.get('/documents', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.guide_id, d.type, d.filename, d.mime_type, d.file_size, d.status, d.upload_date,
              u.name AS guide_name, u.email AS guide_email
       FROM documents d JOIN users u ON u.id = d.guide_id ORDER BY d.upload_date DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT filename, content, mime_type FROM documents WHERE id = $1',
      [req.params.id]
    );
    const document = rows[0];
    if (!document || !document.content) return res.status(404).json({ error: 'Uploaded file not found' });
    const filename = document.filename.replace(/["\\\r\n]/g, '_');
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const mimeType = document.mime_type || (
      ext === 'pdf' ? 'application/pdf' :
      (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' : 'application/octet-stream'
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(document.content),
      'Cache-Control': 'no-store'
    });
    res.send(document.content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load document file' });
  }
});

router.put('/documents/:id/verify', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be "verified" or "rejected"' });
    }
    const { rows } = await db.query(
      `UPDATE documents SET status = $1 WHERE id = $2
       RETURNING id, guide_id, type, filename, mime_type, file_size, status, upload_date`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ===================== REPORTS =====================
router.get('/reports', async (req, res) => {
  try {
    const users = await db.query(`SELECT role, COUNT(*) FROM users GROUP BY role`);
    const bookings = await db.query(`SELECT status, COUNT(*) FROM bookings GROUP BY status`);
    const revenue = await db.query(`SELECT COALESCE(SUM(amount_inr),0) AS total FROM payments WHERE status = 'success'`);
    const reviews = await db.query(`SELECT COUNT(*) AS count, COALESCE(ROUND(AVG(rating)::numeric,2),0) AS avg FROM reviews`);
    const packages = await db.query(`SELECT COUNT(*) FROM packages WHERE status = 'active'`);
    const pendingDocs = await db.query(`SELECT COUNT(*) FROM documents WHERE status = 'pending'`);
    const topPackages = await db.query(
      `SELECT title, destination, avg_rating, review_count FROM packages
       WHERE review_count > 0 ORDER BY avg_rating DESC, review_count DESC LIMIT 5`
    );

    const usersByRole = Object.fromEntries(users.rows.map((r) => [r.role, Number(r.count)]));
    const bookingsByStatus = Object.fromEntries(bookings.rows.map((r) => [r.status, Number(r.count)]));

    res.json({
      totalUsers: Object.values(usersByRole).reduce((a, b) => a + b, 0),
      totalTourists: usersByRole.tourist || 0,
      totalGuides: usersByRole.guide || 0,
      totalPackages: Number(packages.rows[0].count),
      totalBookings: Object.values(bookingsByStatus).reduce((a, b) => a + b, 0),
      bookingsByStatus,
      totalRevenueInr: Number(revenue.rows[0].total),
      totalReviews: Number(reviews.rows[0].count),
      averageRating: Number(reviews.rows[0].avg) || null,
      pendingDocuments: Number(pendingDocs.rows[0].count),
      topRatedPackages: topPackages.rows
    });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: 'Failed to generate reports' });
  }
});

module.exports = router;
