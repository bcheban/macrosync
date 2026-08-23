import 'dotenv/config';
import { DEFAULT_SYMBOLS } from '../data/assets.js';

const parseList = (value: string | undefined, fallback: string[]): string[] =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    : fallback;

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  /**
   * Public Binance market-data base. `data-api.binance.vision` is Binance's own
   * market-data mirror: same payloads, no key, and — unlike `api.binance.com` —
   * it is not geo-blocked for datacenter IPs, which is what a serverless deploy
   * runs on. `api.binance.com` is kept as an automatic fallback.
   */
  binanceBase: process.env.BINANCE_API_BASE ?? 'https://data-api.binance.vision',
  binanceFallbackBase: process.env.BINANCE_API_FALLBACK ?? 'https://api.binance.com',
  /**
   * How long to stop calling upstream after every host has failed. Without this
   * every symbol in a request pays the full timeout, which is what turns one
   * unreachable exchange into a serverless function timeout.
   */
  upstreamCooldownMs: Number(process.env.UPSTREAM_COOLDOWN_MS ?? 30_000),
  /** Set to `false` to force the deterministic simulator (useful offline / in CI). */
  useLiveMarketData: (process.env.USE_LIVE_MARKET_DATA ?? 'true') !== 'false',
  /** Per-host budget. Binance normally answers in ~300ms; two hosts must still
   *  fit inside a serverless function's limit on the very first (cold) request. */
  marketTimeoutMs: Number(process.env.MARKET_TIMEOUT_MS ?? 2500),

  /** Default watchlist. The client may request any subset of the asset catalog. */
  symbols: parseList(process.env.SYMBOLS, DEFAULT_SYMBOLS),
  /** Upper bound on symbols per request — one kline fetch per symbol adds up. */
  maxSymbolsPerRequest: Number(process.env.MAX_SYMBOLS_PER_REQUEST ?? 16),

  /** LLM placeholder — when no key is present the heuristic risk engine is used. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  llmProvider: (process.env.LLM_PROVIDER ?? 'auto') as 'auto' | 'anthropic' | 'openai' | 'heuristic',
} as const;

export type Env = typeof env;
