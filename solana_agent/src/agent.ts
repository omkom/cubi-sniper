// Main agent entrypoint for Cubi-sniper
import Redis from 'ioredis';
import { isWalletActivated } from './licenseChecker';
import { Strategy, TokenFeatures as GlobalTokenFeatures } from '../types';
import { verifyToken } from './poolVerifier';
import { getOcamlScore } from './ocamlBridge';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const LIVE_MODE = process.env.LIVE_MODE === 'true';
const AI_MODEL_URL = process.env.AI_MODEL_URL || 'http://ai_model:8000';
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const RETRY_INTERVAL = 5000; // 5 secondes
const MAX_RETRIES = 5;

// Logging setup
const LOG_DIR = 'logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const logFile = path.join(LOG_DIR, `agent_${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message: string, level: 'info' | 'error' | 'warn' = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

// Define local TokenFeatures interface with index signature
interface TokenFeatures extends GlobalTokenFeatures {
  [key: string]: any; // Add index signature
}

// Redis Client avec reconnexion automatique
class RobustRedisClient {
  private redis: Redis | null = null;
  private reconnectAttempts = 0;
  private isConnected = false;

  constructor(private redisUrl: string) {
    this.connect();
  }

  private connect() {
    try {
      this.redis = new Redis(redisUrl, {
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

  public async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.hset(key, field, value);
      return true;
    } catch (error) {
      log(`Redis hset error: ${error}`, 'error');
      return false;
    }
  }

  public async hincrby(key: string, field: string, increment: number): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      await this.redis!.hincrby(key, field, increment);
      return true;
    } catch (error) {
      log(`Redis hincrby error: ${error}`, 'error');
      return false;
    }
  }

  public async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    try {
      return await this.redis!.zrevrange(key, start, stop);
    } catch (error) {
      log(`Redis zrevrange error: ${error}`, 'error');
      return [];
    }
  }

  public async subscribe(channel: string): Promise<Redis> {
    if (!this.isConnected || !this.redis) {
      await this.reconnect();
    }
    const subscriber = new Redis(this.redisUrl);
    try {
      await subscriber.subscribe(channel);
      return subscriber;
    } catch (error) {
      log(`Redis subscribe error: ${error}`, 'error');
      throw error;
    }
  }

  private async reconnect() {
    if (this.reconnectAttempts >= MAX_RETRIES) {
      log('Max reconnect attempts reached. Exiting...', 'error');
      process.exit(1);
    }

    log(`Attempting to reconnect to Redis (${++this.reconnectAttempts}/${MAX_RETRIES})...`, 'warn');
    
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
      }, RETRY_INTERVAL);

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

async function loadStrategies(): Promise<Strategy[]> {
  try {
    // Essayer de charger les stratégies depuis Redis d'abord (persistance)
    try {
      const cachedStrategies = await redis.get('active_strategies');
      if (cachedStrategies) {
        log('Loaded strategies from Redis cache');
        return JSON.parse(cachedStrategies);
      }
    } catch (error) {
      log(`Error loading cached strategies: ${error}`, 'warn');
    }

    // Chargement simplifié des stratégies
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
          // Avec retry en cas d'échec
          let retries = 0;
          while (retries < 3) {
            try {
              const score = await getOcamlScore(f as Record<string, number>);
              log(`🧠 [OCAML] Score = ${score}`);
              return score > 0.75;
            } catch (error) {
              log(`OCaml scoring failed (attempt ${retries + 1}/3): ${error}`, 'warn');
              retries++;
              if (retries < 3) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          // Fallback si OCaml échoue
          log('OCaml scoring failed, using fallback', 'warn');
          return f.liquidity > 15 && (f.buy_sell_ratio || 0) > 1.2;
        }
      }
    ];
    
    // Sauvegarder dans Redis pour les prochains démarrages
    await redis.set('active_strategies', JSON.stringify(manualStrategies));
    
    return manualStrategies;
  } catch (error) {
    log(`Error loading strategies: ${error}`, 'error');
    return [];
  }
}

