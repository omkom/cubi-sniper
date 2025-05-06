// Enhanced Market Watcher for Cubi-sniper with robust value handling
// Scans Jupiter API for tradable tokens and enriches with AI analysis
import fetch from 'node-fetch';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Configuration from environment variables
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const JUPITER_API_BASE = process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6';
const AI_MODEL_URL = process.env.AI_MODEL_URL || 'http://ai_model:8000';
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
  created_at?: string;
}

interface TokenFeatures {
  mint: string;
  symbol: string;
  name: string;
  liquidity: number; 
  volume: number;
  swapFee: number;
  txRate: number;
  impact: number;
  detected_at: number;
  holders: number;           // Guaranteed to be initialized
  buy_sell_ratio: number;    // Guaranteed to be initialized
  volatility_1m: number;     // Guaranteed to be initialized
  time_to_pool: number;      // Guaranteed to be initialized
  creator_score: number;     // Guaranteed to be initialized
  ai_score: number;          // Guaranteed to be initialized
  risk_score: number;        // Guaranteed to be initialized
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
  outAmount: string;
  inAmount: string;
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

interface TokenStats {
  buys: number;
  sells: number;
  ratio: number;
  volume_in: number;
  volume_out: number;
}

interface AITokenEvaluation {
  ai_score: number;
  roi_prediction: number;
  risk_score: number;
  holder_estimate: number;
  confidence: number;
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

  public async zcard(key: string): Promise<number> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      return await this.redis!.zcard(key);
    } catch (error) {
      log(`Redis zcard error: ${error}`, 'error');
      return 0;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      return await this.redis!.keys(pattern);
    } catch (error) {
      log(`Redis keys error: ${error}`, 'error');
      return [];
    }
  }

  public async del(key: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.del(key);
      return true;
    } catch (error) {
      log(`Redis del error: ${error}`, 'error');
      return false;
    }
  }

  public async flushdb(): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.flushdb();
      return true;
    } catch (error) {
      log(`Redis flushdb error: ${error}`, 'error');
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
 * Validate token data to ensure it has all required fields
 */
function isValidToken(token: any): token is TokenInfo {
  return (
    token &&
    typeof token === 'object' &&
    typeof token.address === 'string' &&
    typeof token.symbol === 'string' &&
    typeof token.name === 'string' &&
    typeof token.decimals === 'number'
  );
}

/**
 * Clear Redis data in debug mode
 * Only clears token data and pool list to start fresh
 */
async function clearRedisDataInDebugMode(): Promise<void> {
  if (!DEBUG_MODE) return;

  log('DEBUG MODE ACTIVE: Cleaning Redis token data...', 'info');
  try {
    // Get token keys
    const tokenKeys = await redis.keys('token:*');
    log(`Found ${tokenKeys.length} token entries to clean`, 'debug');
    
    // Delete token keys
    for (const key of tokenKeys) {
      await redis.del(key);
    }
    
    // Delete pools list
    await redis.del('pools');
    
    log('Redis token data cleared for fresh start', 'info');
  } catch (error) {
    log(`Error cleaning Redis data: ${error}`, 'error');
  }
}

/**
 * Get all tradable token mints from Jupiter API
 */
async function getTradableTokenMints(): Promise<string[]> {
  try {
    // Using the correct Jupiter Token API endpoint for tradable mints
    const response = await fetch('https://lite-api.jup.ag/tokens/v1/mints/tradable');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    let data;
    try {
      const text = await response.text();
      if (!text || text.trim() === '') {
        throw new Error('Empty response');
      }
      data = JSON.parse(text);
    } catch (jsonError) {
      log(`Error parsing JSON from tradable mints API: ${jsonError}`, 'error');
      return [];
    }
    
    // Validate that the data is an array
    if (!Array.isArray(data)) {
      log(`API response is not an array: ${typeof data}`, 'error');
      return [];
    }
    
    // Filter out non-string values
    const validMints = data.filter(mint => typeof mint === 'string');
    
    if (validMints.length < data.length) {
      log(`Filtered out ${data.length - validMints.length} invalid token mints`, 'warn');
    }
    
    return validMints;
  } catch (error) {
    log(`Error fetching tradable token mints: ${error}`, 'error');
    return [];
  }
}

/**
 * Get token info from Jupiter API
 */
async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`https://lite-api.jup.ag/tokens/v1/token/${mint}`);
    if (!response.ok) {
      if (response.status !== 404) { // Ignore 404 errors
        log(`Error fetching token info for ${mint}: ${response.status}`, 'debug');
      }
      return null;
    }
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      log(`Error parsing JSON for token ${mint}: ${jsonError}`, 'debug');
      return null;
    }
    
    // Basic validation of token info
    if (!data || typeof data !== 'object') {
      return null;
    }
    
    // Ensure required fields are present
    if (!data.address || !data.symbol) {
      log(`Token data missing required fields for ${mint}`, 'debug');
      return null;
    }
    
    return {
      address: data.address,
      chainId: data.chainId || 101, // Default to Solana mainnet
      decimals: data.decimals || 0,
      name: data.name || data.symbol,
      symbol: data.symbol,
      logoURI: data.logoURI,
      tags: data.tags || [],
      created_at: data.created_at || new Date().toISOString()
    };
  } catch (error) {
    log(`Error fetching token info for ${mint}: ${error}`, 'debug');
    return null;
  }
}

