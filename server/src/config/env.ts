import 'dotenv/config';
import { DEFAULT_SYMBOLS } from '../data/assets.js';

/**
 * A positive integer from the environment, or the fallback.
 *
 * `Number(process.env.X ?? 12)` looks safe but is not: a variable that exists
 * and is empty is `''`, which `??` passes through and `Number` turns into 0.
 * Anything unparseable or non-positive falls back.
 */
const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const parseList = (value: string | undefined, fallback: string[]): string[] =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : fallback;

const upperList = (value: string | undefined, fallback: string[]): string[] =>
  parseList(value, fallback).map((entry) => entry.toUpperCase());

/**
 * Real crypto newsrooms, read over RSS.
 *
 * Every hosted crypto-news API — CryptoPanic, CryptoCompare/CoinDesk Data,
 * CoinGecko — now rejects keyless requests, so RSS is the only source of
 * genuinely current headlines that works with no credentials at all. Give the
 * server a `CRYPTOPANIC_TOKEN`, `CRYPTOCOMPARE_API_KEY` or `NEWSDATA_API_KEY`
 * and it prefers that provider instead.
 */
const DEFAULT_NEWS_FEEDS = [
  'https://cointelegraph.com/rss',
  'https://decrypt.co/feed',
  'https://www.theblock.co/rss.xml',
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
];

export const env = {
  port: positiveInt(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  /* --- market data (MEXC) ------------------------------------------------ */

  /** MEXC public REST. No key required for market data. */
  mexcBase: process.env.MEXC_API_BASE ?? 'https://api.mexc.com',
  /** Per-request budget. MEXC normally answers in ~300ms. */
  marketTimeoutMs: positiveInt(process.env.MARKET_TIMEOUT_MS, 4000),
  /** Concurrent upstream requests. Public endpoints are rate limited per IP. */
  marketConcurrency: positiveInt(process.env.MARKET_CONCURRENCY, 6),
  /**
   * How long to stop calling upstream after a failure, so one outage or a 429
   * cannot turn into a request storm or a function timeout.
   */
  upstreamCooldownMs: positiveInt(process.env.UPSTREAM_COOLDOWN_MS, 20_000),
  /** Longer pause when the exchange explicitly rate limits us (HTTP 429/418). */
  rateLimitCooldownMs: positiveInt(process.env.RATE_LIMIT_COOLDOWN_MS, 60_000),

  /** Default watchlist. The client may request any subset of the catalogue. */
  symbols: upperList(process.env.SYMBOLS, DEFAULT_SYMBOLS),
  /** Each requested symbol costs one kline fetch, so requests are capped. */
  maxSymbolsPerRequest: positiveInt(process.env.MAX_SYMBOLS_PER_REQUEST, 16),

  /* --- news -------------------------------------------------------------- */

  newsProvider: (process.env.NEWS_PROVIDER ?? 'auto') as
    | 'auto'
    | 'cryptopanic'
    | 'cryptocompare'
    | 'newsdata'
    | 'rss',
  cryptoPanicToken: process.env.CRYPTOPANIC_TOKEN ?? '',
  cryptoCompareKey: process.env.CRYPTOCOMPARE_API_KEY ?? '',
  newsDataKey: process.env.NEWSDATA_API_KEY ?? '',
  newsFeeds: parseList(process.env.NEWS_RSS_FEEDS, DEFAULT_NEWS_FEEDS),
  /** Headlines move far slower than prices; polling them harder buys nothing. */
  newsTtlMs: positiveInt(process.env.NEWS_TTL_MS, 300_000),
  newsTimeoutMs: positiveInt(process.env.NEWS_TIMEOUT_MS, 6000),

  /* --- economic calendar -------------------------------------------------- */

  /** The feed covers one rolling week; there is nothing to gain from polling it hard. */
  calendarTtlMs: positiveInt(process.env.CALENDAR_TTL_MS, 1_800_000),
  calendarTimeoutMs: positiveInt(process.env.CALENDAR_TIMEOUT_MS, 6000),

  /* --- AI risk layer ----------------------------------------------------- */

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  llmProvider: (process.env.LLM_PROVIDER ?? 'auto') as 'auto' | 'anthropic' | 'openai' | 'heuristic',
} as const;

export type Env = typeof env;
