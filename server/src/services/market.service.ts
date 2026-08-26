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
 * Contract intervals are named, not abbreviated: `Min60`, never `1h` or `60m`,
 * both of which come back `code 600 Parameter error`.
 */
const MEXC_INTERVAL: Record<Interval, string> = {
  '5m': 'Min5',
  '1h': 'Min60',
  '4h': 'Hour4',
};

const INTERVAL_MS: Record<Interval, number> = {
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

/**
 * Perpetuals are quoted `BTC_USDT`; everything else here — the catalogue, the
 * dashboard's stored selection, every Redis key — uses `BTCUSDT`.
 *
 * The underscore is confined to the two functions that talk to the exchange
 * rather than propagated through the codebase. Renaming the internal form would
 * have invalidated every saved watchlist and every open trade in the ledger for
 * a difference that exists only in one API's URL.
 */
export const toContractSymbol = (symbol: string): string =>
  symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC)$/, '_$1');

export const fromContractSymbol = (symbol: string): string => symbol.replace('_', '');

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

      /*
       * The contract API answers 200 with `{success: false}` for a bad symbol or
       * a malformed interval, so the HTTP status is not the answer — the
       * envelope is. Spot used to signal both through the status code.
       */
      const envelope = (await response.json()) as { success?: boolean; code?: number; data?: T; message?: string };
      if (envelope.success === false) {
        throw new Error(`contract API refused: ${envelope.message ?? envelope.code} — ${path}`);
      }

      markUp();
      return (envelope.data ?? envelope) as T;
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

/**
 * Contract klines arrive **columnar** — parallel arrays rather than a row per
 * bar — and stamped in *seconds*. Both differ from spot, and both are silent
 * failures if assumed: transposing the wrong way yields plausible-looking
 * garbage, and second-stamps read as 1970 when compared against `Date.now()`.
 */
interface RawKlines {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  vol: number[];
}

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
    /*
     * There is no `limit`: the window is the request. Asking from
     * `now - limit intervals` returns exactly that many bars, verified against
     * the live endpoint at 5m, 60m and 4h.
     */
    const start = Math.floor((Date.now() - limit * INTERVAL_MS[interval]) / 1000);
    const raw = await mexc<RawKlines>(
      `/api/v1/contract/kline/${toContractSymbol(symbol)}?interval=${MEXC_INTERVAL[interval]}&start=${start}`,
    );

    const candles: Candle[] = (raw.time ?? []).map((seconds, index) => ({
      openTime: seconds * 1000,
      open: raw.open[index] ?? 0,
      high: raw.high[index] ?? 0,
      low: raw.low[index] ?? 0,
      close: raw.close[index] ?? 0,
      volume: raw.vol[index] ?? 0,
    }));

    if (!candles.length) throw new Error(`no candles for ${symbol} ${interval}`);
    return { symbol, interval, candles };
  });
}

/* -------------------------------------------------------------------------- */
/*  Tickers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One perpetual as the contract ticker feed reports it.
 *
 * Numbers arrive as numbers here, where spot sent strings. `amount24` is the
 * 24h turnover in USDT and is the liquidity measure; `volume24` counts
 * *contracts*, which is not comparable across symbols because contract size
 * differs — BTC is 0.0001 per contract, ETH 0.01. Ranking on the wrong one
 * would order the board by tick size.
 */
interface RawContractTicker {
  symbol: string;
  lastPrice: number;
  /** A FRACTION, as on spot: 0.0014 means +0.14%. */
  riseFallRate: number;
  high24Price: number;
  lower24Price: number;
  amount24: number;
  volume24: number;
  fundingRate?: number;
  holdVol?: number;
}

