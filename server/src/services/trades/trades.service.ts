import { env } from '../../config/env.js';
import { getKlines, type Interval } from '../market.service.js';
import type { Signal, Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * Outcome tracking for the calls the bot publishes.
 *
 * A signal is only worth anything if somebody counts how often it was right, so
 * every alert opens a trade here and every scheduled run checks whether the open
 * ones reached their target or their stop.
 *
 * The record is deliberately conservative. Where the candles cannot say what
 * happened, the reading that flatters the engine least is the one taken.
 */
export interface ActiveTrade {
  id: string;
  symbol: string;
  base: string;
  strategy: Strategy;
  side: 'buy' | 'sell';
  entry: number;
  /** Moves to `entry` once the trade is halfway to target. */
  stopLoss: number;
  /**
   * Where the stop started.
   *
   * Kept because `stopLoss` is no longer immutable: without it, a trade that
   * moved to breakeven would look as though it had been opened with a
   * zero-risk stop, and the risk the call actually carried would be
   * unreconstructable from the record.
   */
  initialStopLoss: number;
  takeProfit: number;
  timeframe: string;
  openedAt: string;
  /** When the stop was moved to entry, if it has been. */
  breakevenAt?: string;
  /**
   * The confluence score the call was published with, 0-100.
   *
   * Optional because trades opened before this field existed do not carry it,
   * and the analytics that reads it says so rather than treating an absent
   * score as a zero — which would drag any correlation toward a number that
   * describes the migration rather than the strategy.
   */
  confidence?: number;
}

/**
 * `win` and `loss` are the only outcomes that move the win rate.
 *
 * `expired` is a call that never reached either level inside its horizon, and
 * `superseded` is one replaced by a reversal on the same pair. Counting either
 * as a loss would be as dishonest as counting it as a win — they are recorded
 * separately so the denominator stays meaningful and nothing is quietly dropped.
 *
 * `voided` is a call that could never have resolved: a target that is not a
 * price. Those existed — the engine could put a short's target below zero on a
 * violent microcap — and they are the one case that genuinely does poison the
 * record, because such a trade can still hit its stop. It can lose and it cannot
 * win. Leaving them to expire would have counted every one of them as a loss.
 *
 * `breakeven` is a trade that travelled halfway to target — moving its stop to
 * entry — and then came back to it. It costs nothing and gains nothing.
 *
 * That one deserves suspicion, because it flatters. Before the breakeven rule
 * existed, every one of these was a **loss**; now they leave the denominator
 * entirely, so the published win rate rises without the strategy having
 * improved at all. It is counted and reported separately for exactly that
 * reason: a rate quoted without its breakeven count is a better-looking number
 * about a smaller question.
 */
export type Outcome = 'win' | 'loss' | 'expired' | 'superseded' | 'voided' | 'breakeven';

export interface ClosedTrade extends ActiveTrade {
  outcome: Outcome;
  closedAt: string;
  /** Realised move in percent, signed in the direction of the trade. */
  resultPct: number;
}

export interface TradeStats {
  wins: number;
  losses: number;
  expired: number;
  superseded: number;
  voided: number;
  breakeven: number;
  byStrategy: Record<string, { wins: number; losses: number }>;
  updatedAt: string;
}

const ACTIVE_KEY = storeKey('trades:active');
const STATS_KEY = storeKey('trades:stats');
const HISTORY_KEY = storeKey('trades:history');

const EMPTY_STATS: TradeStats = {
  wins: 0,
  losses: 0,
  expired: 0,
  superseded: 0,
  voided: 0,
  breakeven: 0,
  byStrategy: {},
  updatedAt: new Date(0).toISOString(),
};

export const INTERVAL: Record<Strategy, Interval> = { scalping: '5m', day: '1h', swing: '4h' };

/**
 * How long a call is given to resolve, roughly three times the duration the
 * alert advertises.
 *
 * Without this a trade that never reaches either level stays open forever: the
 * active list grows without bound, every run re-fetches candles for all of it,
 * and the win rate silently counts only the decisive calls — which is the most
 * flattering possible sample.
 */
export const MAX_LIFETIME_MS: Record<Strategy, number> = {
  scalping: 6 * 60 * 60_000,
  day: 36 * 60 * 60_000,
  swing: 10 * 24 * 60 * 60_000,
};

/** Bars fetched per resolve — must span the longest a trade can stay open. */
export const LOOKBACK: Record<Strategy, number> = {
  scalping: Math.ceil(MAX_LIFETIME_MS.scalping / (5 * 60_000)) + 5, // 77
  day: Math.ceil(MAX_LIFETIME_MS.day / (60 * 60_000)) + 5, // 41
  swing: Math.ceil(MAX_LIFETIME_MS.swing / (4 * 60 * 60_000)) + 5, // 65
};

export const winRate = (stats: TradeStats): number => {
  const decided = stats.wins + stats.losses;
  return decided ? Math.round((stats.wins / decided) * 100) : 0;
};

export const loadStats = (): Promise<TradeStats> => getJson<TradeStats>(STATS_KEY, EMPTY_STATS);
export const loadActive = (): Promise<ActiveTrade[]> => getJson<ActiveTrade[]>(ACTIVE_KEY, []);

const tradeKey = (trade: { symbol: string; strategy: Strategy }): string =>
  `${trade.symbol}:${trade.strategy}`;

const close = (trade: ActiveTrade, outcome: Outcome, exit: number): ClosedTrade => {
  const move = ((exit - trade.entry) / trade.entry) * 100;
  return {
    ...trade,
    outcome,
    closedAt: new Date().toISOString(),
    resultPct: Number((trade.side === 'buy' ? move : -move).toFixed(2)),
  };
};

/**
 * Records a call as an open trade.
 *
 * A reversal on the same pair **supersedes** the standing trade rather than
 * being dropped. Refusing the new one left the channel announcing SELL while
 * the ledger still tracked a BUY — two records of the same pair disagreeing,
 * with the stale one later resolving against a call nobody was following.
 */
export async function openTrade(signal: Signal): Promise<{ opened: boolean; superseded?: ClosedTrade }> {
  if (signal.verdict === 'wait') return { opened: false };

  /*
   * The engine refuses these upstream now, but the ledger checks too: a trade
   * whose target is not a price is one the record can only ever count against
   * itself, and that is too costly a thing to guard in exactly one place.
   */
  if (
    !(signal.entry > 0 && signal.stopLoss > 0 && signal.takeProfit > 0) ||
    (signal.verdict === 'buy'
      ? !(signal.takeProfit > signal.entry && signal.stopLoss < signal.entry)
      : !(signal.takeProfit < signal.entry && signal.stopLoss > signal.entry))
  ) {
    console.error(`[trades] refused unusable levels for ${signal.symbol}:`, {
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    });
    return { opened: false };
  }

  const active = await loadActive();
  const key = tradeKey(signal);
  const existing = active.find((trade) => tradeKey(trade) === key);

  // The identical call standing already — nothing to record.
  if (existing && existing.side === signal.verdict) return { opened: false };

  const superseded = existing ? close(existing, 'superseded', signal.entry) : undefined;
  const remaining = existing ? active.filter((trade) => trade.id !== existing.id) : active;

  remaining.push({
    id: `${key}:${Date.now()}`,
    symbol: signal.symbol,
    base: signal.base,
    strategy: signal.strategy,
    side: signal.verdict,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    initialStopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    confidence: signal.confidence,
    timeframe: signal.timeframe,
    openedAt: new Date().toISOString(),
  });

  await setJson(ACTIVE_KEY, remaining);
  if (superseded) await record([superseded]);

  return { opened: true, ...(superseded ? { superseded } : {}) };
}

/**
 * Decides whether a trade finished, by replaying the candles since it opened.
 *
 * Only bars that **opened at or after** entry count. The previous version
 * allowed a minute of slack, which on 5m bars could pull in the bar already
 * running when the call was made and credit a level touched before it existed;
 * on 1h and 4h bars the same slack was meaningless. Excluding the entry bar
 * entirely costs the rare same-bar resolution and buys a record that cannot
 * count a move that happened first.
 *
 * When one bar touched both levels the stop wins: intrabar order is unknowable
 * from candles, and reading it the other way would flatter the engine.
 */
/**
 * Whether a trade's levels are prices, and on the right sides of entry.
 *
 * Cheap, and it has already earned its keep: calls were published with a target
 * below zero, which the exchange can never reach, so they could only ever be
 * stopped out.
 *
 * Judged on the stop the call was **published with**, not the current one. Once
 * a stop moves to breakeven it sits exactly at entry, which this check read as
 * malformed — so every protected trade was silently voided on the run after it
 * was protected. The published levels are what "is this a real trade" asks
 * about; where the stop has since been dragged to is a separate question.
 */
function resolvable(trade: ActiveTrade): boolean {
  // Records written before the stop could move carry no initial level.
  const opened = trade.initialStopLoss ?? trade.stopLoss;

  if (!(trade.entry > 0) || !(opened > 0) || !(trade.takeProfit > 0)) return false;
  if (!(trade.stopLoss > 0)) return false;

  return trade.side === 'buy'
    ? trade.takeProfit > trade.entry && opened < trade.entry
    : trade.takeProfit < trade.entry && opened > trade.entry;
}

/**
 * The point at which the stop is pulled up to entry, as a fraction of the
 * distance from entry to target.
 *
 * Read from `BREAKEVEN_THRESHOLD` at call time rather than captured in a module
 * constant, so a deployment can move it without a rebuild and a test can set it
 * per case.
 */
const breakevenFraction = (): number => env.breakevenThreshold;

export interface Resolution {
  trade: ActiveTrade;
  closed?: ClosedTrade;
  /** Set on the run where the stop moved, so it is announced exactly once. */
  movedToBreakeven?: boolean;
}

/**
 * Replays the candles since entry, bar by bar, in order.
 *
 * The order matters now in a way it did not before. This used to ask whether
 * *any* bar touched the stop and whether *any* bar touched the target, which is
 * order-blind — fine while the stop never moved. With a stop that is pulled to
 * entry halfway to target, "did it hit the stop" has no answer until you know
 * *which* stop was in force at the time, and that depends on what happened
 * earlier in the sequence.
 *
 * Within a single bar the order is still unknowable, so the stop in force at
 * the *start* of the bar is the one that applies: a bar that both reached the
 * halfway mark and traded back through the original stop is read as the stop,
 * because that is the reading that flatters least.
 */
async function resolve(trade: ActiveTrade, now: number): Promise<Resolution> {
  const age = now - Date.parse(trade.openedAt);

  // Voided before any candle is fetched: there is nothing this tape could say.
  if (!resolvable(trade)) return { trade, closed: close(trade, 'voided', trade.entry) };

  const set = await getKlines(trade.symbol, INTERVAL[trade.strategy], LOOKBACK[trade.strategy]).catch(
    () => undefined,
  );

  const long = trade.side === 'buy';
  // Signed so a long and a short read identically from here on.
  const trigger = trade.entry + (trade.takeProfit - trade.entry) * breakevenFraction();

  let stop = trade.stopLoss;
  let atBreakeven = Boolean(trade.breakevenAt);
  let moved = false;

  if (set) {
    const openedAt = Date.parse(trade.openedAt);

    for (const candle of set.candles) {
      if (candle.openTime < openedAt) continue;

      const hitStop = long ? candle.low <= stop : candle.high >= stop;
      const hitTarget = long ? candle.high >= trade.takeProfit : candle.low <= trade.takeProfit;

      if (hitStop) {
        /*
         * A stop sitting at entry is not a loss — nothing was lost. Recording it
         * as one would be as wrong as recording it as a win, so it gets its own
         * outcome and stays out of the rate.
         */
        const settled = { ...trade, stopLoss: stop };
        return {
          trade: settled,
          closed: close(settled, atBreakeven ? 'breakeven' : 'loss', stop),
          ...(moved ? { movedToBreakeven: true } : {}),
        };
      }

      if (hitTarget) {
        const settled = { ...trade, stopLoss: stop };
        return {
          trade: settled,
          closed: close(settled, 'win', trade.takeProfit),
          ...(moved ? { movedToBreakeven: true } : {}),
        };
      }

      // Checked after the levels, so a bar cannot both save and settle itself.
      if (!atBreakeven && (long ? candle.high >= trigger : candle.low <= trigger)) {
        stop = trade.entry;
        atBreakeven = true;
        moved = true;
      }
    }
  }

  const updated: ActiveTrade = {
    ...trade,
    stopLoss: stop,
    ...(atBreakeven && !trade.breakevenAt ? { breakevenAt: new Date().toISOString() } : {}),
  };

  /*
   * Timed out. Closed at the last price we can see rather than at a level,
   * because neither was reached — and kept out of the win rate for the same
   * reason.
   */
  if (age > MAX_LIFETIME_MS[trade.strategy]) {
    const last = set?.candles[set.candles.length - 1]?.close ?? trade.entry;
    return { trade: updated, closed: close(updated, 'expired', last), ...(moved ? { movedToBreakeven: true } : {}) };
  }

  return { trade: updated, ...(moved ? { movedToBreakeven: true } : {}) };
}

/** Folds closed trades into the running statistics and the history log. */
async function record(closed: ClosedTrade[]): Promise<TradeStats> {
  const stats = await loadStats();

  const next: TradeStats = {
    wins: stats.wins + closed.filter((trade) => trade.outcome === 'win').length,
    losses: stats.losses + closed.filter((trade) => trade.outcome === 'loss').length,
    expired: stats.expired + closed.filter((trade) => trade.outcome === 'expired').length,
    superseded: stats.superseded + closed.filter((trade) => trade.outcome === 'superseded').length,
    voided: stats.voided + closed.filter((trade) => trade.outcome === 'voided').length,
    breakeven: stats.breakeven + closed.filter((trade) => trade.outcome === 'breakeven').length,
    byStrategy: { ...stats.byStrategy },
    updatedAt: new Date().toISOString(),
  };

  for (const trade of closed) {
    if (trade.outcome !== 'win' && trade.outcome !== 'loss') continue;
    const bucket = next.byStrategy[trade.strategy] ?? { wins: 0, losses: 0 };
    if (trade.outcome === 'win') bucket.wins += 1;
    else bucket.losses += 1;
    next.byStrategy[trade.strategy] = bucket;
  }

  // A bounded history makes the record auditable rather than just a percentage.
  const history = await getJson<ClosedTrade[]>(HISTORY_KEY, []);
  await Promise.all([setJson(STATS_KEY, next), setJson(HISTORY_KEY, [...closed, ...history].slice(0, 100))]);

  return next;
}

/**
 * Checks every open trade and settles the ones that reached a level or ran out
 * of time. Returns what closed, so the caller can announce it.
 */
export async function evaluateTrades(now = Date.now()): Promise<{
  closed: ClosedTrade[];
  /** Trades whose stop moved to entry on this run — announced once. */
  movedToBreakeven: ActiveTrade[];
  stats: TradeStats;
  open: number;
}> {
  const active = await loadActive();
  if (!active.length) {
    return { closed: [], movedToBreakeven: [], stats: await loadStats(), open: 0 };
  }

  const resolutions = await Promise.all(active.map((trade) => resolve(trade, now)));

  const closed = resolutions
    .map((resolution) => resolution.closed)
    .filter((trade): trade is ClosedTrade => Boolean(trade));

  const remaining = resolutions.filter((resolution) => !resolution.closed).map((resolution) => resolution.trade);

  const movedToBreakeven = resolutions
    .filter((resolution) => resolution.movedToBreakeven)
    .map((resolution) => resolution.trade);

  /*
   * Written even when nothing closed: a stop that moved has to survive the run,
   * or the next one would find the original stop and announce the move again.
   */
  if (closed.length || movedToBreakeven.length) await setJson(ACTIVE_KEY, remaining);

  const stats = closed.length ? await record(closed) : await loadStats();

  return { closed, movedToBreakeven, stats, open: remaining.length };
}

export async function tradesStatus() {
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);
  return {
    open: active.length,
    wins: stats.wins,
    losses: stats.losses,
    expired: stats.expired,
    superseded: stats.superseded,
    voided: stats.voided,
    breakeven: stats.breakeven,
    winRate: winRate(stats),
    byStrategy: stats.byStrategy,
  };
}

export const loadHistory = (): Promise<ClosedTrade[]> => getJson<ClosedTrade[]>(HISTORY_KEY, []);
