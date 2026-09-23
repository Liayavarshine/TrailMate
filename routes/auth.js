const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

function toSafeUser(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

// POST /api/auth/register  (tourists and guides self-register; admin is seeded)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role, languagePrefs } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    if (!['tourist', 'guide'].includes(role)) {
      return res.status(400).json({ error: 'role must be "tourist" or "guide"' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 8);
    let result;
    if (role === 'tourist') {
      result = await db.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status, language_prefs)
         VALUES ($1,$2,$3,$4,'tourist','active',$5) RETURNING *`,
        [name, email, passwordHash, phone || '', Array.isArray(languagePrefs) ? languagePrefs : []]
      );
    } else {
      result = await db.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status, bio, languages, experience_years, availability)
         VALUES ($1,$2,$3,$4,'guide','active','',$5,0,true) RETURNING *`,
        [name, email, passwordHash, phone || '', []]
      );
    }

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '2d' });
    res.status(201).json({ token, user: toSafeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '2d' });
    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

module.exports = router;
