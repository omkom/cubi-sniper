// Vérifie si un wallet a accès
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// GET /api/check/:pubkey
router.get('/:pubkey', async (req, res) => {
  try {
    const pubkey = req.params.pubkey;
    
    if (!pubkey) {
      return res.status(400).json({ error: 'Missing pubkey parameter' });
    }

    const isActive = await db.isWalletActive(pubkey);
    const user = await db.getUser(pubkey);

    res.json({
      active: isActive,
      wallet: pubkey,
      user: user ? {
        role: user.role,
        method: user.method,
        activatedAt: user.activatedAt
      } : null
    });
  } catch (error) {
    console.error('Error checking wallet access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;