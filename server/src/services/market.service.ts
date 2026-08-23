import { env } from '../config/env.js';
import { assetBySymbol } from '../data/assets.js';
import type { Ticker } from '../types/domain.js';
import { cache } from '../utils/cache.js';
import { createLimiter, RateLimitedError } from '../utils/limiter.js';
import { round, roundPrice, type Candle } from '../utils/indicators.js';

export type Interval = '5m' | '1h' | '4h';

export interface KlineSet {
  symbol: string;
  interval: Interval;
  candles: Candle[];
}

/**
 * MEXC's interval codes are not Binance's: the hourly bar is `60m`, and `1h`
 * is rejected outright with `-1121 Invalid interval`.
 */
const MEXC_INTERVAL: Record<Interval, string> = {
  '5m': '5m',
  '1h': '60m',
  '4h': '4h',
};

const INTERVAL_MS: Record<Interval, number> = {
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

const QUOTES = ['USDT', 'USDC', 'BTC', 'ETH'];

export const splitSymbol = (symbol: string): { base: string; quote: string } => {
  const known = assetBySymbol(symbol);
  if (known) return { base: known.base, quote: known.quote };
  const quote = QUOTES.find((candidate) => symbol.endsWith(candidate)) ?? 'USDT';
  return { base: symbol.slice(0, symbol.length - quote.length), quote };
};

/* -------------------------------------------------------------------------- */
/*  Upstream health                                                            */
/* -------------------------------------------------------------------------- */

let upstreamDownUntil = 0;
let lastUpstreamError: string | undefined;
let lastSuccessAt: number | undefined;

export const upstreamAvailable = (): boolean => Date.now() >= upstreamDownUntil;

/**
 * Why the market data is missing, in a form `/health` can report.
 *
 * There is no simulated fallback any more: if the exchange cannot be reached
 * the API returns nothing rather than something invented, so this is the only
 * place that explains an empty tape.
 */
export const upstreamStatus = () => ({
  exchange: 'mexc',
  base: env.mexcBase,
  available: upstreamAvailable(),
  lastError: lastUpstreamError ?? null,
  lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
  retryInMs: Math.max(0, upstreamDownUntil - Date.now()),
});

const markDown = (error: Error): void => {
  const cooldown = error instanceof RateLimitedError ? env.rateLimitCooldownMs : env.upstreamCooldownMs;
  upstreamDownUntil = Date.now() + cooldown;
  lastUpstreamError = error.message;
};

const markUp = (): void => {
  upstreamDownUntil = 0;
  lastUpstreamError = undefined;
  lastSuccessAt = Date.now();
};

const limiter = createLimiter(env.marketConcurrency);

/** One upstream GET, rate-limit aware, behind the concurrency gate. */
async function mexc<T>(path: string): Promise<T> {
  if (!upstreamAvailable()) {
    throw new Error(`upstream in cooldown: ${lastUpstreamError ?? 'unknown'}`);
  }

  return limiter(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.marketTimeoutMs);
    try {
      const response = await fetch(`${env.mexcBase}${path}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      // 418 is MEXC's "you ignored a 429" ban response; both need a long pause.
      if (response.status === 429 || response.status === 418) {
        const error = new RateLimitedError(response.status);
        markDown(error);
        throw error;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${path}`);

      const payload = (await response.json()) as T;
      markUp();
      return payload;
    } catch (error) {
      if (!(error instanceof RateLimitedError)) markDown(error as Error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Candles                                                                    */
/* -------------------------------------------------------------------------- */

/** `[openTime, open, high, low, close, volume, closeTime, quoteVolume]`. */
type RawKline = [number, string, string, string, string, string, number, string];

/**
 * Candles for one symbol/interval, cached for a fraction of the bar length.
 *
 * The TTL cache de-duplicates concurrent callers, so a burst of dashboard polls
 * for the same symbol becomes one upstream request.
 */
export async function getKlines(symbol: string, interval: Interval, limit = 180): Promise<KlineSet> {
  const key = `klines:${symbol}:${interval}:${limit}`;
  const ttl = Math.min(INTERVAL_MS[interval] / 10, 30_000);

  return cache.wrap(key, ttl, async () => {
    const raw = await mexc<RawKline[]>(
      `/api/v3/klines?symbol=${symbol}&interval=${MEXC_INTERVAL[interval]}&limit=${limit}`,
    );

    const candles: Candle[] = raw.map((row) => ({
      openTime: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));

    if (!candles.length) throw new Error(`no candles for ${symbol} ${interval}`);
    return { symbol, interval, candles };
  });
}

/* -------------------------------------------------------------------------- */
/*  Tickers                                                                    */
/* -------------------------------------------------------------------------- */

interface Raw24h {
  symbol: string;
  lastPrice: string;
  /**
   * A FRACTION, not a percentage: MEXC reports 0.0014 where Binance reports
   * 0.14. Rendering it raw shows every asset as flat.
   */
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

const toTicker = (raw: Raw24h, spark: number[]): Ticker => {
  const { base, quote } = splitSymbol(raw.symbol);
  return {
    symbol: raw.symbol,
    base,
    quote,
    price: roundPrice(Number(raw.lastPrice)),
    changePct24h: round(Number(raw.priceChangePercent) * 100, 2),
    high24h: roundPrice(Number(raw.highPrice)),
    low24h: roundPrice(Number(raw.lowPrice)),
    quoteVolume24h: Math.round(Number(raw.quoteVolume)),
    spark,
    source: 'mexc',
    updatedAt: new Date().toISOString(),
  };
};

/**
 * 24h stats for every requested symbol, with sparkline data attached.
 *
 * Requested one symbol at a time on purpose: MEXC weights the un-filtered
 * `/ticker/24hr` at 40 and a single-symbol call at 1, and the whole-market
 * response is 800kB of symbols we do not track.
 *
 * A symbol whose request fails is dropped rather than faked, so a partial
 * outage produces a shorter tape instead of invented prices.
 */
export async function getTickers(symbols: string[]): Promise<Ticker[]> {
  const key = `tickers:${symbols.join(',')}`;

  return cache.wrap(key, 10_000, async () => {
    const settled = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const [raw, klines] = await Promise.all([
          mexc<Raw24h>(`/api/v3/ticker/24hr?symbol=${symbol}`),
          // Sparkline only; a failure here must not cost us the price.
          getKlines(symbol, '1h', 48).catch(() => undefined),
        ]);
        return toTicker(raw, (klines?.candles ?? []).map((candle) => roundPrice(candle.close)));
      }),
    );

    for (const result of settled) {
      if (result.status === 'rejected') {
        console.warn('[market] ticker dropped:', (result.reason as Error)?.message);
      }
    }

    return settled
      .filter((result): result is PromiseFulfilledResult<Ticker> => result.status === 'fulfilled')
      .map((result) => result.value);
  });
}