/**
 * Check token tradability and get trading stats
 * This calculates buy/sell ratio and other important trading metrics
 * Always returns a valid TokenStats object with defaults if needed
 */
async function getTokenTradingStats(tokenMint: string): Promise<TokenStats> {
  // Default values in case of error or no data
  const defaultStats: TokenStats = {
    buys: 1,
    sells: 1,
    ratio: 1.0,
    volume_in: 0.01,
    volume_out: 0.01
  };

  try {
    // First check if token is tradable with a basic quote
    const url = `${JUPITER_API_BASE}/quote?inputMint=${BASE_TOKEN}&outputMint=${tokenMint}&amount=10000000&slippageBps=50`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return defaultStats;
    }
    
    // Check if there is a valid route
    let data: QuoteResponse;
    try {
      data = await response.json();
    } catch (error) {
      log(`Error parsing quote response for ${tokenMint}: ${error}`, 'debug');
      return defaultStats;
    }

    if (!data || !data.outAmount || Number(data.outAmount) <= 0) {
      return defaultStats;
    }
    
    // For our stats calculation, we'll simulate trades in both directions
    // This gives us an estimate of buy/sell activity
    
    // Also check reverse direction (tokenMint to SOL)
    const reverseUrl = `${JUPITER_API_BASE}/quote?inputMint=${tokenMint}&outputMint=${BASE_TOKEN}&amount=10000000&slippageBps=50`;
    
    let reverseResponse: Response;
    try {
      reverseResponse = await fetch(reverseUrl);
    } catch (error) {
      log(`Error fetching reverse quote for ${tokenMint}: ${error}`, 'debug');
      // If reverse fetch fails, assume limited sells but continue
      return {
        buys: 1,
        sells: 0,
        ratio: 10, // High ratio as only buys are possible
        volume_in: Number(data.inAmount) / 1e9 || 0.01, // Convert lamports to SOL
        volume_out: 0
      };
    }
    
    if (!reverseResponse.ok) {
      // If reverse is not available, assume sells are limited
      return {
        buys: 1,
        sells: 0,
        ratio: 10, // High ratio as only buys are possible
        volume_in: Number(data.inAmount) / 1e9 || 0.01, // Convert lamports to SOL
        volume_out: 0
      };
    }
    
    let reverseData: QuoteResponse;
    try {
      reverseData = await reverseResponse.json();
    } catch (error) {
      log(`Error parsing reverse quote response for ${tokenMint}: ${error}`, 'debug');
      return {
        buys: 1,
        sells: 0,
        ratio: 10,
        volume_in: Number(data.inAmount) / 1e9 || 0.01,
        volume_out: 0
      };
    }
    
    // Calculate stats based on both directions
    const buys = 1; // Placeholder - would be actual transaction count in a full implementation
    const sells = reverseData && reverseData.outAmount ? 1 : 0;
    
    return {
      buys,
      sells,
      ratio: sells > 0 ? buys / sells : 10, // Avoid division by zero
      volume_in: Number(data.inAmount) / 1e9 || 0.01, // Convert lamports to SOL
      volume_out: reverseData && reverseData.outAmount ? 
        Number(reverseData.outAmount) / 1e9 || 0 : 0 // Convert lamports to SOL
    };
  } catch (error) {
    log(`Error getting trading stats for ${tokenMint}: ${error}`, 'debug');
    return defaultStats;
  }
}

