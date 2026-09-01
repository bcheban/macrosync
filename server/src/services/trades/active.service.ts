import { env } from '../../config/env.js';
import { assetBySymbol } from '../../data/assets.js';
import type { Strategy } from '../../types/domain.js';
import { getAllTickers24h } from '../market.service.js';
import {
  loadActive,
  loadStats,
  winRate,
  MAX_LIFETIME_MS,
  type ActiveTrade,
} from './trades.service.js';

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
  /** 0..1 of the trade's permitted life. At 1 the next scan closes it. */
  lifeUsed: number;
  /** Set once the stop has been pulled to entry. */
  breakevenAt?: string;
}

export interface ActiveSignalsResponse {
  signals: ActiveSignal[];
  /** Counts per strategy, so the panel can label its groups without recounting. */
  counts: Record<string, number>;
  /**
   * What the open book carries, as opposed to what the closed one returned.
   *
   * The record only ever described settled trades, which made a book of
   * sixty positions look identical to a book of three.
   */
  exposure: { open: number; limit: number; floatingR: number; priced: number };
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
    /*
     * How much of its allotted time this trade has used.
     *
     * The board showed age and never showed what age *meant* — six hours is
     * most of a scalp's life and nothing at all to a swing. A fraction reads
     * the same for all three, and it is the number that says a position is
     * about to be closed for going nowhere rather than for being wrong.
     */
    lifeUsed: round(
      Math.min(
        1,
        (Date.now() - Date.parse(trade.openedAt)) /
          Math.min(MAX_LIFETIME_MS[trade.strategy] ?? Infinity, env.maxTradeDurationMs),
      ),
      2,
    ),
    /*
     * The ladder, and which rungs have paid.
     *
     * Carried through because the board and the alert describe the same trade,
     * and a card showing one target beside a message showing three is the kind
     * of disagreement that makes a reader distrust both. Absent on trades
     * opened before the ladder existed, which is why it is optional rather
     * than defaulted — an empty ladder and no ladder are different facts.
     */
    ...(trade.targets?.length ? { targets: trade.targets } : {}),
    ...(trade.fills?.length ? { fills: trade.fills } : {}),
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

  /*
   * What the open book is worth right now, in risk units.
   *
   * The record only ever showed settled trades, so a book carrying sixty-three
   * positions looked exactly like a book carrying three. That is the number a
   * live trader feels and the one the bot was silent about: each open trade is
   * a full risk unit committed, and the floating total says how much of it the
   * market has taken back so far.
   *
   * Priced trades only. A missing quote leaves the trade out of the sum rather
   * than counting it as flat, which would quietly understate the exposure it
   * is supposed to be reporting.
   */
  const floating = signals.reduce(
    (total, signal) => {
      const risk = Math.abs(signal.entry - signal.initialStopLoss);
      if (!(risk > 0) || signal.price === null) return total;

      const moved =
        signal.side === 'buy' ? signal.price - signal.entry : signal.entry - signal.price;
      return { r: total.r + moved / risk, priced: total.priced + 1 };
    },
    { r: 0, priced: 0 },
  );

  const exposure = {
    /** Open positions, each carrying one risk unit. */
    open: signals.length,
    /** The ceiling the engine stops opening at. */
    limit: env.maxOpenTrades,
    /** Unrealised result across the priced ones, in R. */
    floatingR: Number(floating.r.toFixed(2)),
    priced: floating.priced,
  };

  return {
    signals,
    counts,
    winRate: winRate(stats),
    decided: stats.wins + stats.losses,
    exposure,
    updatedAt: new Date().toISOString(),
  };
}
