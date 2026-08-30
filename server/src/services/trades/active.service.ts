import { assetBySymbol } from '../../data/assets.js';
import type { Strategy } from '../../types/domain.js';
import { getAllTickers24h } from '../market.service.js';
import { loadActive, loadStats, winRate, type ActiveTrade } from './trades.service.js';

/**
 * The open trades, priced, for the dashboard.
 *
 * The bot's ledger and the website used to be separate worlds: Telegram knew
 * what was being tracked and the site did not, so the two could describe the
 * same moment differently. This is the ledger as the dashboard sees it — the
 * same records, with a live price and how far each has travelled.
 *
 * Priced from the exchange-wide ticker feed. One request covers every open
 * trade regardless of how many there are; per-symbol lookups would be one round
 * trip each on a panel that polls.
 */

export interface ActiveSignal {
  id: string;
  symbol: string;
  base: string;
  name: string;
  strategy: Strategy;
  side: 'buy' | 'sell';
  timeframe: string;
  entry: number;
  /** The stop in force now — equal to entry once the trade is protected. */
  stopLoss: number;
  /** Where the stop started, so the risk the call carried stays legible. */
  initialStopLoss: number;
  takeProfit: number;
  /** Null when the exchange feed could not be read — the row still renders. */
  price: number | null;
  /** Move since entry, signed in the trade's direction. */
  unrealisedPct: number | null;
  /**
   * Distance travelled from entry toward the target, in percent.
   *
   * Negative means it has gone the other way, toward the stop. Not clamped: a
   * trade sitting at -80% of its way to the stop is exactly what somebody
   * looking at this panel needs to see.
   */
  progressPct: number | null;
  openedAt: string;
  ageMinutes: number;
  /** Set once the stop has been pulled to entry. */
  breakevenAt?: string;
}

export interface ActiveSignalsResponse {
  signals: ActiveSignal[];
  /** Counts per strategy, so the panel can label its groups without recounting. */
  counts: Record<string, number>;
  winRate: number;
  decided: number;
  updatedAt: string;
}

const round = (value: number, places = 2): number => Number(value.toFixed(places));

function priceTrade(trade: ActiveTrade, price: number | undefined): ActiveSignal {
  const meta = assetBySymbol(trade.symbol);
  const span = trade.takeProfit - trade.entry;

  const move = price === undefined ? null : ((price - trade.entry) / trade.entry) * 100;

  return {
    id: trade.id,
    symbol: trade.symbol,
    base: trade.base,
    name: meta?.name ?? trade.base,
    strategy: trade.strategy,
    side: trade.side,
    timeframe: trade.timeframe,
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    initialStopLoss: trade.initialStopLoss ?? trade.stopLoss,
    takeProfit: trade.takeProfit,
    price: price ?? null,
    unrealisedPct: move === null ? null : round(trade.side === 'buy' ? move : -move),
    // `span` carries the direction, so this reads the same for a long and a short.
    progressPct: price === undefined || span === 0 ? null : round(((price - trade.entry) / span) * 100, 1),
    openedAt: trade.openedAt,
    ageMinutes: Math.max(0, Math.round((Date.now() - Date.parse(trade.openedAt)) / 60_000)),
    ...(trade.breakevenAt ? { breakevenAt: trade.breakevenAt } : {}),
  };
}

export async function getActiveSignals(): Promise<ActiveSignalsResponse> {
  /*
   * The record beside the board is the whole record.
   *
   * The counters are the only thing that remembers every decided call; the
   * detailed log keeps the most recent closes and rolls the rest out. A badge
   * has room for one number, so it gets the complete one. The journal is where
   * the priced subset lives, and it says as much itself.
   */
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);

  /*
   * A pricing failure must not empty the panel. The trades are what matters
   * here; the price is decoration on top of them, so an unreachable exchange
   * costs the decoration and nothing else.
   */
  const prices = await getAllTickers24h()
    .then((tickers) => new Map(tickers.map((ticker) => [ticker.symbol, ticker.lastPrice])))
    .catch(() => new Map<string, number>());

  const signals = active
    .map((trade) => priceTrade(trade, prices.get(trade.symbol)))
    // Newest first: the call somebody just received is the one they are looking for.
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));

  const counts = signals.reduce<Record<string, number>>((totals, signal) => {
    totals[signal.strategy] = (totals[signal.strategy] ?? 0) + 1;
    return totals;
  }, {});

  return {
    signals,
    counts,
    winRate: winRate(stats),
    decided: stats.wins + stats.losses,
    updatedAt: new Date().toISOString(),
  };
}
