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

  /* --- Telegram alerts ---------------------------------------------------- */

  /**
   * Both are required for alerts to send at all — with either missing the
   * notifier is inert and never touches the network.
   */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  /**
   * How long one asset+strategy stays quiet after an alert. A signal sitting on
   * its threshold flips between `buy` and `wait` from bar to bar, and without
   * this the channel would receive the same call every time the dashboard polls.
   */
  telegramCooldownMs: positiveInt(process.env.TELEGRAM_COOLDOWN_MS, 5_400_000),
  telegramTimeoutMs: positiveInt(process.env.TELEGRAM_TIMEOUT_MS, 5000),
  /**
   * Shared secret for `POST /api/alerts/test`. The endpoint 404s while this is
   * unset, so an unconfigured deploy cannot have its owner's Telegram spammed
   * by anyone who reads the source.
   */
  alertsTestSecret: process.env.ALERTS_TEST_SECRET ?? '',

  /*
   * Echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token` on every webhook
   * call. The endpoint is a public URL, so this is the only thing separating a
   * real update from a forged subscription; the route refuses to serve while it
   * is unset rather than accepting anything that arrives.
   */
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',

  /* --- persistence -------------------------------------------------------- */

  /*
   * Upstash Redis over REST. Vercel's marketplace integration injects the
   * `KV_REST_API_*` names while Upstash's own dashboard uses `UPSTASH_*`, so
   * both are accepted and whichever is present wins.
   */
  redisUrl: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  redisToken: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  redisPrefix: process.env.REDIS_PREFIX ?? 'macrosync',
  redisTimeoutMs: positiveInt(process.env.REDIS_TIMEOUT_MS, 4000),

  /* --- autonomous cron ---------------------------------------------------- */

  /** Shared secret for `/api/cron/signals`. The route 404s while unset. */
  cronSecret: process.env.CRON_SECRET ?? '',
  /** Strategies the scheduled run evaluates. */
  cronStrategies: parseList(process.env.CRON_STRATEGIES, ['scalping', 'day', 'swing']),

  /* --- global radar ------------------------------------------------------- */

  /*
   * The scheduled run scans the exchange, not the dashboard's asset list.
   *
   * MEXC lists ~1,700 tradable USDT pairs; ranking them by 24h turnover and
   * keeping the top slice is what separates a market from a graveyard. The tail
   * is genuinely thin — at rank 150 a pair turns over about $250k a day, where
   * the spread alone can exceed the edge — so `radarMinVolumeUsd` applies a
   * floor as well, and whichever limit bites first wins.
   */
  radarEnabled: (process.env.RADAR_ENABLED ?? 'true') !== 'false',
  radarUniverseSize: positiveInt(process.env.RADAR_UNIVERSE_SIZE, 150),
  radarMinVolumeUsd: positiveInt(process.env.RADAR_MIN_VOLUME_USD, 1_000_000),
  /** Pairs evaluated per run; the cursor advances so runs cover the rest. */
  radarBatchSize: positiveInt(process.env.RADAR_BATCH_SIZE, 18),
  /** How long a ranking is reused. Rebuilding mid-rotation would shuffle it. */
  radarUniverseTtlMs: positiveInt(process.env.RADAR_UNIVERSE_TTL_MS, 6 * 60 * 60_000),
  /** Pairs always scanned, whatever their turnover. */
  radarAlwaysInclude: parseList(process.env.RADAR_ALWAYS_INCLUDE, [...DEFAULT_SYMBOLS]),

  /* --- alert dispatch ----------------------------------------------------- */

  /*
   * A wide radar can confirm many calls at once. Telegram accepts about one
   * message per second to a chat and a channel that fires twenty at once is
   * noise, so a run sends its highest-conviction calls and drops the rest.
   *
   * This is a budget for the *whole* run, across every strategy. On a
   * five-minute schedule it sets the ceiling directly: four per run is at most
   * forty-eight messages an hour, and in practice far fewer once the per-pair
   * quiet period fills in.
   */
  alertsMaxPerRun: positiveInt(process.env.ALERTS_MAX_PER_RUN, 4),
  /** Gap between sends, to stay under Telegram's per-chat rate limit. */
  alertsSendGapMs: positiveInt(process.env.ALERTS_SEND_GAP_MS, 1200),
  /** Attempts per message before the call is abandoned for this run. */
  alertsSendRetries: positiveInt(process.env.ALERTS_SEND_RETRIES, 3),

  /* --- AI risk layer ----------------------------------------------------- */

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  llmProvider: (process.env.LLM_PROVIDER ?? 'auto') as 'auto' | 'anthropic' | 'openai' | 'heuristic',
} as const;

export type Env = typeof env;
