// Scan Jupiter Token API for tradable tokens
import fetch from 'node-fetch';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Configuration from environment variables
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JUPITER_API_BASE = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
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
interface TokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
  extensions?: Record<string, any>;
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

interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  amount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: any;
  priceImpactPct: number;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
}

interface RoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
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
 * Get all tokens from Jupiter API
 */
async function getAllTokens(): Promise<TokenInfo[]> {
  try {
    // Using the correct Jupiter API token endpoint
    const response = await fetch(`${JUPITER_API_BASE}/tokens`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    log(`Error fetching tokens: ${error}`, 'error');
    return [];
  }
}

/**
 * Check if a token is tradable by making a sample quote request
 */
async function isTokenTradable(tokenMint: string): Promise<boolean> {
  try {
    // Using the quote endpoint to check if the token can be swapped with SOL
    const url = `${JUPITER_API_BASE}/quote?inputMint=${BASE_TOKEN}&outputMint=${tokenMint}&amount=10000000&slippageBps=50`;
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    
    // Check if there is a valid route
    const data = await response.json() as any;
    return data && data.outAmount && Number(data.outAmount) > 0;
  } catch (error) {
    log(`Error checking tradability for ${tokenMint}: ${error}`, 'debug');
    return false;
  }
}

/**
 * Get additional features for a token using a quote request
 */
async function getTokenFeatures(tokenMint: string): Promise<Partial<TokenFeatures>> {
  try {
    // Make a quote request to get token details like liquidity and price impact
    const url = `${JUPITER_API_BASE}/quote?inputMint=${BASE_TOKEN}&outputMint=${tokenMint}&amount=100000000&slippageBps=50`;
    const response = await fetch(url);
    if (!response.ok) {
      return {};
    }
    
    const data = await response.json() as QuoteResponse;
    
    // Extract relevant data from the quote response
    return {
      liquidity: 10, // Not directly provided, would need calculation
      impact: data.priceImpactPct || 0,
      swapFee: 0.3, // Not directly provided, would need calculation
      txRate: 0 // Not directly provided
    };
  } catch (error) {
    log(`Error getting features for ${tokenMint}: ${error}`, 'debug');
    return {};
  }
}

/**
 * Process a token and store its data in Redis
 */
async function enrichAndStore(token: TokenInfo): Promise<void> {
  try {
    const tokenMint = token.address;
    
    // Skip SOL itself
    if (tokenMint === BASE_TOKEN) return;
    
    // Skip if already processed
    if (processedTokens.has(tokenMint)) {
      if (DEBUG_MODE) {
        log(`Token ${tokenMint} already processed this session, skipping`, 'debug');
      }
      return;
    }

    // Check if token exists in Redis already
    const key = `token:${tokenMint}`;
    const exists = await redis.exists(key);
    if (exists) {
      return;
    }

    // Check if token is tradable first (quick filter)
    const tradable = await isTokenTradable(tokenMint);
    if (!tradable) {
      if (DEBUG_MODE) {
        log(`Token ${token.symbol} (${tokenMint}) is not tradable, skipping`, 'debug');
      }
      processedTokens.add(tokenMint);
      return;
    }

    // Get additional features for the token
    const features = await getTokenFeatures(tokenMint);
    
    // Create token features object
    const tokenFeatures: TokenFeatures = {
      mint: tokenMint,
      symbol: token.symbol || tokenMint.slice(0, 6),
      liquidity: features.liquidity || 0,
      volume: 0, // Not available from API
      swapFee: features.swapFee || 0,
      txRate: features.txRate || 0,
      impact: features.impact || 0,
      detected_at: Date.now()
    };

    // Check if token has sufficient liquidity (if available)
    if (tokenFeatures.liquidity < MIN_LIQUIDITY) {
      if (DEBUG_MODE) {
        log(`Token ${token.symbol} (${tokenMint}) has insufficient liquidity (${tokenFeatures.liquidity} SOL), skipping`, 'debug');
      }
      processedTokens.add(tokenMint);
      return;
    }

    log(`[+] New token detected: ${tokenFeatures.symbol} (${tokenMint})`, 'info');
    
    // Store token data in Redis
    await redis.set(key, JSON.stringify(tokenFeatures));
    
    // Announce new token on dedicated channel
    await redis.publish('new_token', tokenMint);
    
    // Add to chronological list
    await redis.zadd('pools', Date.now(), tokenMint);

    // Add to processed tokens for this session
    processedTokens.add(tokenMint);
  } catch (error) {
    log(`Error processing token ${token.address}: ${error}`, 'error');
  }
}

/**
 * Main function
 */
async function main() {
  log('🔍 Market Watcher starting...', 'info');
  log(`Jupiter API URL: ${JUPITER_API_BASE}`, 'info');
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
      // Get all tokens
      const tokens = await getAllTokens();
      log(`Found ${tokens.length} tokens from Jupiter API...`, 'info');
      
      if (tokens.length === 0) {
        log('Warning: No tokens returned from Jupiter API', 'warn');
      } else {
        // Process a batch of tokens to avoid rate limiting
        const batchSize = 100;
        const tokenBatch = tokens.slice(0, batchSize);
        
        log(`Processing batch of ${tokenBatch.length} tokens...`, 'debug');
        
        // Process tokens sequentially to avoid rate limiting
        for (const token of tokenBatch) {
          await enrichAndStore(token);
          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
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