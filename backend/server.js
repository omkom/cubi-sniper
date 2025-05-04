// Serveur Express.js principal

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const WebSocket = require('ws');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const wss = new WebSocket.Server({ port: process.env.WS_PORT || 3010 });
let currentMode = false;

// Middleware de sécurité
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(bodyParser.json());

const PORT = process.env.API_PORT || 4000;

// ======= ROUTES ======= //

// Routes API principales
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/check'));
app.use('/api/me', require('./routes/me'));
app.use('/api/users', require('./routes/users'));

// Statistics routes
app.get('/strategies/stats', async (req, res) => {
  const keys = await redis.keys('strategy:*');
  const out = [];

  for (const key of keys) {
    const s = await redis.hgetall(key);
    const id = key.split(':')[1];
    const trades = parseInt(s.trades || '0');
    const roi_sum = parseFloat(s.roi_sum || '0');
    const roi_sec = parseFloat(s.roi_sec_sum || '0');

    out.push({
      id,
      trades,
      roi_total: roi_sum,
      roi_avg: trades ? roi_sum / trades : 0,
      roi_sec_avg: trades ? roi_sec / trades : 0,
      win_rate: trades ? (parseInt(s.wins || '0') / trades) : 0,
      drawdowns: parseFloat(s.drawdowns || '0')
    });
  }

  res.json(out);
});

app.get('/stats', async (req, res) => {
  const stats = await redis.hgetall('stats');
  const roi_total = parseFloat(stats.roi_cumulé || '0');
  const trades = parseInt(stats.snipes_total || '0');
  res.json({
    trades,
    roi_total,
    roi_avg: roi_total / Math.max(trades, 1),
    duration_avg: parseFloat(stats.duration_total || '0') / Math.max(trades, 1)
  });
});

app.get('/trades/recent', async (req, res) => {
  const ids = await redis.sort('exits', 'DESC', 'LIMIT', 0, 10);
  const trades = await Promise.all(ids.map(id => redis.json.get(id, '$')));
  res.json(trades.map(t => t[0]));
});

app.get('/heatmap', async (req, res) => {
  const lines = fs.readFileSync('training_data.jsonl', 'utf-8').split('\n').filter(Boolean);
  const data = lines.slice(-500).map(line => {
    const o = JSON.parse(line);
    return {
      roi_per_sec: o.roi_per_sec,
      time_held: o.time_held,
      exit_proba: o.exit_label ? 1 : 0
    };
  });
  res.json(data);
});

app.get('/get-mode', (req, res) => res.json({ live: currentMode }));

app.post('/set-mode', (req, res) => {
  currentMode = !!req.body.live;
  res.json({ live: currentMode });
});

// ======= WEBSOCKET ROUTES ======= //

wss.on('connection', (ws, req) => {
  const path = req.url;

  if (path === '/logs') {
    const sub = new Redis();
    sub.psubscribe('*');
    sub.on('pmessage', (_, channel, message) => {
      ws.send(`[${channel}] ${message}`);
    });

    ws.on('close', () => {
      sub.quit();
    });
  }

  if (path === '/visual') {
    const sub = new Redis();
    sub.subscribe('alerts.creator');
    sub.on('message', (_, message) => {
      ws.send(message); // e.g., rug/SHITMEME
    });

    ws.on('close', () => {
      sub.quit();
    });
  }

  ws.send('[WS] Connexion établie');
});

// Gestion des erreurs globale
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ======= LAUNCH ======= //

app.listen(PORT, () => console.log(`API backend prête sur http://localhost:${PORT}`));

// Fermeture propre
process.on('SIGTERM', async () => {
  await redis.quit();
  wss.close();
  process.exit(0);
});