import 'dotenv/config';
import { DEFAULT_SYMBOLS } from '../data/assets.js';

/**
 * A positive integer from the environment, or the fallback.
 *
 * `Number(process.env.X ?? 12)` looks safe but is not: a variable that exists
 * and is empty is `''`, which `??` passes through and `Number` turns into 0.
 * Anything unparseable or non-positive falls back.
 */
/**
 * A percentage fee in 0..1 percent, or the fallback.
 *
 * Zero is allowed and meaningful: a maker rebate tier, or somebody who wants
 * to read the gross edge on its own. Anything above one percent is a typo —
 * no futures venue charges it — and silently accepting it would make the cost
 * line swamp every other figure on the page.
 */
const feeRate = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
};

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/**
 * A fraction strictly inside 0..1, or the fallback.
 *
 * Both ends are excluded deliberately. At 0 the stop would jump to entry the
 * instant the trade opened, closing almost everything at a scratch; at 1 it
 * would only move once the target was already reached, which is a no-op. Both
 * are silent misconfigurations rather than crashes, so they are refused here
 * instead of being discovered in the record weeks later.
 */
const fraction = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    if (value) console.warn(`[env] BREAKEVEN_THRESHOLD "${value}" is not a fraction in (0,1) — using ${fallback}`);
    return fallback;
  }
  return parsed;
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
  /*
   * Perpetual contracts, not spot. The two are different hosts with different
   * response shapes — see `market.service.ts` — so this is not a base URL that
   * can be pointed back at `api.mexc.com` without the code changing too.
   */
  mexcBase: process.env.MEXC_API_BASE ?? 'https://contract.mexc.com',
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

  /*
   * Guards `/api/admin/reset`, which destroys the trading record. The route
   * 404s while unset, and even with the secret it refuses to act without an
   * explicit confirmation string — a destructive endpoint that fires on a bare
   * authenticated POST is a foot-gun waiting for a mistyped curl.
   */
  adminSecret: process.env.ADMIN_SECRET ?? '',
  /**
   * Where the dashboard lives, for links the bot sends out.
   *
   * The webhook registration script has always read this name from the raw
   * environment; this is the same value, surfaced so the running server can use
   * it too. Empty is a valid state and means the terminal button is left off the
   * message rather than pointed at a guess — a dead link under a live call is
   * worse than one button fewer.
   */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),

  /*
   * How far a trade must travel before its stop is pulled to entry.
   *
   * Raised from 0.5 to 0.75 after the first weeks of live trading: at halfway,
   * the entry and the halfway mark sit inside the same recent range on an hourly
   * bar, so a wick back through entry scratched trades that were still working.
   * Seven of the first twenty-four settled trades closed that way.
   *
   * Tunable rather than fixed because the right value is an empirical question
   * this record cannot yet answer — `/api/admin/analytics` reports what the
   * scratched trades did afterwards, which is the evidence for moving it again.
   */
  breakevenThreshold: fraction(process.env.BREAKEVEN_THRESHOLD, 0.75),

  /*
   * When a trade that is going nowhere gets closed, and how far it has to have
   * travelled to be spared.
   *
   * A call that has spent half its horizon without covering a third of the
   * distance to target is not working — it is holding a slot and it will most
   * likely expire anyway. Closing it early frees the slot and, more honestly,
   * stops the ledger carrying a position the reader has long since abandoned.
   *
   * Expired trades stay out of the win rate, so this cannot flatter the record.
   */
  stagnantAfterFraction: fraction(process.env.STAGNANT_AFTER, 0.5),
  stagnantProgress: fraction(process.env.STAGNANT_PROGRESS, 0.3),

  /* --- persistence -------------------------------------------------------- */

  /*
   * Upstash Redis over REST. Vercel's marketplace integration injects the
   * `KV_REST_API_*` names while Upstash's own dashboard uses `UPSTASH_*`, so
   * both are accepted and whichever is present wins.
   */
  redisUrl: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  redisToken: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  /*
   * Left on the old name through the rebrand, on purpose. This prefix is the
   * namespace every live Redis key already sits under — bot subscribers, their
   * per-chat preferences, the cached feeds. Renaming it does not move that
   * data; it hides it, and the first symptom is that every subscriber silently
   * stops receiving alerts. Change it only alongside a key migration.
   */
  redisPrefix: process.env.REDIS_PREFIX ?? 'macrosync',
  redisTimeoutMs: positiveInt(process.env.REDIS_TIMEOUT_MS, 4000),

  /* --- autonomous cron ---------------------------------------------------- */

  /** Shared secret for `/api/cron/signals`. The route 404s while unset. */
  cronSecret: process.env.CRON_SECRET ?? '',

  /**
   * The exchange's taker fee, in percent, for estimating what a record costs.
   *
   * MEXC's futures taker fee is 0.02% at the base tier. It is a variable rather
   * than a constant because the number decides whether a thin edge is an edge
   * at all: at a per-trade expectancy of +0.014R, a 0.02% fee removes about
   * three fifths of it and 0.06% removes twice it. Anyone reading the record
   * needs to be able to put their own fee in.
   */
  takerFeePct: feeRate(process.env.TAKER_FEE_PCT, 0.02),

  /**
   * Confidence bands the engine is allowed to publish.
   *
   * A blunt instrument, and deliberately so. The record showed the 70–80 and
   * 90+ bands losing while 60–70 and 80–90 made money, and while those samples
   * are far too small to be evidence about the bands themselves, cutting the
   * publish rate is defensible on its own: at an edge this thin, every trade
   * not taken is a fee not paid.
   *
   * Empty means every band passes. Set as a comma-separated list of the band
   * ids used everywhere else — `60-70,80-90`.
   */
  confidenceBands: (process.env.CONFIDENCE_BANDS ?? '60-70,80-90')
    .split(',')
    .map((band) => band.trim())
    .filter(Boolean),

  /**
   * How many trades may be open at once, across every strategy.
   *
   * Sixty-three open positions is not a portfolio, it is an index fund bought
   * with leverage. Each one carries a full risk unit, so the account is exposed
   * to sixty-three times the per-trade risk simultaneously — and a correlated
   * market takes them together, which is exactly when it matters.
   *
   * The engine keeps scanning; it simply stops opening. A setup rejected here
   * is not a setup missed so much as a setup the account had no room for.
   */
  maxOpenTrades: positiveInt(process.env.MAX_OPEN_TRADES, 15),

  /**
   * The rung that pulls the stop to entry.
   *
   * It used to be the first, on the reasoning that a trade which has paid for
   * itself should stop being able to lose. That reasoning is sound and the
   * result was still a losing strategy: eighteen of twenty-six winners were
   * TP1-then-breakeven at +0.5R, so the rule capped the average win at half a
   * unit while a loss stayed at a full one.
   *
   * Waiting for the second rung gives the trade room against noise and costs
   * something concrete: a trade that fills TP1 and reverses now loses 0.5R
   * where it used to win 0.5R. Set to 1 to restore the old behaviour without
   * a release.
   */
  breakevenAfterRung: positiveInt(process.env.BREAKEVEN_AFTER_RUNG, 2),

  /**
   * How long one ticker stays quiet after a call is accepted for it.
   *
   * Across every strategy, deliberately. The same chart confirming on the 5m,
   * the 1h and the 4h inside an hour is one idea, and publishing it three
   * times spends three slots on one opinion — which is most of how the book
   * reached sixty-two positions in a day.
   *
   * Twelve hours by default. Longer than any scalp and shorter than a swing,
   * so it never silences an asset for the whole life of a trade in it.
   */
  assetCooldownMs: positiveInt(process.env.ASSET_COOLDOWN_MS, 12 * 60 * 60 * 1000),

  /**
   * Accepted calls allowed in any rolling hour, across every asset.
   *
   * The per-asset rule cannot see a market where everything confirms at once.
   * That is when the book fills with correlated positions a single reversal
   * closes together, and it is the burst worth refusing rather than rationing
   * after the fact.
   */
  signalsPerHour: positiveInt(process.env.SIGNALS_PER_HOUR, 4),

  /**
   * Which currencies' macro prints reach a reader.
   *
   * The dollar's, and by default only the dollar's. Crypto is priced in dollars
   * and moves on dollar liquidity; a Bank of England speech under a crypto
   * signal card is a real event about a market this bot does not trade, and it
   * implies a connection that is not there.
   */
  calendarCurrencies: (process.env.CALENDAR_CURRENCIES ?? 'USD')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),

  /**
   * The longest any trade may stay open, whatever its strategy says.
   *
   * A backstop, not the schedule. Each strategy already has its own horizon —
   * six hours for a scalp, thirty-six for a day trade, ten days for a swing —
   * and those are tighter than this for two of the three. Replacing them with
   * one flat number would let a five-minute scalp sit open for ten days, which
   * is worse than the problem it would be solving.
   *
   * What this catches is the case the per-strategy table cannot: a trade whose
   * strategy is not in that table at all. A field corrupted in the store, a
   * strategy added to the engine and forgotten here, a webhook payload that got
   * through with something unexpected — any of them would otherwise look up
   * `undefined`, compare `age > undefined` as false, and hold a slot for ever.
   */
  maxTradeDurationMs: positiveInt(
    process.env.MAX_TRADE_DURATION_DAYS,
    10,
  ) * 24 * 60 * 60 * 1000,
  /**
   * Guards the TradingView webhook. The route 404s while unset.
   *
   * Separate from `CRON_SECRET` on purpose: this one has to be pasted into
   * a third party's alert box, in plain text, where anybody with access to
   * that chart can read it. Sharing it with the secret that triggers scans
   * would make a leaked alert template into a leaked scheduler.
   */
  tradingViewSecret: process.env.TRADINGVIEW_WEBHOOK_SECRET ?? '',
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