/**
 * Get token liquidity and price impact details
 * Returns initialized values for all fields
 */
async function getTokenFeatures(tokenMint: string): Promise<{
  liquidity: number;
  impact: number;
  swapFee: number;
  txRate: number;
  buy_sell_ratio: number;
  volatility_1m: number;
}> {
  // Default values in case of error
  const defaultFeatures = {
    liquidity: 0.01,
    impact: 0.05,
    swapFee: 0.003,
    txRate: 0,
    buy_sell_ratio: 1.0,
    volatility_1m: 0.2
  };

  try {
    // Make a quote request with a significant amount to evaluate liquidity
    const url = `${JUPITER_API_BASE}/quote?inputMint=${BASE_TOKEN}&outputMint=${tokenMint}&amount=1000000000&slippageBps=100`;
    
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      log(`Error fetching quote for ${tokenMint}: ${error}`, 'debug');
      return defaultFeatures;
    }
    
    if (!response.ok) {
      return defaultFeatures;
    }
    
    let data: QuoteResponse;
    try {
      data = await response.json();
    } catch (error) {
      log(`Error parsing quote data for ${tokenMint}: ${error}`, 'debug');
      return defaultFeatures;
    }
    
    if (!data || !data.outAmount) {
      return defaultFeatures;
    }
    
    // Calculate liquidity based on swap details
    // This is a simplified estimate - in a full implementation, 
    // we'd use more sophisticated methods
    
    // Price is calculated as SOL amount / token amount
    const inAmountSOL = Number(data.inAmount) / 1e9 || 0.01; // Convert lamports to SOL
    const outAmountToken = Number(data.outAmount) / (10 ** 9) || 0.01; // Assuming 9 decimals
    
    // Validate to avoid NaN or Infinity
    if (isNaN(inAmountSOL) || !isFinite(inAmountSOL) || inAmountSOL <= 0) {
      log(`Invalid inAmountSOL value: ${inAmountSOL} for ${tokenMint}`, 'debug');
      return defaultFeatures;
    }
    
    if (isNaN(outAmountToken) || !isFinite(outAmountToken) || outAmountToken <= 0) {
      log(`Invalid outAmountToken value: ${outAmountToken} for ${tokenMint}`, 'debug');
      return defaultFeatures;
    }
    
    // Estimate liquidity based on price impact
    // Higher impact = lower liquidity
    const priceImpact = data.priceImpactPct || 0.05;
    
    if (isNaN(priceImpact) || !isFinite(priceImpact)) {
      log(`Invalid priceImpact value: ${priceImpact} for ${tokenMint}`, 'debug');
      return defaultFeatures;
    }
    
    // Calculate estimated liquidity with safeguards
    const estimatedLiquidity = inAmountSOL / (priceImpact > 0 ? priceImpact : 0.001);
    
    // Validate the result
    if (isNaN(estimatedLiquidity) || !isFinite(estimatedLiquidity) || estimatedLiquidity < 0) {
      log(`Invalid estimatedLiquidity calculation: ${estimatedLiquidity} for ${tokenMint}`, 'debug');
      return defaultFeatures;
    }
    
    // Get trading stats with buy/sell ratio
    const tradingStats = await getTokenTradingStats(tokenMint);
    
    // Ensure valid buy/sell ratio
    const buySelLRatio = tradingStats.ratio || 1.0;
    
    if (isNaN(buySelLRatio) || !isFinite(buySelLRatio)) {
      log(`Invalid buy/sell ratio: ${buySelLRatio} for ${tokenMint}`, 'debug');
      return {
        ...defaultFeatures,
        liquidity: Math.max(0.01, estimatedLiquidity)
      };
    }
    
    return {
      liquidity: Math.max(0.01, estimatedLiquidity),
      impact: Math.max(0, priceImpact),
      swapFee: 0.003, // Standard DEX fee as placeholder
      txRate: 0, // Not directly available
      buy_sell_ratio: Math.max(0.1, Math.min(20, buySelLRatio)), // Clamp between 0.1 and 20
      volatility_1m: 0.2 // Placeholder - would need historical data
    };
  } catch (error) {
    log(`Error getting features for ${tokenMint}: ${error}`, 'debug');
    return defaultFeatures;
  }
}

