const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/packages?search=&category=&state=&minPrice=&maxPrice=&sort=
router.get('/', async (req, res) => {
  try {
    const { search, category, state, minPrice, maxPrice, sort } = req.query;
    const clauses = [`status = 'active'`];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      clauses.push(`(LOWER(title) LIKE $${params.length} OR LOWER(destination) LIKE $${params.length} OR LOWER(state) LIKE $${params.length})`);
    }
    if (category) { params.push(category); clauses.push(`category = $${params.length}`); }
    if (state) { params.push(state); clauses.push(`state = $${params.length}`); }
    if (minPrice) { params.push(Number(minPrice)); clauses.push(`price_inr >= $${params.length}`); }
    if (maxPrice) { params.push(Number(maxPrice)); clauses.push(`price_inr <= $${params.length}`); }

    const sortMap = {
      price_asc: 'price_inr ASC',
      price_desc: 'price_inr DESC',
      rating: 'avg_rating DESC NULLS LAST',
      duration: 'duration_days ASC'
    };
    const orderBy = sortMap[sort] || 'created_at DESC';

    const { rows } = await db.query(
      `SELECT id, title, destination, state, category, description, duration_days, price_inr,
              max_group_size, image_url, avg_rating, review_count
       FROM packages WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('List packages error:', err);
    res.status(500).json({ error: 'Failed to load packages' });
  }
});

// GET /api/packages/meta/filters — distinct categories & states for filter dropdowns
router.get('/meta/filters', async (req, res) => {
  try {
    const categories = await db.query(`SELECT DISTINCT category FROM packages WHERE status='active' ORDER BY category`);
    const states = await db.query(`SELECT DISTINCT state FROM packages WHERE status='active' ORDER BY state`);
    res.json({
      categories: categories.rows.map((r) => r.category),
      states: states.rows.map((r) => r.state)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load filters' });
  }
});

// GET /api/packages/:id — full detail incl. reviews
router.get('/:id', async (req, res) => {
  try {
    const pkg = await db.query('SELECT * FROM packages WHERE id = $1', [req.params.id]);
    if (!pkg.rows.length) return res.status(404).json({ error: 'Package not found' });

    const reviews = await db.query(
      `SELECT r.rating, r.comment, r.created_at, u.name AS tourist_name, g.name AS guide_name
       FROM reviews r
       JOIN users u ON u.id = r.tourist_id
       JOIN users g ON g.id = r.guide_id
       WHERE r.package_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ ...pkg.rows[0], reviews: reviews.rows });
  } catch (err) {
    console.error('Get package error:', err);
    res.status(500).json({ error: 'Failed to load package' });
  }
});

// GET /api/packages/:id/guides?lang=English,Hindi — guides assigned to this package,
// scored and sorted by recommendation (language match + rating + experience).
// Recommendation is advisory only — the frontend still lets the tourist pick any guide returned here.
router.get('/:id/guides', async (req, res) => {
  try {
    const { rows: guides } = await db.query(
      `SELECT u.id, u.name, u.bio, u.languages, u.experience_years, u.avg_rating, u.review_count,
              u.completed_tours, u.availability
       FROM package_guides pg
       JOIN users u ON u.id = pg.guide_id
       WHERE pg.package_id = $1 AND u.status = 'active'`,
      [req.params.id]
    );

    const preferredLangs = (req.query.lang || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

    const scored = guides.map((g) => {
      const guideLangs = (g.languages || []).map((l) => l.toLowerCase());
      const languageMatches = preferredLangs.filter((l) => guideLangs.includes(l)).length;
      const ratingScore = g.avg_rating ? Number(g.avg_rating) : 3; // neutral default for unrated guides
      const experienceScore = Math.min(Number(g.experience_years) || 0, 10) / 10; // normalize 0-1

      // Weighted score: language match matters most, then rating, then experience.
      const score = (languageMatches * 3) + (ratingScore * 1.2) + (experienceScore * 2);

      return { ...g, languageMatches, score: Math.round(score * 100) / 100 };
    });

    scored.sort((a, b) => b.score - a.score);
    // Mark the top-scoring available guide(s) as "recommended" (only if they actually match a language, when one was requested)
    const best = scored[0];
    scored.forEach((g) => {
      g.recommended = !!best && g.id === best.id && g.availability &&
        (preferredLangs.length === 0 || g.languageMatches > 0);
    });

    res.json(scored);
  } catch (err) {
    console.error('Guide recommendation error:', err);
    res.status(500).json({ error: 'Failed to load guides for this package' });
  }
});

// ===================== ADMIN: PACKAGE MANAGEMENT =====================

// POST /api/packages — admin creates a new package
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { title, destination, state, category, description, itinerary, duration_days,
            price_inr, max_group_size, image_url, guideIds } = req.body;
    if (!title || !destination || !state || !category || !price_inr || !duration_days) {
      return res.status(400).json({ error: 'title, destination, state, category, duration_days and price_inr are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO packages (title, destination, state, category, description, itinerary, duration_days, price_inr, max_group_size, image_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') RETURNING *`,
      [title, destination, state, category, description || '', JSON.stringify(itinerary || []),
       duration_days, price_inr, max_group_size || 10, image_url || `https://picsum.photos/seed/${encodeURIComponent(destination)}/900/600`]
    );
    const pkg = rows[0];
    if (Array.isArray(guideIds)) {
      for (const gId of guideIds) {
        await db.query(`INSERT INTO package_guides (package_id, guide_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pkg.id, gId]);
      }
    }
    res.status(201).json(pkg);
  } catch (err) {
    console.error('Create package error:', err);
    res.status(500).json({ error: 'Failed to create package' });
  }
});

// PUT /api/packages/:id — admin edits a package
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const fields = ['title', 'destination', 'state', 'category', 'description', 'duration_days', 'price_inr', 'max_group_size', 'image_url', 'status'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (req.body.itinerary !== undefined) { params.push(JSON.stringify(req.body.itinerary)); sets.push(`itinerary = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const { rows } = await db.query(`UPDATE packages SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'Package not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update package error:', err);
    res.status(500).json({ error: 'Failed to update package' });
  }
});

// PUT /api/packages/:id/guides — admin sets the full guide list for a package
router.put('/:id/guides', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { guideIds } = req.body;
    if (!Array.isArray(guideIds)) return res.status(400).json({ error: 'guideIds must be an array' });
    await db.query('DELETE FROM package_guides WHERE package_id = $1', [req.params.id]);
    for (const gId of guideIds) {
      await db.query('INSERT INTO package_guides (package_id, guide_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, gId]);
    }
    res.json({ success: true, guideIds });
  } catch (err) {
    console.error('Update package guides error:', err);
    res.status(500).json({ error: 'Failed to update guides for this package' });
  }
});

module.exports = router;
