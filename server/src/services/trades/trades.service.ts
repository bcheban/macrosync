import { getKlines, type Interval } from '../market.service.js';
import type { Signal, Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * Outcome tracking for the calls the bot publishes.
 *
 * A signal is only worth anything if someone counts how often it was right, so
 * every alert opens a trade here and every scheduled run checks whether the
 * open ones reached their target or their stop.
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

export interface ClosedTrade extends ActiveTrade {
  outcome: 'win' | 'loss';
  closedAt: string;
  /** Realised move in percent, signed in the direction of the trade. */
  resultPct: number;
}

export interface TradeStats {
  wins: number;
  losses: number;
  byStrategy: Record<string, { wins: number; losses: number }>;
  updatedAt: string;
}

const ACTIVE_KEY = storeKey('trades:active');
const STATS_KEY = storeKey('trades:stats');
const HISTORY_KEY = storeKey('trades:history');

const EMPTY_STATS: TradeStats = { wins: 0, losses: 0, byStrategy: {}, updatedAt: new Date(0).toISOString() };

/** Bars to inspect per strategy when replaying what happened since entry. */
const INTERVAL: Record<Strategy, Interval> = { scalping: '5m', day: '1h', swing: '4h' };

export const winRate = (stats: TradeStats): number => {
  const total = stats.wins + stats.losses;
  return total ? Math.round((stats.wins / total) * 100) : 0;
};

export const loadStats = (): Promise<TradeStats> => getJson<TradeStats>(STATS_KEY, EMPTY_STATS);
export const loadActive = (): Promise<ActiveTrade[]> => getJson<ActiveTrade[]>(ACTIVE_KEY, []);

/**
 * Records a call as an open trade.
 *
 * One open trade per asset+strategy: a second alert on the same pair replaces
 * nothing and is ignored, so a reversal does not leave two contradictory trades
 * running against each other.
 */
export async function openTrade(signal: Signal): Promise<boolean> {
  if (signal.verdict === 'wait') return false;

  const active = await loadActive();
  const key = `${signal.symbol}:${signal.strategy}`;
  if (active.some((trade) => `${trade.symbol}:${trade.strategy}` === key)) return false;

  active.push({
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

  await setJson(ACTIVE_KEY, active);
  return true;
}

/**
 * Decides whether a trade finished, by replaying the candles since it opened.
 *
 * Checking the last price would miss a wick that touched the target between two
 * scheduled runs, so this looks at the actual highs and lows of every bar since
 * entry. When one bar touched both levels the stop wins: intrabar order is
 * unknowable from candles, and counting that as a win would flatter the record.
 */
async function resolve(trade: ActiveTrade): Promise<ClosedTrade | undefined> {
  const set = await getKlines(trade.symbol, INTERVAL[trade.strategy], 180).catch(() => undefined);
  if (!set) return undefined;

  const openedAt = Date.parse(trade.openedAt);
  const since = set.candles.filter((candle) => candle.openTime >= openedAt - 60_000);
  if (!since.length) return undefined;

  const hitTarget = since.some((candle) =>
    trade.side === 'buy' ? candle.high >= trade.takeProfit : candle.low <= trade.takeProfit,
  );
  const hitStop = since.some((candle) =>
    trade.side === 'buy' ? candle.low <= trade.stopLoss : candle.high >= trade.stopLoss,
  );

  if (!hitTarget && !hitStop) return undefined;

  const outcome: ClosedTrade['outcome'] = hitStop ? 'loss' : 'win';
  const exit = outcome === 'win' ? trade.takeProfit : trade.stopLoss;
  const move = ((exit - trade.entry) / trade.entry) * 100;

  return {
    ...trade,
    outcome,
    closedAt: new Date().toISOString(),
    resultPct: Number((trade.side === 'buy' ? move : -move).toFixed(2)),
  };
}

/**
 * Checks every open trade and settles the ones that reached a level.
 * Returns what closed, so the caller can announce it.
 */
export async function evaluateTrades(): Promise<{ closed: ClosedTrade[]; stats: TradeStats; open: number }> {
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);
  if (!active.length) return { closed: [], stats, open: 0 };

  const settled = await Promise.all(active.map(resolve));
  const closed = settled.filter((trade): trade is ClosedTrade => Boolean(trade));

  if (!closed.length) return { closed: [], stats, open: active.length };

  const closedIds = new Set(closed.map((trade) => trade.id));
  const remaining = active.filter((trade) => !closedIds.has(trade.id));

  const next: TradeStats = {
    wins: stats.wins + closed.filter((trade) => trade.outcome === 'win').length,
    losses: stats.losses + closed.filter((trade) => trade.outcome === 'loss').length,
    byStrategy: { ...stats.byStrategy },
    updatedAt: new Date().toISOString(),
  };

  for (const trade of closed) {
    const bucket = next.byStrategy[trade.strategy] ?? { wins: 0, losses: 0 };
    if (trade.outcome === 'win') bucket.wins += 1;
    else bucket.losses += 1;
    next.byStrategy[trade.strategy] = bucket;
  }

  // A short history makes the record auditable rather than just a percentage.
  const history = await getJson<ClosedTrade[]>(HISTORY_KEY, []);
  await Promise.all([
    setJson(ACTIVE_KEY, remaining),
    setJson(STATS_KEY, next),
    setJson(HISTORY_KEY, [...closed, ...history].slice(0, 100)),
  ]);

  return { closed, stats: next, open: remaining.length };
}

export async function tradesStatus() {
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);
  return {
    open: active.length,
    wins: stats.wins,
    losses: stats.losses,
    winRate: winRate(stats),
    byStrategy: stats.byStrategy,
  };
}
