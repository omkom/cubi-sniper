// Main agent entrypoint for Cubi-sniper
import Redis from 'ioredis';
import { isWalletActivated } from './licenseChecker';
import { Strategy } from '../types';
import { verifyToken } from './poolVerifier';
import { getOcamlScore } from './ocamlBridge';
import fetch from 'node-fetch';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const LIVE_MODE = process.env.LIVE_MODE === 'true';
const AI_MODEL_URL = process.env.AI_MODEL_URL || 'http://ai_model:8000';

interface TokenFeatures {
  mint: string;
  symbol: string;
  liquidity: number;
  volume: number;
  volatility_1m?: number;
  buy_sell_ratio?: number;
  time_to_pool?: number;
  holders?: number;
  ai_score?: number;
  creator_score?: number;
  [key: string]: any;
}

async function loadStrategies(): Promise<Strategy[]> {
  try {
    // Simplified loading of strategies
    const manualStrategies: Strategy[] = [
      {
        id: 'liq_gt_10',
        label: 'Liquidity > 10 SOL',
        weight: 1.0,
        condition: (f) => f.liquidity > 10
      },
      {
        id: 'ocaml_hybrid',
        label: 'OCaml Score > 0.75',
        weight: 1.5,
        condition: async (f) => {
          const score = await getOcamlScore(f);
          console.log(`🧠 [OCAML] Score = ${score}`);
          return score > 0.75;
        }
      }
    ];
    
    return manualStrategies;
  } catch (error) {
    console.error('Error loading strategies:', error);
    return [];
  }
}

async function enrichTokenFeatures(token: string): Promise<TokenFeatures | null> {
  try {
    // Fetch token data from Redis
    const tokenData = await redis.call('JSON.GET', `token:${token}`, '$') as string;
    if (!tokenData) return null;
    
    const baseFeatures = JSON.parse(tokenData);
    
    // Enrich with additional features via AI model
    const aiFeatures = await fetchAIScoring(baseFeatures);
    
    return {
      ...baseFeatures,
      ...aiFeatures,
      volatility_1m: 0.2, // Placeholder - would normally be calculated
      buy_sell_ratio: 1.5, // Placeholder
      time_to_pool: 45,
      holders: 50,
      creator_score: 0.85
    };
  } catch (error) {
    console.error(`Error enriching token data for ${token}:`, error);
    return null;
  }
}

async function fetchAIScoring(features: any): Promise<any> {
  try {
    const response = await fetch(`${AI_MODEL_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        features: [
          features.time_since_launch || 60,
          features.holders || 50,
          features.volatility || 0.2,
          features.creator_score || 0.8
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`AI model responded with ${response.status}`);
    }

    const data = await response.json();
    return {
      ai_score: data.roi_per_sec > 0 ? 0.8 : 0.4 // Simplified scoring based on predicted ROI
    };
  } catch (error) {
    console.error('Error fetching AI scoring:', error);
    return { ai_score: 0.5 }; // Default score
  }
}

async function processNewToken(token: string, strategies: Strategy[]) {
  console.log(`Processing new token: ${token}`);
  
  // 1. Verify token is swappable
  const isVerified = await verifyToken(token);
  if (!isVerified) {
    console.log(`❌ Token ${token} failed verification checks`);
    return;
  }
  
  // 2. Enrich token data with additional features
  const features = await enrichTokenFeatures(token);
  if (!features) {
    console.log(`❌ Could not fetch features for ${token}`);
    return;
  }
  
  // 3. Check against strategies
  console.log(`Features for ${token}:`, features);
  for (const strategy of strategies) {
    try {
      const result = await strategy.condition(features);
      
      if (result) {
        console.log(`✅ Strategy ${strategy.id} matched for ${token}!`);
        
        if (LIVE_MODE) {
          console.log(`🔥 LIVE MODE: Would execute buy for ${token} using strategy ${strategy.id}`);
          // Here you would call functions to actually execute the trade
        } else {
          console.log(`🧪 SIMULATION: Would buy ${token} using strategy ${strategy.id}`);
        }
        
        // Record the match in Redis
        await redis.hset(`strategy:${strategy.id}`, 'last_match', token);
        await redis.hincrby(`strategy:${strategy.id}`, 'match_count', 1);
        
        // Only execute one strategy per token for now
        break;
      }
    } catch (error) {
      console.error(`Error evaluating strategy ${strategy.id}:`, error);
    }
  }
}

async function watchNewTokens(strategies: Strategy[]) {
  console.log('Setting up Redis subscription for new tokens...');
  
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  // Subscribe to new token additions
  subscriber.subscribe('new_token', (err) => {
    if (err) {
      console.error('Error subscribing to new_token channel:', err);
      return;
    }
    console.log('Subscribed to new_token channel');
  });
  
  subscriber.on('message', async (channel, token) => {
    if (channel === 'new_token') {
      await processNewToken(token, strategies);
    }
  });
  
  // Also process recently added tokens on startup
  const recentTokens = await redis.zrevrange('pools', 0, 9);
  console.log(`Processing ${recentTokens.length} recent tokens...`);
  
  for (const token of recentTokens) {
    await processNewToken(token, strategies);
  }
}

async function main() {
  console.log('🚀 Cubi-sniper agent starting...');
  console.log(`Mode: ${LIVE_MODE ? 'LIVE 🔥' : 'SIMULATION 🧪'}`);
  
  // Check license/activation (skip for simulation mode)
  if (LIVE_MODE) {
    const isActivated = await isWalletActivated();
    
    if (!isActivated) {
      console.error('❌ Wallet not activated. Please activate your wallet to use Cubi-sniper in LIVE mode.');
      process.exit(1);
    }
    
    console.log('✅ Wallet activated. Ready to snipe!');
  }
  
  // Load trading strategies
  const strategies = await loadStrategies();
  console.log(`Loaded ${strategies.length} trading strategies`);
  
  // Start watching for new tokens
  await watchNewTokens(strategies);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down agent...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down agent...');
  await redis.quit();
  process.exit(0);
});

main().catch(error => {
  console.error('Fatal error in main process:', error);
  process.exit(1);
});