async function enrichTokenFeatures(token: string): Promise<TokenFeatures | null> {
  try {
    // Récupérer les données du token depuis Redis
    const tokenJson = await redis.get(`token:${token}`);
    if (!tokenJson) return null;
    
    const baseFeatures = JSON.parse(tokenJson);
    
    // Enrichir avec des features additionnelles via le modèle IA
    const aiFeatures = await fetchAIScoring(baseFeatures);
    
    // Données enrichies
    const enrichedFeatures: TokenFeatures = {
      ...baseFeatures,
      ...aiFeatures,
      volatility_1m: Math.random() * 0.4,  // Placeholder - normalement calculé
      buy_sell_ratio: 1.0 + Math.random() * 2.0,  // Placeholder
      time_to_pool: baseFeatures.detected_at ? (Date.now() - baseFeatures.detected_at) / 1000 : 60,
      holders: Math.floor(20 + Math.random() * 100),
      creator_score: 0.7 + Math.random() * 0.3,
      swapFee: baseFeatures.swapFee || 0,
      txRate: baseFeatures.txRate || 0,
      impact: baseFeatures.impact || 0,
      detected_at: baseFeatures.detected_at || Date.now()
    };
    
    // Sauvegarder les features enrichies pour réutilisation
    const enrichedKey = `enriched:${token}`;
    await redis.set(enrichedKey, JSON.stringify(enrichedFeatures));
    // TTL de 1 heure pour les données enrichies
    // await redis.expire(enrichedKey, 3600);
    
    return enrichedFeatures;
  } catch (error) {
    log(`Error enriching token data for ${token}: ${error}`, 'error');
    return null;
  }
}

async function fetchAIScoring(features: any): Promise<any> {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI request timeout')), 5000);
    });
    
    const fetchPromise = fetch(`${AI_MODEL_URL}/predict`, {
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
    
    // Race entre la requête et le timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

    if (!response.ok) {
      throw new Error(`AI model responded with ${response.status}`);
    }

    const data = await response.json();
    if (typeof data === 'object') {
      return {
        ai_score: data.roi_per_sec > 0 ? 
          Math.min(0.95, 0.5 + data.roi_per_sec * 5) : 
          Math.max(0.1, 0.5 - Math.abs(data.roi_per_sec as number) * 2),
        roi_prediction: data.roi_per_sec
      };
    } else {
      log(`Unexpected AI model response: ${JSON.stringify(data)}`, 'warn');
      return { ai_score: 0.5, roi_prediction: 0.001 };
    }
  } catch (error) {
    log(`Error fetching AI scoring: ${error}`, 'error');
    // Valeurs de repli en cas d'échec
    return { ai_score: 0.5, roi_prediction: 0.001 };
  }
}

async function processNewToken(token: string, strategies: Strategy[]) {
  log(`Processing new token: ${token}`);
  
  // Cache d'état pour ne pas retraiter les tokens
  const processedKey = `processed:${token}`;
  const isProcessed = await redis.get(processedKey);
  if (isProcessed) {
    log(`Token ${token} already processed, skipping`);
    return;
  }
  
  // 1. Vérifier que le token est swappable
  const isVerified = await verifyToken(token);
  if (!isVerified) {
    log(`❌ Token ${token} failed verification checks`);
    // Marquer comme traité pour éviter de répéter
    await redis.set(processedKey, Date.now().toString());
    return;
  }
  
  // 2. Enrichir les données du token avec des features additionnelles
  const features = await enrichTokenFeatures(token);
  if (!features) {
    log(`❌ Could not fetch features for ${token}`);
    await redis.set(processedKey, Date.now().toString());
    return;
  }
  
  // 3. Vérifier contre les stratégies
  log(`Features for ${token}: ${JSON.stringify(features)}`);
  for (const strategy of strategies) {
    try {
      const result = await strategy.condition(features);
      
      if (result) {
        log(`✅ Strategy ${strategy.id} matched for ${token}!`);
        
        // Annoncer le match pour les hooks
        await redis.publish('strategy_match', JSON.stringify({
          token,
          strategy: strategy.id,
          features,
          timestamp: Date.now()
        }));
        
        if (LIVE_MODE) {
          log(`🔥 LIVE MODE: Would execute buy for ${token} using strategy ${strategy.id}`);
          // Ici, vous appelleriez les fonctions pour exécuter le trade
        } else {
          log(`🧪 SIMULATION: Would buy ${token} using strategy ${strategy.id}`);
          // Simulation uniquement
        }
        
        // Enregistrer le match dans Redis
        await redis.hset(`strategy:${strategy.id}`, 'last_match', token);
        await redis.hincrby(`strategy:${strategy.id}`, 'match_count', 1);
        
        // Une seule stratégie par token pour l'instant
        break;
      }
    } catch (error) {
      log(`Error evaluating strategy ${strategy.id}: ${error}`, 'error');
    }
  }
  
  // Marquer comme traité pour éviter de répéter
  await redis.set(processedKey, Date.now().toString());
}

