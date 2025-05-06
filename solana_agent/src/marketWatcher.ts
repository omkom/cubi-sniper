// Scan Jupiter Token API for tradable tokens
import fetch from 'node-fetch';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const JUPITER_TOKEN_API = 'https://api.jup.ag/tokens/v1'; // Updated to use the Jupiter Token API
const SEED_INTERVAL = 15_000; // 15 sec
const BASE_TOKEN = 'So11111111111111111111111111111111111111112'; // SOL

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
  daily_volume?: number;
  created_at?: string;
  extensions?: any;
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

// Get tradable tokens from Jupiter Token API
async function getTradableTokens(): Promise<string[]> {
  try {
    const response = await fetch(`${JUPITER_TOKEN_API}/mints/tradable`);
    
    if (!response.ok) {
      console.error(`Error response from Jupiter API: ${response.status} ${response.statusText}`);
      return [];
    }
    
    // Safely parse JSON with error handling
    try {
      const text = await response.text();
      if (!text || text.trim() === '') {
        console.error('Empty response from Jupiter API');
        return [];
      }
      
      const data = JSON.parse(text);
      
      if (!Array.isArray(data)) {
        console.error(`Unexpected response format from Jupiter API: ${typeof data}`);
        return [];
      }
      
      return data;
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return [];
    }
  } catch (error) {
    console.error('Network error when fetching tradable tokens:', error);
    return [];
  }
}

// Get token information
async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`${JUPITER_TOKEN_API}/token/${mint}`);
    
    if (!response.ok) {
      if (response.status !== 404) { // Ignore 404 errors
        console.error(`Error fetching token info for ${mint}: ${response.status} ${response.statusText}`);
      }
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching token info for ${mint}:`, error);
    return null;
  }
}

async function enrichAndStore(mint: string): Promise<void> {
  try {
    // Skip if we've already processed this token
    const exists = await redis.exists(`token:${mint}`);
    if (exists) {
      return;
    }
    
    // Get token information
    const tokenInfo = await getTokenInfo(mint);
    if (!tokenInfo) {
      return;
    }
    
    // Create token features
    const features: TokenFeatures = {
      mint: tokenInfo.address,
      symbol: tokenInfo.symbol || tokenInfo.address.slice(0, 6),
      liquidity: 0, // Not provided by API
      volume: tokenInfo.daily_volume || 0,
      swapFee: 0, // Not provided by API
      txRate: 0, // Not provided by API
      impact: 0, // Not provided by API
      detected_at: Date.now()
    };

    console.log(`[+] New token: ${features.symbol} (${features.mint})`);
    
    // Store in Redis
    await redis.set(`token:${mint}`, JSON.stringify(features));
    
    // Announce new token
    redis.publish('new_token', mint);
    
    // Add to pools list for chronological tracking
    await redis.zadd('pools', Date.now(), mint);
  } catch (error) {
    console.error(`Error processing token ${mint}:`, error);
  }
}

// Function to get token data from Redis
async function getTokenData(token: string): Promise<TokenFeatures | null> {
  try {
    const key = `token:${token}`;
    const jsonStr = await redis.get(key);
    
    if (!jsonStr) return null;
    
    return JSON.parse(jsonStr) as TokenFeatures;
  } catch (error) {
    console.error(`Error retrieving token ${token}:`, error);
    return null;
  }
}

async function main() {
  console.log('🔍 Market Watcher démarré...');
  console.log(`Scanner Jupiter Token API toutes les ${SEED_INTERVAL / 1000}s`);
  
  // Check if Redis is accessible
  try {
    await redis.ping();
    console.log('✅ Connexion Redis établie');
  } catch (error) {
    console.error('❌ Erreur de connexion Redis:', error);
    process.exit(1);
  }
  
  while (true) {
    try {
      // Get tradable tokens
      const tokens = await getTradableTokens();
      console.log(`Trouvé ${tokens.length} tokens négociables...`);
      
      // Process a batch of tokens (limit to avoid rate limiting)
      const batchSize = 10;
      const newTokens = tokens.slice(0, batchSize);
      
      // Process tokens in parallel
      await Promise.all(newTokens.map(mint => enrichAndStore(mint)));
      
    } catch (err) {
      console.error('Erreur watcher Jupiter:', err);
    }
    
    // Wait before next check
    await new Promise((r) => setTimeout(r, SEED_INTERVAL));
  }
}

// Handle interrupts gracefully
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

main().catch(error => {
  console.error('Fatal error in market watcher:', error);
  process.exit(1);
});