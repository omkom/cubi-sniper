// Tracking des performances de stratégie

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

type StrategyPerformance = {
  roi_sum: number;
  roi_sec_sum: number;
  trades: number;
  wins: number;
  drawdowns: number;
};

export async function trackStrategyResult(strategyId: string, roi: number, roi_per_sec: number) {
  const key = `strategy:${strategyId}`;
  await redis.hincrbyfloat(key, 'roi_sum', roi);
  await redis.hincrbyfloat(key, 'roi_sec_sum', roi_per_sec);
  await redis.hincrby(key, 'trades', 1);
  if (roi > 0) await redis.hincrby(key, 'wins', 1);
  if (roi < 0) await redis.hincrbyfloat(key, 'drawdowns', roi);
}

export async function getStrategyStats(): Promise<Record<string, StrategyPerformance>> {
  const keys = await redis.keys('strategy:*');
  const stats: Record<string, StrategyPerformance> = {};

  for (const key of keys) {
    const s = await redis.hgetall(key);
    const id = key.split(':')[1];
    stats[id] = {
      roi_sum: parseFloat(s.roi_sum || '0'),
      roi_sec_sum: parseFloat(s.roi_sec_sum || '0'),
      trades: parseInt(s.trades || '0'),
      wins: parseInt(s.wins || '0'),
      drawdowns: parseFloat(s.drawdowns || '0')
    };
  }

  return stats;
}
