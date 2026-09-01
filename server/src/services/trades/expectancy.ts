import { env } from '../../config/env.js';
import { realisedR } from './confidence.js';
import { LADDER_SHAPE } from './targets.js';
import type { ClosedTrade } from './trades.service.js';

/**
 * What a trade is worth on average, which is the only question that matters.
 *
 * A win rate cannot answer it and is actively misleading when the wins and the
 * losses are different sizes — which, under a ladder, they always are. A loss
 * is one risk unit by construction. A win is anywhere from a fraction of one to
 * several, depending on how far the ladder ran, and the modal outcome is the
 * smallest of them: take the first rung, get stopped at entry, book half.
 *
 * So a rate of 59% can sit on top of an edge of almost exactly zero, and it
 * did. This module exists to make that visible before somebody trades it.
 */

export interface Expectancy {
  wins: number;
  losses: number;
  settled: number;
  /** Mean R of the winners. Under a ladder this is well below the top rung. */
  avgWinR: number;
  /** Mean R of the losers, as a positive magnitude. Essentially always 1. */
  avgLossR: number;
  /** Mean R across every settled trade — the edge, before costs. */
  perTradeR: number;
  winRatePct: number;
  /**
   * The win rate this payoff needs to break even.
   *
   * `avgLoss / (avgWin + avgLoss)`. Below it the strategy loses however good
   * the entries look; the distance between it and the actual rate is the entire
   * margin of safety, and it is usually much thinner than a rate suggests.
   */
  breakEvenWinRatePct: number;
  /** Actual rate minus the break-even rate, in percentage points. */
  marginPts: number;
  /** Fees and slippage, in R, from the trades' own stop distances. */
  costR: number;
  /** `perTradeR - costR`. What a live account actually keeps. */
  netPerTradeR: number;
}

/**
 * Round-trip fills a laddered trade pays for.
 *
 * One to open, then the exits. A full ladder is three exits; a stop after TP1
 * is two. Three total is the middle of the distribution and errs slightly low,
 * which is the right direction for a figure used to argue that costs matter.
 */
const FILLS_PER_TRADE = 3;

/**
 * The cost of a trade in R, derived rather than assumed.
 *
 * At a fixed risk per trade, position size is set entirely by how far the stop
 * sits: `notional = risk / stopFraction`. Fees are charged on notional, so the
 * cost in risk units is `fills × feeRate / stopFraction` — independent of
 * account size, and computable from the trade's own levels.
 *
 * This is why a tight stop is expensive. A 1.5% stop makes the position seven
 * times larger than a 10% stop for the same risk, and therefore seven times the
 * fee for the same R.
 */
export function tradeCostR(stopFraction: number): number {
  if (!(stopFraction > 0)) return 0;
  return (FILLS_PER_TRADE * (env.takerFeePct / 100)) / stopFraction;
}

/**
 * A stop width to charge a trade whose own is not recorded.
 *
 * The median across the live record. Used only to seed the accumulator
 * for trades that closed before it existed; every trade after that is
 * charged the width it actually carried.
 */
export const TYPICAL_STOP_FRACTION = 0.07;

function costInR(trade: ClosedTrade): number {
  const opened = trade.initialStopLoss ?? trade.stopLoss;
  return tradeCostR(Math.abs(trade.entry - opened) / trade.entry);
}

/**
 * The payoff profile of a settled record.
 *
 * Costs are estimated, not measured — the bot places no orders and cannot know
 * what anybody was filled at. The estimate uses the exchange's taker fee and
 * each trade's own stop distance, so it is specific to this record rather than
 * a flat percentage, and it excludes slippage, which makes it optimistic.
 */
export function expectancy(history: ClosedTrade[]): Expectancy | null {
  const settled = history.filter(
    (trade) => trade.outcome === 'win' || trade.outcome === 'loss',
  );
  if (!settled.length) return null;

  const winners = settled.filter((trade) => trade.outcome === 'win');
  const losers = settled.filter((trade) => trade.outcome === 'loss');

  const mean = (values: number[]): number =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const avgWinR = mean(winners.map(realisedR));
  const avgLossR = Math.abs(mean(losers.map(realisedR)));
  const perTradeR = mean(settled.map(realisedR));
  const winRatePct = (winners.length / settled.length) * 100;

  /*
   * With no losses yet there is no payoff ratio to speak of, and reporting a
   * break-even rate of 0% would read as a strategy that cannot lose.
   */
  const breakEvenWinRatePct =
    avgWinR + avgLossR > 0 ? (avgLossR / (avgWinR + avgLossR)) * 100 : 0;

  const costR = mean(settled.map(costInR));

  return {
    wins: winners.length,
    losses: losers.length,
    settled: settled.length,
    avgWinR,
    avgLossR,
    perTradeR,
    winRatePct,
    breakEvenWinRatePct,
    marginPts: winRatePct - breakEvenWinRatePct,
    costR,
    netPerTradeR: perTradeR - costR,
  };
}

/**
 * How the winners are distributed across the ladder.
 *
 * The number that explains everything else. If most wins are the first rung
 * only, the average win is pinned near `share × 1R` however generous the far
 * targets look, and no amount of win rate rescues that.
 */