async function watchNewTokens(strategies: Strategy[]) {
  log('Setting up Redis subscription for new tokens...');
  
  try {
    const subscriber = await redis.subscribe('new_token');
    
    subscriber.on('message', (channel: string, token: string) => {
      if (channel === 'new_token') {
        processNewToken(token, strategies).catch(error => {
          log(`Error processing token ${token}: ${error}`, 'error');
        });
      }
    });
    
    log('Subscribed to new_token channel');
    
    // Traiter également les tokens récemment ajoutés au démarrage
    const recentTokens = await redis.zrevrange('pools', 0, 9);
    log(`Processing ${recentTokens.length} recent tokens...`);
    
    for (const token of recentTokens) {
      await processNewToken(token, strategies);
    }
    
    return true;
  } catch (error) {
    log(`Error subscribing to Redis channel: ${error}`, 'error');
    return false;
  }
}

// Vérification périodique de l'état du système
async function healthCheck() {
  try {
    // Vérifier Redis
    const ping = await fetch(`${AI_MODEL_URL}/health`);
    if (!ping.ok) {
      log('AI service health check failed', 'warn');
    } else {
      log('Health check: All services running');
    }
  } catch (error) {
    log(`Health check error: ${error}`, 'warn');
  }
}

async function main() {
  log('🚀 Cubi-sniper agent starting...');
  log(`Mode: ${LIVE_MODE ? 'LIVE 🔥' : 'SIMULATION 🧪'}`);
  
  // Vérifier la licence/activation (ignorer en mode simulation)
  if (LIVE_MODE) {
    const isActivated = await isWalletActivated();
    
    if (!isActivated) {
      log('❌ Wallet not activated. Please activate your wallet to use Cubi-sniper in LIVE mode.', 'error');
      process.exit(1);
    }
    
    log('✅ Wallet activated. Ready to snipe!');
  }
  
  // Charger les stratégies de trading
  const strategies = await loadStrategies();
  log(`Loaded ${strategies.length} trading strategies`);
  
  // Mettre en place la vérification périodique de l'état du système
  setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
  
  // Initialiser la supervision des tokens
  let watchSuccess = false;
  let watchRetries = 0;
  
  while (!watchSuccess && watchRetries < MAX_RETRIES) {
    try {
      watchSuccess = await watchNewTokens(strategies);
      
      if (!watchSuccess) {
        watchRetries++;
        log(`Failed to watch new tokens (attempt ${watchRetries}/${MAX_RETRIES}), retrying...`, 'warn');
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }
    } catch (error) {
      watchRetries++;
      log(`Error in watchNewTokens (attempt ${watchRetries}/${MAX_RETRIES}): ${error}`, 'error');
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }
  }
  
  if (!watchSuccess) {
    log('Failed to initialize token watching after multiple attempts. Exiting...', 'error');
    process.exit(1);
  }
  
  // Signal que l'agent est prêt
  log('🎯 Cubi-sniper agent is now watching for new tokens');
  
  // Créer un fichier PID pour le monitoring externe
  fs.writeFileSync('agent.pid', process.pid.toString());
}

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
  log('Shutting down agent (SIGTERM)...');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('Shutting down agent (SIGINT)...');
  await cleanup();
  process.exit(0);
});

// Gestion des erreurs non capturées
process.on('uncaughtException', async (error) => {
  log(`Uncaught exception: ${error}\n${error.stack}`, 'error');
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  log(`Unhandled rejection at ${promise}: ${reason}`, 'error');
});

// Nettoyage avant sortie
async function cleanup() {
  log('Running cleanup tasks...');
  try {
    // Fermer proprement la connexion Redis
    await redis.quit();
    // Fermer le flux de logs
    logStream.end();
    // Supprimer le fichier PID
    if (fs.existsSync('agent.pid')) {
      fs.unlinkSync('agent.pid');
    }
    log('Cleanup completed');
  } catch (error) {
    log(`Error during cleanup: ${error}`, 'error');
  }
}

// Démarrer l'agent
main().catch(error => {
  log(`Fatal error in main process: ${error}\n${error.stack}`, 'error');
  cleanup().finally(() => process.exit(1));
});