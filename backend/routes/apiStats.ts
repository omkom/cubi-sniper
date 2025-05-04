import express from 'express';
import Redis from 'ioredis';

const app = express();
const redis = new Redis(process.env.REDIS_URL);

app.get('/stats', async (_, res) => {
  const s = await redis.hgetall('stats');
  const roi = parseFloat(s.roi_cumulé || '0');
  const n = parseInt(s.snipes_total || '1');
  res.json({
    trades: n,
    roi_total: roi,
    roi_avg: roi / n,
    duration_avg: parseFloat(s.duration_total || '0') / n
  });
});

app.listen(4000, () => console.log('API stats sur : http://localhost:4000/stats'));
