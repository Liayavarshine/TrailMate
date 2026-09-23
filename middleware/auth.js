const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'tourist-booking-dev-secret';

function authenticateToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = (header && header.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, SECRET };
