/*
 * Market‑Watcher (Jupiter v6) – env‑driven version
 * -------------------------------------------------
 * Reads its configuration exclusively from process.env (see .env sample below)
 * and scans the SOL side of Jupiter for fresh output mints.
 * Found pools are cached in Redis and a token‑mint is published on channel
 * `new_token` the first time we detect it.
 * ---------------------------------------------------------------------------
 * Required env keys (with defaults in parentheses)
 *   REDIS_URL                      – redis://localhost:6379
 *   JUPITER_API_BASE               – https://quote-api.jup.ag/v6   (quote base)
 *   BASE_TOKEN                     – So11111111111111111111111111111111111111112
 *   SCAN_INTERVAL_MS               – 15000
 * ---------------------------------------------------------------------------
 * Optional env keys
 *   ENV                            – prod | local  (only affects logging)
 *   DEBUG                          – true | false – extra logs
 * ---------------------------------------------------------------------------
 * 2025‑05 – works with Jupiter route‑map & pools endpoints.
 */

import 'dotenv/config';
import fetch, { RequestInit, Headers as NodeFetchHeaders } from 'node-fetch';
import Redis from 'ioredis';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { logger, readLogsFile, addLogEntry } from './logger';
import { getPairInformation, getLiquidityInfo } from './solana';
import { evaluateToken } from './tokenValidator';

// ----------------------- configuration helpers ----------------------

const cfg = {
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jupBase: normalizeQuoteBase(process.env.JUPITER_API_BASE),
  baseMint: process.env.BASE_TOKEN ?? 'So11111111111111111111111111111111111111112',
  scanEvery: Number(process.env.SCAN_INTERVAL_MS ?? '15000'),
  env: process.env.ENV ?? 'prod',
  debug: /^true$/i.test(process.env.DEBUG ?? '')
} as const;

function normalizeQuoteBase(url?: string): string {
  if (!url) return 'https://quote-api.jup.ag/v6';
  // accept either /swap/v1 or /v6 or bare; always strip trailing path after hostname
  return url.replace(/\/swap\/v\d+$/, '').replace(/\/$/, '');
}

// ----------------------- derived Jupiter endpoints ------------------

const ENDPOINT = {
  routeMap: `${cfg.jupBase}/route-map`, // Corrected endpoint
  pools: `${cfg.jupBase}/pools`,
  tokens: `${cfg.jupBase}/tokens`
} as const;

// ----------------------------- redis --------------------------------

const redis = new Redis(cfg.redisUrl, {
  retryStrategy: (times: number) => {
    // Reconnect after 2^times * 100 ms
    return Math.min(times * 100, 3000);
  }
});

// ----------------------------- types --------------------------------

type RouteMap = Record<string, string[]>;

interface RawPool {
  inputMint: string;
  outputMint: string;
  outputSymbol?: string;
  liquidity?: number;
  volume?: number;
  swapFeeBps: number;
  txRate?: number;
  priceImpactPct?: number;
}

