// Routes paiement & validation d’accès
const express = require('express');
const router = express.Router();
const db = require('../lib/db'); // à adapter selon ton stockage (ex : Redis, Mongo, etc.)

// Appelé après paiement validé côté Stripe ou Phantom
router.post('/validate-access', async (req, res) => {
  const { walletAddress, txId, method } = req.body;

  if (!walletAddress || !method) {
    return res.status(400).json({ error: 'Missing data' });
  }

  // Enregistre l'utilisateur comme actif
  await db.activateUser(walletAddress, {
    method,
    txId,
    activatedAt: Date.now(),
    role: 'client'
  });

  res.json({ success: true });
});

module.exports = router;