const toTicker = (raw: RawContractTicker, spark: number[]): Ticker => {
  const symbol = fromContractSymbol(raw.symbol);
  const { base, quote } = splitSymbol(symbol);

  return {
    symbol,
    base,
    quote,
    price: roundPrice(raw.lastPrice),
    changePct24h: round(raw.riseFallRate * 100, 2),
    high24h: roundPrice(raw.high24Price),
    low24h: roundPrice(raw.lower24Price),
    quoteVolume24h: Math.round(raw.amount24),
    spark,
    source: 'mexc',
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Every perpetual's 24h stats, in one request.
 *
 * The whole board is 1,150 contracts in a single response, so there is no
 * per-symbol variant worth using: spot charged weight 40 for the unfiltered
 * call and 1 per symbol, which made one-at-a-time cheaper. Here it is one call
 * either way, and this one is also what the radar ranks on.
 */
async function contractTickers(): Promise<RawContractTicker[]> {
  const raw = await mexc<RawContractTicker[]>('/api/v1/contract/ticker');
  if (!Array.isArray(raw)) throw new Error('unexpected contract ticker shape');
  return raw;
}

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
    const all = await contractTickers();
    const bySymbol = new Map(all.map((entry) => [fromContractSymbol(entry.symbol), entry]));

    const settled = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const raw = bySymbol.get(symbol);
        if (!raw) throw new Error(`${symbol} is not a listed perpetual`);

        // Sparkline only; a failure here must not cost us the price.
        const klines = await getKlines(symbol, '1h', 48).catch(() => undefined);
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

/* -------------------------------------------------------------------------- */
/*  Whole-exchange snapshot                                                    */
/* -------------------------------------------------------------------------- */

/** One pair as the exchange-wide ticker feed reports it. */
export interface MarketSummary {
  symbol: string;
  /** 24h turnover in quote currency — the liquidity proxy the radar ranks on. */
  quoteVolume: number;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
}

/**
 * Every perpetual MEXC lists, in a single request.
 *
 * One call returns all ~1,150 contracts in a fifth of a second, and it is the
 * only way to discover what is listed rather than assuming a hard-coded list.
 *
 * Deliberately uncached here. The only caller ranks the result and caches *that*
 * for hours; a second short-lived cache underneath it would add a layer that
 * never helps and can hand back a listing the caller believes it just refreshed.
 */
export async function getAllTickers24h(): Promise<MarketSummary[]> {
  const raw = await contractTickers();

  return raw.map((entry) => ({
    symbol: fromContractSymbol(entry.symbol),
    // Turnover in USDT. `volume24` counts contracts and is not comparable.
    quoteVolume: entry.amount24 || 0,
    lastPrice: entry.lastPrice || 0,
    highPrice: entry.high24Price || 0,
    lowPrice: entry.lower24Price || 0,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Contract specifications                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a contract permits, which spot had no equivalent of.
 *
 * `maintenanceMarginRate` is the reason this is fetched rather than assumed:
 * across the board it ranges from 0.04% to 5%, and it sits directly inside the
 * liquidation-distance calculation. Treating it as a constant would misprice
 * safe leverage by an order of magnitude on the thinner contracts.
 */
export interface ContractSpec {
  symbol: string;
  maxLeverage: number;
  maintenanceMarginRate: number;
  contractSize: number;
  /**
   * MEXC documents 0 as tradable; anything else is halted or delisted.
   *
   * In practice `/contract/detail` only returns live contracts — all 1,147 come
   * back as 0 — so this filter has never excluded anything. Kept because it
   * costs a comparison and the day the endpoint starts returning halted
   * contracts is not a day anyone will notice in advance.
   */
  state: number;
  /**
   * The margin asset. `USDT` for the linear board; `USD` is coin-margined.
   *
   * Optional, and absence never disqualifies. If MEXC reshapes the response and
   * these stop arriving, treating that as "not USDT" would filter out the entire
   * board at once — a total outage dressed up as a quiet day with no setups.
   */
  quoteCoin?: string;
  settleCoin?: string;
  /** 1 is a perpetual. Delivery futures would need different handling entirely. */
  futureType?: number;
  /**
   * Whether the contract can be traded through the API at all.
   *
   * The one that actually matters, and the reason symbols were "not found or
   * throwing errors": twenty-five USDT perpetuals carry `false` here and every
   * one of them is in the public ticker feed. The radar could rank them, the
   * engine could price them, and the alert named a contract the reader could
   * not act on.
   */
  apiAllowed: boolean;
}

/**
 * Whether this is a contract the bot should ever emit a signal for.
 *
 * Four conditions, and only the last is doing real work today — but a signal on
 * an untradable market is worse than no signal, so each is checked rather than
 * assumed to stay true.
 */
export function isTradableContract(spec: ContractSpec | undefined): boolean {
  if (!spec) return false;

  /*
   * Only a value that contradicts disqualifies; a missing field does not. The
   * two failure modes are not symmetric — over-filtering empties the board and
   * looks like a quiet market, while under-filtering lets through a handful of
   * contracts the next check catches.
   */
  const wrong = (value: string | number | undefined, expected: string | number): boolean =>
    value !== undefined && value !== expected;

  if (spec.state !== 0) return false;
  if (wrong(spec.futureType, 1)) return false;
  // Strictly USDT-margined: the board also carries USDC, USD1 and ten
  // coin-margined contracts settled in the base asset.
  if (wrong(spec.quoteCoin, 'USDT')) return false;
  if (wrong(spec.settleCoin, 'USDT')) return false;

  return spec.apiAllowed;
}

interface RawContractDetail {
  symbol: string;
  maxLeverage?: number;
  maintenanceMarginRate?: number;
  contractSize?: number;
  state?: number;
  quoteCoin?: string;
  settleCoin?: string;
  futureType?: number;
  apiAllowed?: boolean;
}

/** Specs for every contract, keyed by the internal symbol form. */
export async function getContractSpecs(): Promise<Map<string, ContractSpec>> {
  return cache.wrap('contracts:detail', 6 * 60 * 60_000, async () => {
    const raw = await mexc<RawContractDetail[]>('/api/v1/contract/detail');
    if (!Array.isArray(raw)) throw new Error('unexpected contract detail shape');

    return new Map(
      raw.map((entry) => [
        fromContractSymbol(entry.symbol),
        {
          symbol: fromContractSymbol(entry.symbol),
          maxLeverage: entry.maxLeverage ?? 20,
          // A missing rate is read pessimistically, never optimistically.
          maintenanceMarginRate: entry.maintenanceMarginRate ?? 0.02,
          contractSize: entry.contractSize ?? 1,
          state: entry.state ?? 0,
          quoteCoin: entry.quoteCoin,
          settleCoin: entry.settleCoin,
          futureType: entry.futureType,
          /*
           * Absent reads as allowed. A spec response that drops the field must
           * not empty the board — the failure mode of over-filtering here is a
           * scanner that finds nothing at all.
           */
          apiAllowed: entry.apiAllowed !== false,
        } satisfies ContractSpec,
      ]),
    );
  });
}
