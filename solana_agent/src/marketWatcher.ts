// Scan Jupiter pour détecter les tokens
import fetch from 'node-fetch';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const JUPITER_POOLS_URL = 'https://quote-api.jup.ag/v6/pools';
const JUPITER_TOKENS_URL = 'https://quote-api.jup.ag/v6/tokens';
const SEED_INTERVAL = 15_000; // 15 sec
const BASE_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL

async function getPools() {
  const res = await fetch(`${JUPITER_POOLS_URL}?inputMint=${BASE_TOKEN}`);
  const data = await res.json();
  return data;
}

async function enrichAndStore(pool: any) {
  const token = pool.outputMint;
  const name = pool.outputSymbol || token.slice(0, 6);
  const features = {
    mint: token,
    symbol: name,
    liquidity: pool.liquidity || 0,
    volume: pool.volume || 0,
    swapFee: pool.swapFeeBps / 100,
    txRate: pool.txRate || 0,
    impact: pool.priceImpactPct || 0,
    detected_at: Date.now()
  };

  const key = `token:${token}`;
  const exists = await redis.exists(key);
  if (!exists) {
    console.log(`[+] Nouveau pool : ${name} (${token})`);
    await redis.json.set(key, '$', features);
    await redis.zadd('pools', Date.now(), token); // log chronologique
  }
}

async function main() {
  while (true) {
    try {
      const pools = await getPools();
      for (const pool of pools) {
        if (pool.outputMint && pool.outputMint !== BASE_TOKEN) {
          await enrichAndStore(pool);
        }
      }
    } catch (err) {
      console.error('Erreur watcher Jupiter :', err);
    }
    await new Promise((r) => setTimeout(r, SEED_INTERVAL));
  }
}

main();