/**
 * Query AI model for token evaluation
 * Always returns valid and initialized values
 */
async function getAIEvaluation(features: Partial<TokenFeatures>): Promise<AITokenEvaluation> {
  // Default values in case of failure
  const defaultResponse: AITokenEvaluation = {
    ai_score: 0.5,
    roi_prediction: 0.001,
    risk_score: 0.5,
    holder_estimate: 50,
    confidence: 0.3
  };
  
  try {
    // Check if AI model URL is configured
    if (!AI_MODEL_URL.includes('http')) {
      log('AI Model URL not configured properly, using default scores', 'warn');
      return defaultResponse;
    }
    
    // Format features for AI model with safe default values
    const aiFeatures = [
      features.time_to_pool || 60,
      features.holders || 50,
      features.volatility_1m || 0.2,
      features.creator_score || 0.8
    ];
    
    // Set timeout for AI request
    const timeoutPromise = new Promise<AITokenEvaluation>((resolve) => {
      setTimeout(() => {
        log('AI evaluation request timed out', 'warn');
        resolve(defaultResponse);
      }, 5000);
    });
    
    // Make AI request
    const fetchPromise = fetch(`${AI_MODEL_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: aiFeatures })
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`AI model responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      if (typeof data !== 'object') {
        throw new Error('Invalid AI response format');
      }
      
      // Extract values with defaults and validation
      let aiScore = 0.5;
      if (typeof data.roi_per_sec === 'number' && isFinite(data.roi_per_sec)) {
        aiScore = data.roi_per_sec > 0 ?
          Math.min(0.95, 0.5 + data.roi_per_sec * 5) :
          Math.max(0.1, 0.5 - Math.abs(data.roi_per_sec) * 2);
      }
      
      // Ensure all numbers are valid
      const roiPrediction = typeof data.roi_per_sec === 'number' && isFinite(data.roi_per_sec) ? 
        data.roi_per_sec : 0.001;
      
      const riskScore = typeof data.risk_score === 'number' && isFinite(data.risk_score) ? 
        Math.max(0, Math.min(1, data.risk_score)) : 0.5;
      
      const holderEstimate = typeof data.holder_estimate === 'number' && isFinite(data.holder_estimate) ? 
        Math.max(1, Math.round(data.holder_estimate)) : 50;
      
      const confidence = typeof data.confidence === 'number' && isFinite(data.confidence) ? 
        Math.max(0, Math.min(1, data.confidence)) : 0.5;
      
      return {
        ai_score: aiScore,
        roi_prediction: roiPrediction,
        risk_score: riskScore,
        holder_estimate: holderEstimate,
        confidence: confidence
      };
    })
    .catch(error => {
      log(`AI evaluation error: ${error}`, 'warn');
      return defaultResponse;
    });
    
    // Race between timeout and fetch
    return Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    log(`Error in AI evaluation: ${error}`, 'error');
    return defaultResponse;
  }
}

