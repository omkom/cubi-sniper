// Improved Market Watcher for detecting new tokens on Solana
// Combines the best of live_bot and cubi-sniper implementations
import fetch from 'node-fetch';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Configuration from environment variables
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JUPITER_POOLS_URL = process.env.JUPITER_API_URL 
  ? `${process.env.JUPITER_API_URL}/pools` 
  : 'https://quote-api.jup.ag/v6/pools';
const JUPITER_TOKENS_URL = process.env.JUPITER_API_URL 
  ? `${process.env.JUPITER_API_URL}/tokens` 
  : 'https://quote-api.jup.ag/v6/tokens';
const SEED_INTERVAL = parseInt(process.env.SEED_INTERVAL || '15000'); // 15 sec default
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const BASE_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL
const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY || '1');

// Set up logging
const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(LOG_DIR, `marketwatcher_${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Interfaces
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

// Cache to avoid reprocessing the same tokens
const processedTokens = new Set();

// Logging function
function log(message: string, level: 'info' | 'error' | 'warn' | 'debug' = 'info') {
  if (level === 'debug' && !DEBUG_MODE) return;
  
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

// Robust Redis client with reconnection logic
class RobustRedisClient {
  private redis: Redis | null = null;
  private reconnectAttempts = 0;
  private isConnected = false;
  private maxRetries = 5;

  constructor(private redisUrl: string) {
    this.connect();
  }

  private connect() {
    try {
      this.redis = new Redis(this.redisUrl, {
        retryStrategy: (times) => {
          if (times > 10) {
            log(`Redis reconnect failed after ${times} attempts`, 'error');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 500, 5000);
          log(`Redis reconnecting in ${delay}ms (attempt ${times})`, 'warn');
          return delay;
        }
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        log('Redis connected successfully', 'info');
      });

      this.redis.on('error', (err) => {
        log(`Redis error: ${err.message}`, 'error');
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        log('Redis connection closed', 'warn');
        this.isConnected = false;
      });
    } catch (error) {
      log(`Redis connection failed: ${error}`, 'error');
      this.isConnected = false;
    }
  }

  public async get(key: string): Promise<string | null> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      return await this.redis!.get(key);
    } catch (error) {
      log(`Redis get error: ${error}`, 'error');
      return null;
    }
  }

  public async set(key: string, value: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.set(key, value);
      return true;
    } catch (error) {
      log(`Redis set error: ${error}`, 'error');
      return false;
    }
  }

  public async exists(key: string): Promise<number> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      return await this.redis!.exists(key);
    } catch (error) {
      log(`Redis exists error: ${error}`, 'error');
      return 0;
    }
  }

  public async publish(channel: string, message: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.publish(channel, message);
      return true;
    } catch (error) {
      log(`Redis publish error: ${error}`, 'error');
      return false;
    }
  }

  public async zadd(key: string, score: number, member: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.zadd(key, score, member);
      return true;
    } catch (error) {
      log(`Redis zadd error: ${error}`, 'error');
      return false;
    }
  }

  public async ping(): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      const result = await this.redis!.ping();
      return result === 'PONG';
    } catch (error) {
      log(`Redis ping error: ${error}`, 'error');
      return false;
    }
  }

  private async reconnect() {
    if (this.reconnectAttempts >= this.maxRetries) {
      log('Max reconnect attempts reached. Exiting...', 'error');
      process.exit(1);
    }

    log(`Attempting to reconnect to Redis (${++this.reconnectAttempts}/${this.maxRetries})...`, 'warn');
    
    if (this.redis) {
      try {
        this.redis.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    this.connect();

    // Wait for connection to establish
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis reconnect timeout'));
      }, 5000);

      const interval = setInterval(() => {
        if (this.isConnected) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  public async quit(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Initialize Redis client
const redis = new RobustRedisClient(REDIS_URL);

/**
 * Fetches pool data from Jupiter API
 */
async function getPools(): Promise<JupiterPool[]> {
  try {
    const res = await fetch(`${JUPITER_POOLS_URL}?inputMint=${BASE_TOKEN}`);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  } catch (error) {
    log(`Error fetching pools: ${error}`, 'error');
    return [];
  }
}

/**
 * Process a token and store its data in Redis
 */
async function enrichAndStore(pool: JupiterPool): Promise<void> {
  try {
    const token = pool.outputMint;
    
    // Skip SOL itself
    if (token === BASE_TOKEN) return;
    
    // Skip if already processed
    if (processedTokens.has(token)) {
      if (DEBUG_MODE) {
        log(`Token ${token} already processed this session, skipping`, 'debug');
      }
      return;
    }

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

    // Check if token has sufficient liquidity
    if (features.liquidity < MIN_LIQUIDITY) {
      if (DEBUG_MODE) {
        log(`Token ${name} (${token}) skipped: insufficient liquidity (${features.liquidity} SOL)`, 'debug');
      }
      return;
    }

    const key = `token:${token}`;
    const exists = await redis.exists(key);
    
    if (!exists) {
      log(`[+] New pool detected: ${name} (${token}) - Liquidity: ${features.liquidity} SOL`, 'info');
      
      // Store token data in Redis
      await redis.set(key, JSON.stringify(features));
      
      // Announce new token on dedicated channel
      await redis.publish('new_token', token);
      
      // Add to chronological list
      await redis.zadd('pools', Date.now(), token);

      // Add to processed tokens for this session
      processedTokens.add(token);
    }
  } catch (error) {
    log(`Error processing token from pool: ${error}`, 'error');
  }
}

/**
 * Main function
 */
async function main() {
  log('🔍 Market Watcher starting...', 'info');
  log(`Jupiter API URL: ${JUPITER_POOLS_URL}`, 'info');
  log(`Scanning interval: ${SEED_INTERVAL/1000}s`, 'info');
  log(`Minimum liquidity: ${MIN_LIQUIDITY} SOL`, 'info');
  
  // Check Redis connection
  try {
    const pingResult = await redis.ping();
    if (pingResult) {
      log('✅ Redis connection established', 'info');
    } else {
      log('❌ Failed to ping Redis', 'error');
      process.exit(1);
    }
  } catch (error) {
    log(`❌ Redis connection error: ${error}`, 'error');
    process.exit(1);
  }
  
  while (true) {
    try {
      const pools = await getPools();
      log(`Checked ${pools.length} pools...`, 'debug');
      
      if (pools.length === 0) {
        log('Warning: No pools returned from Jupiter API', 'warn');
      } else {
        for (const pool of pools) {
          if (pool.outputMint && pool.outputMint !== BASE_TOKEN) {
            await enrichAndStore(pool);
          }
        }
      }
    } catch (err) {
      log(`Error in main loop: ${err}`, 'error');
    }
    
    // Wait for next iteration
    await new Promise((r) => setTimeout(r, SEED_INTERVAL));
  }
}

// Proper shutdown handling
process.on('SIGTERM', async () => {
  log('🛑 Received SIGTERM - Shutting down Market Watcher...', 'info');
  await redis.quit();
  logStream.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('🛑 Received SIGINT - Shutting down Market Watcher...', 'info');
  await redis.quit();
  logStream.end();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  log(`Uncaught exception: ${error}\n${error.stack}`, 'error');
  await redis.quit();
  logStream.end();
  process.exit(1);
});

// Start the market watcher
main().catch(error => {
  log(`Fatal error in main process: ${error}`, 'error');
  process.exit(1);
});