interface TokenMeta {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
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

interface LogEntry {
  type: string;
  data: {
    address: string;
  };
}

interface TokenInfo extends TokenMeta {
  initialPrice: number;
  liquiditySOL: number;
  volume24h: number;
  priceChange: any;
  txns: any;
  pairAddress: string;
  isNew: boolean;
  source: string;
  validationScore?: number;
  risk?: string;
  recommendation?: string;
}

// Cache for processed pools to avoid reprocessing
const processedPools = new Set<string>();

// --------------------------- fetch utils ----------------------------

async function safeFetch<T>(url: string, init: RequestInit = {}, maxRetry = 3): Promise<T | null> {
  let attempt = 0;
  let backoff = 1000;
  while (attempt < maxRetry) {
    try {
      // Create a new Headers object and populate it
      const headers = new NodeFetchHeaders(init.headers);
      headers.set('accept-encoding', 'gzip');

      const res = await fetch(url, {
        ...init,
        headers: headers
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      attempt += 1;
      console.error(`[fetch] ${url} – ${err} (attempt ${attempt})`);
      if (attempt >= maxRetry) break;
      await new Promise(r => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
  return null;
}

// --------------------------- jupiter helpers ------------------------

async function getOutputMints(): Promise<string[]> {
  const data = await safeFetch<{ routeMap: RouteMap }>(`${ENDPOINT.routeMap}?inputMint=${cfg.baseMint}`);
  return data?.routeMap?.[cfg.baseMint] ?? [];
}

async function getPools(mints: string[]): Promise<RawPool[]> {
  if (!mints.length) return [];
  const qs = mints.map(m => `outputMint=${m}`).join('&');
  return (await safeFetch<RawPool[]>(`${ENDPOINT.pools}?inputMint=${cfg.baseMint}&${qs}`)) ?? [];
}

const tokenMetaCache = new Map<string, TokenMeta>();
async function getTokenMeta(mint: string): Promise<TokenMeta | null> {
  if (tokenMetaCache.has(mint)) return tokenMetaCache.get(mint)!;
  const meta = await safeFetch<TokenMeta>(`${ENDPOINT.tokens}/${mint}`);
  if (meta) tokenMetaCache.set(mint, meta);
  return meta ?? null;
}

// --------------------------- redis helpers --------------------------

function key(mint: string): string {
  return `token:${mint}`;
}

async function maybeStore(pool: RawPool): Promise<void> {
  const mint = pool.outputMint;
  const redisKey = key(mint);
  if (await redis.exists(redisKey)) return;

  const meta = await getTokenMeta(mint);

  const doc: TokenFeatures = {
    mint,
    symbol: meta?.symbol ?? pool.outputSymbol ?? mint.slice(0, 6),
    liquidity: pool.liquidity ?? 0,
    volume: pool.volume ?? 0,
    swapFee: pool.swapFeeBps / 100,
    txRate: pool.txRate ?? 0,
    impact: pool.priceImpactPct ?? 0,
    detected_at: Date.now()
  };

  const pipe = redis.pipeline();
  pipe.set(redisKey, JSON.stringify(doc));
  pipe.zadd('pools', Date.now(), mint);
  pipe.publish('new_token', mint);
  await pipe.exec();

  console.log(`🆕  ${doc.symbol} (${mint})`);
}

// --------------------------- pool detection logic -------------------

async function detectNewPools(): Promise<void> {
  try {
    const dexScreenerApiUrl = process.env.DEX_SCREENER_API_URL || 'https://api.dexscreener.com';
    const response = await axios.get(`${dexScreenerApiUrl}/token-profiles/latest/v1`);
    const newPools = response.data;

    logger.debug(`${newPools.length} nouveaux pools détectés via DexScreener`);

    const logs = await readLogsFile();
    const existingTokens = new Set(
      logs.filter((log: LogEntry) => log.type === 'TOKEN_DETECTED')
          .map(log => log.data.address)
    );

    logger.debug(`${existingTokens.size} tokens existants dans les logs`);

    for (const token of newPools) {
      if (token.chainId !== 'solana') continue;

      const tokenAddress = token.tokenAddress;

      if (processedPools.has(tokenAddress) || existingTokens.has(tokenAddress)) {
        continue;
      }

      processedPools.add(tokenAddress);

      try {
        const pairInfo = await getPairInformation('solana', tokenAddress);

        if (!pairInfo?.baseToken?.name || !pairInfo?.baseToken?.symbol) {
          logger.debug(`Structure d'information de paire invalide pour ${tokenAddress}`);
          continue;
        }

        const tokenInfo: TokenInfo = {
          address: tokenAddress,
          name: pairInfo.baseToken.name,
          symbol: pairInfo.baseToken.symbol,
          initialPrice: parseFloat(pairInfo.priceNative) || 0,
          liquiditySOL: pairInfo.liquidity?.quote || 0,
          volume24h: pairInfo.volume?.h24 || 0,
          priceChange: pairInfo.priceChange,
          txns: pairInfo.txns,
          pairAddress: pairInfo.pairAddress,
          isNew: true,
          source: "pool_detection"
        };

        const txns = pairInfo.txns || { m5: {}, h1: {}, h6: {}, h24: {} };
        const buySellRatioM5 = (txns.m5?.buys || 0) / Math.max(txns.m5?.sells || 1, 1);
        const buySellRatioH1 = (txns.h1?.buys || 0) / Math.max(txns.h1?.sells || 1, 1);

        if (tokenInfo.liquiditySOL < Number(process.env.MIN_LIQUIDITY_SOL ?? '1')) {
          logger.debug(`Token ${tokenAddress} ignoré: liquidité insuffisante (${tokenInfo.liquiditySOL} < ${process.env.MIN_LIQUIDITY_SOL} SOL)`);
          continue;
        }

        logger.info(`Nouveau pool détecté: ${tokenInfo.name} (${tokenInfo.symbol}) - Prix: ${tokenInfo.initialPrice} SOL - Liquidité: ${tokenInfo.liquiditySOL} SOL`);
        logger.debug(`Ratio achats/ventes (5m): ${buySellRatioM5.toFixed(2)}, (1h): ${buySellRatioH1.toFixed(2)}`);

        const evaluation = await evaluateToken(tokenInfo);

        tokenInfo.validationScore = evaluation.overallScore;
        tokenInfo.risk = evaluation.risk;
        tokenInfo.recommendation = evaluation.buyRecommendation;

        await addLogEntry('TOKEN_DETECTED', tokenInfo);

      } catch (tokenError) {
        logger.error(`Erreur lors du traitement du token ${tokenAddress}: ${(tokenError as Error).message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    logger.error(`Erreur lors de la détection de nouveaux pools: ${(error as Error).message}`);
  }
}

// ----------------------------- scanner ------------------------------

async function scan(): Promise<void> {
  const outputs = await getOutputMints();
  if (cfg.debug) console.log(`[scan] outputs: ${outputs.length}`);

  for (let i = 0; i < outputs.length; i += 200) {
    const slice = outputs.slice(i, i + 200);
    const pools = await getPools(slice);
    await Promise.all(pools.map(p => maybeStore(p)));
  }

  await detectNewPools(); // Integrate pool detection logic
}

// ----------------------------- main ---------------------------------

async function main(): Promise<void> {
  console.log(`🔍 Market‑Watcher started – env=${cfg.env}, interval=${cfg.scanEvery}ms`);

  try {
    await redis.ping();
    console.log('✅ Redis connection OK');
  } catch (e) {
    console.error('❌ Redis not reachable');
    process.exit(1);
  }

  const shutdown = async () => {
    console.log('\n👋 shutting down…');
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    try {
      await scan();
    } catch (err) {
      console.error('[scanner]', err);
    }
    await new Promise(r => setTimeout(r, cfg.scanEvery));
  }
}

main().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