/**
 * Process a token and store its enriched data in Redis
 * Ensures all values are properly calculated and initialized
 */
async function enrichAndStore(token: TokenInfo): Promise<void> {
  try {
    // Extra validation to ensure token has all required fields
    if (!isValidToken(token)) {
      log(`Skipping invalid token object: ${JSON.stringify(token).substring(0, 100)}...`, 'debug');
      return;
    }
    
    const tokenMint = token.address;
    
    // Skip SOL itself
    if (tokenMint === BASE_TOKEN) return;
    
    // Skip if already processed
    if (processedTokens.has(tokenMint)) {
      if (DEBUG_MODE) {
        log(`Token ${token.symbol} (${tokenMint}) already processed this session, skipping`, 'debug');
      }
      return;
    }

    // Check if token exists in Redis already
    const key = `token:${tokenMint}`;
    const exists = await redis.exists(key);
    if (exists) {
      processedTokens.add(tokenMint);
      return;
    }

    // Get token features including liquidity and trading stats
    const features = await getTokenFeatures(tokenMint);
    
    // Skip tokens with insufficient liquidity
    if (features.liquidity < MIN_LIQUIDITY) {
      if (DEBUG_MODE) {
        log(`Token ${token.symbol} (${tokenMint}) has insufficient liquidity (${features.liquidity} SOL), skipping`, 'debug');
      }
      processedTokens.add(tokenMint);
      return;
    }
    
    // Time since token was observed vs created
    const now = Date.now();
    const timeSinceObserved = 0; // Just discovered
    
    // Fill in creator score - in a full implementation, this would analyze creator wallet history
    const creatorScore = 0.7 + Math.random() * 0.3; // Random placeholder between 0.7-1.0
    
    // Estimate number of holders - in a full implementation, this would query on-chain data
    const estimatedHolders = Math.floor(20 + Math.random() * 100);
    
    // Create token features object with all available data and safe defaults
    const tokenFeatures: TokenFeatures = {
      mint: tokenMint,
      symbol: token.symbol || tokenMint.slice(0, 6),
      name: token.name || token.symbol || 'Unknown Token',
      liquidity: Math.max(0.01, features.liquidity),
      volume: 0, // Not available from API
      swapFee: features.swapFee || 0.003,
      txRate: features.txRate || 0,
      impact: features.impact || 0.05,
      detected_at: now,
      holders: estimatedHolders,
      buy_sell_ratio: features.buy_sell_ratio || 1.0,
      volatility_1m: features.volatility_1m || 0.2,
      time_to_pool: timeSinceObserved,
      creator_score: creatorScore,
      ai_score: 0.5, // Default before AI evaluation
      risk_score: 0.5  // Default before AI evaluation
    };

    // Get AI evaluation
    const aiEvaluation = await getAIEvaluation(tokenFeatures);
    
    // Enrich with AI scores - ensure we have valid values
    tokenFeatures.ai_score = aiEvaluation.ai_score || 0.5;
    tokenFeatures.risk_score = aiEvaluation.risk_score || 0.5;
    
    // Update holder estimate from AI if available
    if (aiEvaluation.holder_estimate > 0) {
      tokenFeatures.holders = aiEvaluation.holder_estimate;
    }

    log(`[+] New token detected: ${tokenFeatures.symbol} (${tokenMint}) - AI Score: ${aiEvaluation.ai_score.toFixed(2)}, Risk: ${aiEvaluation.risk_score.toFixed(2)}`, 'info');
    
    // Store token data in Redis
    await redis.set(key, JSON.stringify(tokenFeatures));
    
    // Announce new token on dedicated channel
    await redis.publish('new_token', tokenMint);
    
    // Add to chronological list
    await redis.zadd('pools', now, tokenMint);

    // Add to processed tokens for this session
    processedTokens.add(tokenMint);
    
    log(`Token ${tokenFeatures.symbol} processed with features: 
      Liquidity: ${tokenFeatures.liquidity.toFixed(2)} SOL
      Buy/Sell Ratio: ${tokenFeatures.buy_sell_ratio.toFixed(2)}
      AI Score: ${tokenFeatures.ai_score.toFixed(2)}`, 'debug');
  } catch (error) {
    log(`Error processing token ${token.address || 'unknown'}: ${error}`, 'error');
  }
}

