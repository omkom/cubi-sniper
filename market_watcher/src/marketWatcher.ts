// Scan Jupiter for détecter les tokens
import fetch from 'node-fetch';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const JUPITER_POOLS_URL = 'https://quote-api.jup.ag/v6/pools';
const JUPITER_TOKENS_URL = 'https://quote-api.jup.ag/v6/tokens';
const SEED_INTERVAL = 15_000; // 15 sec
const BASE_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL

interface JupiterPool {
  inputMint: string;
  outputMint: string;
  outputSymbol?: string;
  liquidity?: number;
  volume?: number;
  swapFeeBps: number;
  txRate?: number;
  priceImpactPct?: number;
}

interface TokenFeatures {
  mint: string;
  symbol: string;
  liquidity: number;
  volume: number;
  swapFee: number;
  txRate: number;
  impact: number;
  detected_at: number;
}

async function getPools(): Promise<JupiterPool[]> {
  try {
    const res = await fetch(`${JUPITER_POOLS_URL}?inputMint=${BASE_TOKEN}`);
    const data = await res.json() as JupiterPool[]; // Add type assertion here
    return data;
  } catch (error) {
    console.error('Erreur lors de la récupération des pools:', error);
    return [];
  }
}

async function enrichAndStore(pool: JupiterPool): Promise<void> {
  const token = pool.outputMint;
  const name = pool.outputSymbol || token.slice(0, 6);
  const features: TokenFeatures = {
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
    // Fix for Redis JSON commands
    await redis.call('JSON.SET', key, '$', JSON.stringify(features));
    await redis.zadd('pools', Date.now(), token); // log chronologique
  }
}

async function main() {
  console.log('🔍 Market Watcher démarré...');
  console.log(`Scanner Jupiter Aggregator toutes les ${SEED_INTERVAL / 1000}s`);
  
  while (true) {
    try {
      const pools = await getPools();
      console.log(`Vérifié ${pools.length} pools...`);
      
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


async function redisJsonSet(redis, key, path, jsonData) {
  // Store JSON as a string in Redis
  const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
  return redis.set(key, jsonString);
}

async function redisJsonGet(redis, key, path = '$') {
  // Retrieve JSON string from Redis 
  const jsonString = await redis.get(key);
  if (!jsonString) return null;
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`Error parsing JSON from Redis key ${key}:`, error);
    return null;
  }
}

// Gestion propre des interruptions
process.on('SIGTERM', async () => {
  console.log('🛑 Arrêt du Market Watcher...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Arrêt du Market Watcher...');
  await redis.quit();
  process.exit(0);
});

main();