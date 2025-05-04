// Backtest massif multi-token/stratégie
import fs from 'fs';
import path from 'path';
import { manualStrategies } from '../strategies/manual/manualAll';
import { Strategy } from '../types';
import { runStrategySimulation } from '../engine/simulator';
import { trackStrategyResult } from '../strategyTracker';

const TOKENS_DIR = './datasets/';
const OUTPUT_FILE = 'training_data.jsonl';
const STRAT_LEADERBOARD = 'strategies_leaderboard.json';

async function backtestTokenOnStrategy(tokenPath: string, strategy: Strategy) {
  const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  const results = await runStrategySimulation(tokenData, strategy);

  for (const r of results) {
    await trackStrategyResult(strategy.id, r.roi, r.roi_per_sec);
    fs.appendFileSync(OUTPUT_FILE, JSON.stringify(r) + '\n');
  }
}

async function backtestAll() {
  const tokens = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));

  for (const tokenFile of tokens) {
    const fullPath = path.join(TOKENS_DIR, tokenFile);
    for (const strat of manualStrategies) {
      console.log(`[TEST] ${strat.id} sur ${tokenFile}`);
      await backtestTokenOnStrategy(fullPath, strat);
    }
  }

  const leaderboard = await generateLeaderboard();
  fs.writeFileSync(STRAT_LEADERBOARD, JSON.stringify(leaderboard, null, 2));
  console.log('✅ Backtest terminé et leaderboard généré');
}

async function generateLeaderboard() {
  const raw = await import('../strategyTracker');
  const all = await raw.getStrategyStats();
  return Object.entries(all).map(([id, stats]) => ({ id, ...stats }))
    .sort((a, b) => b.roi_avg - a.roi_avg);
}

backtestAll();