/**
 * Calculate the current stats about Redis data
 */
async function logRedisStats(): Promise<void> {
  try {
    const totalTokens = await redis.zcard('pools');
    const tokenKeys = await redis.keys('token:*');
    const enrichedCount = tokenKeys.length;
    
    log(`Redis Stats:
      Total tracked tokens: ${totalTokens}
      Enriched tokens: ${enrichedCount}
      Processed this session: ${processedTokens.size}`, 'info');
  } catch (error) {
    log(`Error getting Redis stats: ${error}`, 'error');
  }
}

/**
 * Main function
 */
async function main() {
  log('🔍 Enhanced Market Watcher starting...', 'info');
  log(`Jupiter API URL: ${JUPITER_API_BASE}`, 'info');
  log(`AI Model URL: ${AI_MODEL_URL}`, 'info');
  log(`Scanning interval: ${SEED_INTERVAL/1000}s`, 'info');
  log(`Minimum liquidity: ${MIN_LIQUIDITY} SOL`, 'info');
  log(`Debug mode: ${DEBUG_MODE ? 'ENABLED' : 'DISABLED'}`, 'info');
  
  // Clean Redis data in debug mode
  if (DEBUG_MODE) {
    await clearRedisDataInDebugMode();
  }
  
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
      // Get all tradable token mints
      const mints = await getTradableTokenMints();
      log(`Found ${mints.length} tradable token mints from Jupiter API...`, 'info');
      
      if (mints.length === 0) {
        log('Warning: No tradable tokens returned from Jupiter API', 'warn');
      } else {
        // Process a batch of tokens to avoid rate limiting
        const batchSize = 100;
        const mintBatch = mints.slice(0, batchSize);
        
        log(`Processing batch of ${mintBatch.length} token mints...`, 'debug');
        
        // Fetch detailed info for all tokens in batch
        const tokenDetails = [];
        
        for (const mint of mintBatch) {
          try {
            // Skip if already processed
            if (processedTokens.has(mint)) {
              if (DEBUG_MODE) {
                log(`Token mint ${mint} already processed this session, skipping`, 'debug');
              }
              continue;
            }

            // Check if token exists in Redis already
            const key = `token:${mint}`;
            const exists = await redis.exists(key);
            if (exists) {
              processedTokens.add(mint);
              continue;
            }
            
            // Get token info
            const tokenInfo = await getTokenInfo(mint);
            if (!tokenInfo) {
              log(`Couldn't get info for token mint ${mint}, skipping`, 'debug');
              processedTokens.add(mint);
              continue;
            }
            
            // Get full token details including created_at
            const fullDetails = await fetch(`https://lite-api.jup.ag/tokens/v1/token/${mint}`);
            if (fullDetails.ok) {
              const detailsData = await fullDetails.json() as any;
              
              // Add created_at if available
              if (detailsData.created_at) {
                tokenInfo.created_at = detailsData.created_at;
              }
              
              // Add token to list with its details
              tokenDetails.push({
                token: tokenInfo,
                created_at: tokenInfo.created_at || new Date().toISOString(),
                mint
              });
            }
          } catch (error) {
            log(`Error processing token mint ${mint}: ${error}`, 'error');
          }
          
          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Sort tokens by creation date (newest first)
        tokenDetails.sort((a, b) => {
          // If created_at is missing for either token, put it at the end
          if (!a.created_at) return 1;
          if (!b.created_at) return -1;
          
          // Otherwise sort by date (descending)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        log(`Sorted ${tokenDetails.length} tokens by creation date (newest first)`, 'info');
        
        // Process sorted tokens
        for (const { token } of tokenDetails) {
          await enrichAndStore(token);
        }
        
        // Log Redis stats every scan
        await logRedisStats();
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