export function winShape(history: ClosedTrade[]): { r: number; count: number }[] {
  const winners = history.filter((trade) => trade.outcome === 'win');
  const buckets = new Map<number, number>();

  for (const trade of winners) {
    const r = Number(realisedR(trade).toFixed(2));
    buckets.set(r, (buckets.get(r) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([r, count]) => ({ r, count }))
    .sort((a, b) => a.r - b.r);
}

/**
 * What happens after the first rung fills — the number the ladder rests on.
 *
 * The stop waits for TP2 now, which buys the winners room and costs a specific
 * thing: a trade that takes TP1 and reverses returns `0.25 - 0.75 = -0.5R`
 * where the old rule banked `+0.5R`. Roughly **70% of TP1 fills must go on to
 * TP2** for that trade to be worth making.
 *
 * Nobody can know that in advance, and it is not a matter of opinion once there
 * is a record. So it is measured here, and `BREAKEVEN_AFTER_RUNG` is the lever
 * it decides: below the threshold, the old rule was better and should come
 * back.
 *
 * `stalled` is the case that costs money — TP1 filled, TP2 never reached, and
 * the trade closed down. `rescued` is the same path ending flat or better,
 * which happens on an expiry above entry; it is neither the win the bet was
 * for nor the loss it was risking, so it is counted apart rather than folded
 * into whichever number looks better.
 */
export interface Tp1Conversion {
  /** Settled trades whose first rung filled. The denominator. */
  reachedTp1: number;
  /** Of those, how many went on to fill TP2. */
  reachedTp2: number;
  /** TP1 only, closed at a loss. The -0.5R case the bet is against. */
  stalled: number;
  /** TP1 only, closed flat or better without reaching TP2. */
  rescued: number;
  /** `reachedTp2 / reachedTp1`, or null with nothing to divide. */
  conversionPct: number | null;
  /** Mean R of the trades that stopped at TP1, whatever they returned. */
  stalledAvgR: number;
  /** The share of TP1 fills that must convert for the current rule to pay. */
  breakEvenPct: number;
  /** Enough trades to mean something. Below this it is an anecdote. */
  reliable: boolean;
  /**
   * Settled trades excluded because they ran under a different rule.
   *
   * The number that stops this metric answering the wrong question. Under the
   * old rule the stop moved at TP1, so a trade that filled the first rung and
   * pulled back was *closed* there — it could not have reached TP2 and counting
   * it as a failure to convert argues for a rollback using evidence produced by
   * the thing being rolled back to.
   */
  otherRule: number;
}

/** Under this many TP1 fills, the conversion rate is noise. */
const CONVERSION_SAMPLE = 20;

export function tp1Conversion(history: ClosedTrade[]): Tp1Conversion {
  const decided = history.filter(
    (trade) => trade.outcome === 'win' || trade.outcome === 'loss',
  );

  /*
   * Only trades that actually ran the rule being measured. A trade with no
   * stamp predates the field and therefore ran the old one.
   */
  const settled = decided.filter(
    (trade) => (trade.protectAfterRung ?? 1) === env.breakevenAfterRung,
  );

  const filled = (trade: ClosedTrade, level: number): boolean =>
    (trade.fills ?? []).some((fill) => fill.reason === 'target' && fill.level >= level);

  const reachedTp1 = settled.filter((trade) => filled(trade, 1));
  const reachedTp2 = reachedTp1.filter((trade) => filled(trade, 2));
  const onlyTp1 = reachedTp1.filter((trade) => !filled(trade, 2));

  const stalled = onlyTp1.filter((trade) => realisedR(trade) < 0);
  const rescued = onlyTp1.length - stalled.length;

  const stalledAvgR = onlyTp1.length
    ? onlyTp1.reduce((sum, trade) => sum + realisedR(trade), 0) / onlyTp1.length
    : 0;

  /*
   * The threshold, derived rather than quoted.
   *
   * Under the old rule a TP1 fill banked `share1 x 1R` and stopped there. Under
   * this one it is worth `+tp2Value` if it converts and `-stallValue` if it does
   * not, so conversion has to satisfy
   *
   *     p x tp2Value - (1 - p) x stallValue >= oldValue
   *
   * which rearranges to the fraction below. Computed from the ladder rather
   * than hard-coded so it stays true if the shares are retuned.
   */
  const ladder = LADDER_SHAPE;
  const oldValue = ladder.share1 * ladder.r1;
  const tp2Value = ladder.share1 * ladder.r1 + ladder.share2 * ladder.r2;
  const stallValue = ladder.share1 * ladder.r1 - (1 - ladder.share1);
  const breakEvenPct = ((oldValue - stallValue) / (tp2Value - stallValue)) * 100;

  return {
    reachedTp1: reachedTp1.length,
    reachedTp2: reachedTp2.length,
    stalled: stalled.length,
    rescued,
    conversionPct: reachedTp1.length ? (reachedTp2.length / reachedTp1.length) * 100 : null,
    stalledAvgR,
    breakEvenPct,
    reliable: reachedTp1.length >= CONVERSION_SAMPLE,
    otherRule: decided.length - settled.length,
  };
}
