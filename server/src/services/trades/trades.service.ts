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
  stopLoss: number;
  takeProfit: number;
  timeframe: string;
  openedAt: string;
}

/**
 * `win` and `loss` are the only outcomes that move the win rate.
 *
 * `expired` is a call that never reached either level inside its horizon, and
 * `superseded` is one replaced by a reversal on the same pair. Counting either
 * as a loss would be as dishonest as counting it as a win — they are recorded
 * separately so the denominator stays meaningful and nothing is quietly dropped.
 */
export type Outcome = 'win' | 'loss' | 'expired' | 'superseded';

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
  byStrategy: {},
  updatedAt: new Date(0).toISOString(),
};

const INTERVAL: Record<Strategy, Interval> = { scalping: '5m', day: '1h', swing: '4h' };

/**
 * How long a call is given to resolve, roughly three times the duration the
 * alert advertises.
 *
 * Without this a trade that never reaches either level stays open forever: the
 * active list grows without bound, every run re-fetches candles for all of it,
 * and the win rate silently counts only the decisive calls — which is the most
 * flattering possible sample.
 */
const MAX_LIFETIME_MS: Record<Strategy, number> = {
  scalping: 6 * 60 * 60_000,
  day: 36 * 60 * 60_000,
  swing: 10 * 24 * 60 * 60_000,
};

/** Bars fetched per resolve — must span the longest a trade can stay open. */
const LOOKBACK: Record<Strategy, number> = {
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
    takeProfit: signal.takeProfit,
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
async function resolve(trade: ActiveTrade, now: number): Promise<ClosedTrade | undefined> {
  const age = now - Date.parse(trade.openedAt);

  const set = await getKlines(trade.symbol, INTERVAL[trade.strategy], LOOKBACK[trade.strategy]).catch(
    () => undefined,
  );

  if (set) {
    const openedAt = Date.parse(trade.openedAt);
    const since = set.candles.filter((candle) => candle.openTime >= openedAt);

    const hitStop = since.some((candle) =>
      trade.side === 'buy' ? candle.low <= trade.stopLoss : candle.high >= trade.stopLoss,
    );
    const hitTarget = since.some((candle) =>
      trade.side === 'buy' ? candle.high >= trade.takeProfit : candle.low <= trade.takeProfit,
    );

    if (hitStop) return close(trade, 'loss', trade.stopLoss);
    if (hitTarget) return close(trade, 'win', trade.takeProfit);
  }

  /*
   * Timed out. Closed at the last price we can see rather than at a level,
   * because neither was reached — and kept out of the win rate for the same
   * reason.
   */
  if (age > MAX_LIFETIME_MS[trade.strategy]) {
    const last = set?.candles[set.candles.length - 1]?.close ?? trade.entry;
    return close(trade, 'expired', last);
  }

  return undefined;
}

/** Folds closed trades into the running statistics and the history log. */
async function record(closed: ClosedTrade[]): Promise<TradeStats> {
  const stats = await loadStats();

  const next: TradeStats = {
    wins: stats.wins + closed.filter((trade) => trade.outcome === 'win').length,
    losses: stats.losses + closed.filter((trade) => trade.outcome === 'loss').length,
    expired: stats.expired + closed.filter((trade) => trade.outcome === 'expired').length,
    superseded: stats.superseded + closed.filter((trade) => trade.outcome === 'superseded').length,
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
export async function evaluateTrades(
  now = Date.now(),
): Promise<{ closed: ClosedTrade[]; stats: TradeStats; open: number }> {
  const active = await loadActive();
  if (!active.length) return { closed: [], stats: await loadStats(), open: 0 };

  const settled = await Promise.all(active.map((trade) => resolve(trade, now)));
  const closed = settled.filter((trade): trade is ClosedTrade => Boolean(trade));

  if (!closed.length) return { closed: [], stats: await loadStats(), open: active.length };

  const closedIds = new Set(closed.map((trade) => trade.id));
  const remaining = active.filter((trade) => !closedIds.has(trade.id));

  await setJson(ACTIVE_KEY, remaining);
  const stats = await record(closed);

  return { closed, stats, open: remaining.length };
}

export async function tradesStatus() {
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);
  return {
    open: active.length,
    wins: stats.wins,
    losses: stats.losses,
    expired: stats.expired,
    superseded: stats.superseded,
    winRate: winRate(stats),
    byStrategy: stats.byStrategy,
  };
}

export const loadHistory = (): Promise<ClosedTrade[]> => getJson<ClosedTrade[]>(HISTORY_KEY, []);
