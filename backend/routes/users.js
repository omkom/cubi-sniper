// Liste des utilisateurs activés
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// Middleware admin uniquement
const adminMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const wallet = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  try {
    const user = await db.getUser(wallet);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.wallet = wallet;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// GET /api/users - Liste tous les utilisateurs (admin uniquement)
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await db.listUsers(page, limit);
    
    // Sanitizer les données sensibles
    const sanitizedUsers = result.users.map(user => ({
      id: user.id,
      wallet: user.wallet,
      method: user.method,
      activatedAt: user.activatedAt,
      lastLogin: user.lastLogin,
      role: user.role,
      status: user.status
    }));

    res.json({
      ...result,
      users: sanitizedUsers
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/active - Compte les utilisateurs actifs
router.get('/active', async (req, res) => {
  try {
    const result = await db.listUsers(1, 1000); // Assumant max 1000 utilisateurs
    const activeCount = result.users.filter(u => u.status === 'active').length;
    
    res.json({
      active: activeCount,
      total: result.total
    });
  } catch (error) {
    console.error('Error counting active users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;