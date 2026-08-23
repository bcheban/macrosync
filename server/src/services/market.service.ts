import { env } from '../config/env.js';
import { assetBySymbol } from '../data/assets.js';
import type { DataSource, Ticker } from '../types/domain.js';
import { cache } from '../utils/cache.js';
import { round, roundPrice, type Candle } from '../utils/indicators.js';

export type Interval = '5m' | '1h' | '4h';

export interface KlineSet {
  symbol: string;
  interval: Interval;
  candles: Candle[];
  source: DataSource;
}

const INTERVAL_MS: Record<Interval, number> = {
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

const QUOTES = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'];

export const splitSymbol = (symbol: string): { base: string; quote: string } => {
  const quote = QUOTES.find((candidate) => symbol.endsWith(candidate)) ?? 'USDT';
  return { base: symbol.slice(0, symbol.length - quote.length), quote };
};

const hash = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Deterministic PRNG so the simulated tape is stable across a page refresh. */
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Simulator seed for a symbol: the catalog entry, or a stable synthetic one. */
const anchorFor = (symbol: string) =>
  assetBySymbol(symbol)?.anchor ?? { price: 12.5 + (hash(symbol) % 400), vol: 0.015, volume: 5e7 };

/**
 * Builds a believable candle series without any network access. The walk is
 * seeded per symbol+interval and nudged by a slow time-based cycle, so the
 * dashboard keeps breathing while staying reproducible.
 */
function simulateCandles(symbol: string, interval: Interval, limit: number): Candle[] {
  const { price: anchor, vol, volume } = anchorFor(symbol);
  const step = INTERVAL_MS[interval];
  const now = Date.now();
  const bucket = Math.floor(now / step);
  const rand = mulberry32(hash(`${symbol}:${interval}`) + bucket);

  const cycle = Math.sin(now / (step * 26)) * vol * 6;
  const candles: Candle[] = [];
  let close = anchor * (1 + cycle);

  for (let i = limit - 1; i >= 0; i -= 1) {
    const drift = (rand() - 0.5) * vol * 2;
    const open = close;
    close = Math.max(open * (1 + drift), open * 0.5);
    const wick = Math.abs(drift) * open * (0.6 + rand());
    candles.push({
      openTime: now - i * step,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: (volume / 24) * (0.55 + rand()),
    });
  }
  return candles;
}

/**
 * Upstream health, shared by every market call.
 *
 * When the exchange is unreachable — the usual case is a datacenter IP being
 * geo-blocked — the first failure trips a cooldown so the remaining symbols in
 * the same request fall straight through to the simulator instead of each
 * paying the full timeout. One slow upstream must not become a function
 * timeout.
 */
let upstreamDownUntil = 0;

export const upstreamAvailable = (): boolean => Date.now() >= upstreamDownUntil;

const markUpstreamDown = (): void => {
  upstreamDownUntil = Date.now() + env.upstreamCooldownMs;
};

const markUpstreamUp = (): void => {
  upstreamDownUntil = 0;
};

/** Hosts to try in order: the market-data mirror first, the main API second. */
const HOSTS = [...new Set([env.binanceBase, env.binanceFallbackBase].filter(Boolean))];

async function fetchOnce<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.marketTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Tries every host for one path, then trips the cooldown if all of them fail. */
async function fetchJson<T>(path: string): Promise<T> {
  let lastError: Error | undefined;

  for (const host of HOSTS) {
    try {
      const value = await fetchOnce<T>(`${host}${path}`);
      markUpstreamUp();
      return value;
    } catch (error) {
      lastError = error as Error;
    }
  }

  markUpstreamDown();
  throw lastError ?? new Error('no upstream host configured');
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

async function fetchKlines(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
  const raw = await fetchJson<RawKline[]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return raw.map((row) => ({
    openTime: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}

/** Candles for one symbol/interval, cached for a fraction of the bar length. */
export async function getKlines(symbol: string, interval: Interval, limit = 180): Promise<KlineSet> {
  const key = `klines:${symbol}:${interval}:${limit}`;
  const ttl = Math.min(INTERVAL_MS[interval] / 10, 30_000);

  return cache.wrap(key, ttl, async () => {
    // `upstreamAvailable()` short-circuits the cooldown window.
    if (env.useLiveMarketData && upstreamAvailable()) {
      try {
        const candles = await fetchKlines(symbol, interval, limit);
        if (candles.length) return { symbol, interval, candles, source: 'binance' as const };
      } catch (error) {
        console.warn(`[market] falling back to simulator for ${symbol} ${interval}:`, (error as Error).message);
      }
    }
    return { symbol, interval, candles: simulateCandles(symbol, interval, limit), source: 'simulated' as const };
  });
}

interface Raw24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

const tickerFromCandles = (symbol: string, set: KlineSet): Ticker => {
  const { base, quote } = splitSymbol(symbol);
  const closes = set.candles.map((candle) => candle.close);
  const price = closes[closes.length - 1] ?? 0;
  // 24h window measured in bars of the requested interval.
  const barsPerDay = Math.round(86_400_000 / INTERVAL_MS[set.interval]);
  const window = set.candles.slice(-barsPerDay);
  const first = window[0]?.open ?? price;
  return {
    symbol,
    base,
    quote,
    price: roundPrice(price),
    changePct24h: round(((price - first) / (first || 1)) * 100, 2),
    high24h: roundPrice(Math.max(...window.map((candle) => candle.high))),
    low24h: roundPrice(Math.min(...window.map((candle) => candle.low))),
    quoteVolume24h: Math.round(window.reduce((sum, candle) => sum + candle.volume * candle.close, 0)),
    spark: closes.slice(-48).map(roundPrice),
    source: set.source,
    updatedAt: new Date().toISOString(),
  };
};

/** 24h stats for every tracked symbol, with sparkline data attached. */
export async function getTickers(symbols: string[] = [...env.symbols]): Promise<Ticker[]> {
  const key = `tickers:${symbols.join(',')}`;

  return cache.wrap(key, 10_000, async () => {
    const sparkSets = await Promise.all(symbols.map((symbol) => getKlines(symbol, '1h', 180)));
    const bySymbol = new Map(sparkSets.map((set) => [set.symbol, set]));
    const simulated = sparkSets.some((set) => set.source === 'simulated');

    if (env.useLiveMarketData && upstreamAvailable() && !simulated) {
      try {
        const query = encodeURIComponent(JSON.stringify(symbols));
        const raw = await fetchJson<Raw24h[]>(`/api/v3/ticker/24hr?symbols=${query}`);
        return raw.map((row) => {
          const { base, quote } = splitSymbol(row.symbol);
          const set = bySymbol.get(row.symbol);
          return {
            symbol: row.symbol,
            base,
            quote,
            price: roundPrice(Number(row.lastPrice)),
            changePct24h: round(Number(row.priceChangePercent), 2),
            high24h: roundPrice(Number(row.highPrice)),
            low24h: roundPrice(Number(row.lowPrice)),
            quoteVolume24h: Math.round(Number(row.quoteVolume)),
            spark: (set?.candles ?? []).slice(-48).map((candle) => roundPrice(candle.close)),
            source: 'binance' as const,
            updatedAt: new Date().toISOString(),
          } satisfies Ticker;
        });
      } catch (error) {
        console.warn('[market] 24h ticker unavailable, deriving from candles:', (error as Error).message);
      }
    }

    return symbols.map((symbol) => tickerFromCandles(symbol, bySymbol.get(symbol) as KlineSet));
  });
}
