import { env } from '../../config/env.js';
import { getAllTickers24h, type MarketSummary } from '../market.service.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * The global radar: which pairs the scheduled run looks at.
 *
 * The dashboard's asset list is a *user* concern — it is what one person chose
 * to watch. The scheduled scan has no user, and tying it to that list meant the
 * bot could only ever find a call on eight coins. With a per-pair quiet period
 * of ninety minutes, eight coins is a channel that goes silent within the hour.
 *
 * So the radar asks the exchange what exists instead. MEXC quotes roughly 1,700
 * tradable USDT pairs; that is far too many to price in one invocation, so the
 * ranking is built once, cached, and consumed a batch at a time — each run
 * picking up where the last one stopped. A cursor in the store is what makes
 * consecutive five-minute runs add up to a sweep of the whole board.
 */

/** Leveraged and index products: derivatives of a pair, not a market. */
const LEVERAGED = ['3L', '3S', '5L', '5S', '4L', '4S', 'UP', 'DOWN'];

/**
 * Dollar-pegged bases. `USDCUSDT` is a real pair with real volume and no
 * directional signal in it whatsoever — it is a stablecoin quoted in another
 * stablecoin, and any "call" on it is noise dressed as a trade.
 */
const STABLE_BASES = new Set([
  'USDC', 'FDUSD', 'TUSD', 'DAI', 'BUSD', 'USDE', 'PYUSD',
  'EURI', 'USD1', 'XUSD', 'USDP', 'USDD', 'GUSD', 'LUSD',
]);

/**
 * Recognises a peg from its own tape rather than from a list of names.
 *
 * Scanning seventeen hundred pairs turns up dollar tokens nobody has heard of —
 * a hard-coded list of the famous ones misses them, and each one that slips
 * through takes a slot in the batch to produce a signal on an asset that by
 * design does not move. A pair sitting at a dollar that travelled under one
 * percent all day is a peg whatever it calls itself.
 */
function looksPegged(entry: MarketSummary): boolean {
  const { lastPrice, highPrice, lowPrice } = entry;
  if (lastPrice < 0.95 || lastPrice > 1.05) return false;
  if (!highPrice || !lowPrice) return false;

  return (highPrice - lowPrice) / lastPrice < 0.01;
}

const UNIVERSE_KEY = storeKey('radar:universe');
const CURSOR_KEY = storeKey('radar:cursor');

interface CachedUniverse {
  symbols: string[];
  builtAt: number;
  /** Kept for `/health`: how much of the exchange survived the filters. */
  considered: number;
}

const EMPTY: CachedUniverse = { symbols: [], builtAt: 0, considered: 0 };

/** Whether a pair is a market a signal can meaningfully be formed on. */
export function isTradablePair(symbol: string): boolean {
  if (!symbol.endsWith('USDT')) return false;

  const base = symbol.slice(0, -4);
  if (!base || STABLE_BASES.has(base)) return false;

  return !LEVERAGED.some((suffix) => base.endsWith(suffix));
}

/**
 * Ranks the exchange by 24h turnover and keeps the liquid head of the list.
 *
 * Two limits, and the tighter one wins. The top-N cap bounds how long a full
 * rotation takes; the volume floor is the one that matters for signal quality,
 * because the tail is thinner than it looks — around rank 150 a pair turns over
 * only a few hundred thousand dollars a day, where the spread can be wider than
 * the edge being traded. Ranking without a floor would quietly fill the radar
 * with markets too illiquid to act on.
 */
export async function buildUniverse(): Promise<CachedUniverse> {
  const all = await getAllTickers24h();

  const ranked = all
    .filter(
      (entry) =>
        isTradablePair(entry.symbol) && !looksPegged(entry) && entry.quoteVolume >= env.radarMinVolumeUsd,
    )
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, env.radarUniverseSize)
    .map((entry) => entry.symbol);

  /*
   * The dashboard's own pairs are always scanned, even if a quiet day drops one
   * below the floor: a user watching a coin on the site should not find that the
   * bot stopped covering it.
   */
  const pinned = env.radarAlwaysInclude.filter(isTradablePair);
  const symbols = [...new Set([...ranked, ...pinned])];

  return { symbols, builtAt: Date.now(), considered: all.filter((e) => isTradablePair(e.symbol)).length };
}

/**
 * The current ranking, rebuilt only when stale.
 *
 * Rebuilding on every run would be correct but useless: the cursor indexes into
 * this list, so reshuffling it mid-rotation would make some pairs come round
 * twice and others never at all. A stable list for a few hours is what makes the
 * rotation a sweep rather than a random walk.
 */
export async function getUniverse(now = Date.now()): Promise<CachedUniverse> {
  const cached = await getJson<CachedUniverse>(UNIVERSE_KEY, EMPTY);
  if (cached.symbols.length && now - cached.builtAt < env.radarUniverseTtlMs) return cached;

  try {
    const fresh = await buildUniverse();
    if (!fresh.symbols.length) throw new Error('ranking came back empty');
    await setJson(UNIVERSE_KEY, fresh);
    return fresh;
  } catch (error) {
    console.warn('[radar] universe rebuild failed:', (error as Error).message);
    // A stale ranking beats no scan at all; only a cold cache falls back.
    if (cached.symbols.length) return cached;
    return { symbols: env.radarAlwaysInclude.filter(isTradablePair), builtAt: now, considered: 0 };
  }
}

export interface RadarBatch {
  symbols: string[];
  /** Where this batch started, for the log and for `/health`. */
  offset: number;
  universeSize: number;
  /** Runs needed to come back round to the same offset. */
  runsPerSweep: number;
}

/**
 * The next slice of the board, advancing the cursor for the run after this one.
 *
 * The cursor is written *before* the batch is evaluated, deliberately. A run
 * that dies half way through then loses one batch rather than repeating it
 * forever — a scan that cannot get past a pair that times out would cover
 * nothing at all, which is a far worse failure than a gap.
 */
export async function nextBatch(): Promise<RadarBatch> {
  const { symbols } = await getUniverse();
  const size = Math.min(env.radarBatchSize, symbols.length || 1);

  if (!symbols.length) return { symbols: [], offset: 0, universeSize: 0, runsPerSweep: 0 };

  const stored = await getJson<number>(CURSOR_KEY, 0);
  const offset = Number.isInteger(stored) && stored >= 0 ? stored % symbols.length : 0;

  // Wraps around the end of the list rather than returning a short final batch.
  const batch = Array.from({ length: size }, (_, i) => symbols[(offset + i) % symbols.length] as string);

  await setJson(CURSOR_KEY, (offset + size) % symbols.length);

  return {
    symbols: batch,
    offset,
    universeSize: symbols.length,
    runsPerSweep: Math.ceil(symbols.length / size),
  };
}

export async function radarStatus() {
  const [universe, cursor] = await Promise.all([
    getJson<CachedUniverse>(UNIVERSE_KEY, EMPTY),
    getJson<number>(CURSOR_KEY, 0),
  ]);

  return {
    enabled: env.radarEnabled,
    universeSize: universe.symbols.length,
    /** Pairs on the exchange that passed the shape filters, before ranking. */
    tradablePairs: universe.considered,
    minVolumeUsd: env.radarMinVolumeUsd,
    batchSize: env.radarBatchSize,
    cursor,
    builtAt: universe.builtAt ? new Date(universe.builtAt).toISOString() : null,
    runsPerSweep: universe.symbols.length ? Math.ceil(universe.symbols.length / env.radarBatchSize) : 0,
  };
}
