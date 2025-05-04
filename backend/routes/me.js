// Infos utilisateur par wallet connecté
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// Middleware pour extraire le wallet depuis l'authorization header
const walletMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    // Essayer de récupérer depuis query params pour tests
    const wallet = req.query.wallet;
    if (wallet) {
      req.wallet = wallet;
      return next();
    }
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  // Format: "Bearer WALLETADDRESS" ou juste "WALLETADDRESS"
  const wallet = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  req.wallet = wallet;
  next();
};

// GET /api/me
router.get('/', walletMiddleware, async (req, res) => {
  try {
    const user = await db.getUser(req.wallet);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mettre à jour le dernier login
    await db.updateLastLogin(req.wallet);

    // Retourner les infos utilisateur sans données sensibles
    const safeUser = {
      wallet: user.wallet,
      method: user.method,
      txId: user.txId,
      activatedAt: user.activatedAt,
      lastLogin: user.lastLogin,
      role: user.role
    };

    res.json(safeUser);
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;