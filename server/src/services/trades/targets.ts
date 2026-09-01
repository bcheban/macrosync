import type { Strategy } from '../../types/domain.js';

/**
 * A call's targets, and what closing part of it at each one is worth.
 *
 * One target answers "was the call right". A ladder answers a different and
 * more useful question: what a position taken on it would actually have
 * returned, given that nobody holds a full position from entry to a distant
 * target and back through a stop. Taking half off at the first rung and
 * protecting the rest changes the arithmetic of every trade the bot publishes,
 * so it has to be modelled rather than assumed.
 *
 * Everything here is expressed in R — multiples of the risk the call was opened
 * with — never in prices. A ladder in prices would have to be recomputed for
 * every asset and would silently mean something different on a volatile
 * microcap than on BTC; a ladder in R means the same thing everywhere, and it
 * is the same unit the record is kept in.
 */

/** One rung: how far out, and how much of the position it closes. */
export interface Target {
  /** 1-based, and it is the number the reader sees: TP1, TP2, TP3. */
  level: number;
  price: number;
  /** Share of the original position closed here. The ladder sums to 1. */
  share: number;
}

/** What actually closed, and where. Written once and never revised. */
export interface Fill {
  /** The rung that filled, or 0 for whatever closed the remainder. */
  level: number;
  price: number;
  share: number;
  at: string;
  reason: 'target' | 'stop' | 'breakeven' | 'expiry';
}

/*
 * ## Why the first rung shrank, and the stop stopped moving with it
 *
 * The first ladder took half the position at 1R and pulled the stop to entry
 * on the same fill. It produced a 59% win rate and an edge of +0.014R per
 * trade, which is less than the fees. Eighteen of twenty-six winners returned
 * exactly +0.5R: take half at 1R, get stopped at entry, book half a unit. That
 * is the whole shape of the problem — the rule converted losses into small
 * wins, which flattered the rate and starved the average win.
 *
 * So the first rung now takes a quarter and the stop waits for the second.
 *
 * The cost of that is precise and worth stating rather than discovering. A
 * trade that fills TP1 and comes back no longer books +0.5R; it books
 * `0.25 - 0.75 = -0.5R`, because three quarters of the position is still
 * riding the original stop. On the record as it stood, eighteen trades sat in
 * exactly that state, and **70% of them would have to recover to TP2** for this
 * to be an improvement. That is the bet. It is a real one, and both `TP_SHARES`
 * and `BREAKEVEN_AFTER_RUNG` are environment variables so it can be unwound in
 * a deployment rather than a release.
 *
 * One consequence is structural rather than statistical: a filled rung is no
 * longer proof of a win. `-0.5R` with TP1 filled is a loss, and the resolver
 * grades on realised R instead of on whether any rung was touched.
 */

/**
 * The ladder, per setup, in R.
 *
 * The middle rung is deliberately the target the engine already publishes —
 * `rewardRatio`, 1.5R for every profile today. That keeps the change readable
 * against the existing record: TP2 is where the old single target was, so a
 * trade that would have been a full win before is a trade that fills all the
 * way to TP2 now, and the two can be compared.
 *
 * The first rung sits at 1R because that is where a trade has earned exactly
 * what it risked, and the point of taking half off is to stop being able to
 * lose. The third is the tail: a fifth of the position left to run, which costs
 * nothing when it fails and is where an outsized month comes from when it does
 * not.
 *
 * Shares are the same across setups. They could be tuned per strategy, and the
 * temptation is to hold more of a swing for longer, but there is no evidence
 * for that in this record yet — and a parameter invented ahead of the evidence
 * is one nobody can later prove wrong.
 */
const LADDER: Record<Strategy, readonly { r: number; share: number }[]> = {
  scalping: [
    { r: 1.0, share: 0.25 },
    { r: 1.5, share: 0.45 },
    { r: 2.5, share: 0.3 },
  ],
  day: [
    { r: 1.0, share: 0.25 },
    { r: 1.5, share: 0.45 },
    { r: 2.5, share: 0.3 },
  ],
  swing: [
    { r: 1.0, share: 0.25 },
    { r: 1.5, share: 0.45 },
    { r: 2.5, share: 0.3 },
  ],
};

/**
 * The furthest a target may sit from entry, as a fraction of entry.
 *
 * Mirrors the engine's own bound. A rung beyond it is not a target, it is a
 * number: on a thin microcap the third rung can land at twice the entry price,
 * which no candle in the trade's lifetime is going to reach, and publishing it
 * would put a level on the card that exists only to never be hit.
 */
const MAX_TARGET_FRACTION = 0.5;

/** Rounding that keeps a price a price rather than a float artefact. */
const roundPrice = (value: number): number => {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8;
  return Number(value.toFixed(digits));
};

/**
 * Builds the ladder for one call.
 *
 * Truncates rather than clamps. A rung that would fall outside the sane band
 * is dropped and its share redistributed over the rungs that survive, so the
 * ladder always closes the whole position — clamping instead would put two
 * rungs at the same price, which reads as a typo and fills twice on one candle.
 *
 * Returns an empty ladder when the levels are unusable. The caller refuses the
 * trade in that case; it does not invent a single-target fallback, because a
 * call whose 1R target is already absurd is not a call worth publishing.
 */
/**
 * The first two rungs, for arithmetic that has to stay true when they move.
 *
 * The conversion threshold — how often TP1 must reach TP2 for waiting to be
 * worth it — falls out of these four numbers. Quoting it as a constant would
 * leave a stale 70% on screen the first time the shares are retuned, arguing
 * for a rule nobody is running.
 */
export const LADDER_SHAPE = {
  r1: LADDER.day[0]!.r,
  share1: LADDER.day[0]!.share,
  r2: LADDER.day[1]!.r,
  share2: LADDER.day[1]!.share,
} as const;

export function buildLadder(
  strategy: Strategy,
  side: 'buy' | 'sell',
  entry: number,
  initialStopLoss: number,
): Target[] {
  const risk = Math.abs(entry - initialStopLoss);
  if (!(entry > 0) || !(risk > 0)) return [];

  const sign = side === 'buy' ? 1 : -1;
  const bound = entry * MAX_TARGET_FRACTION;

  const usable = LADDER[strategy].filter((rung) => {
    const distance = risk * rung.r;
    if (distance > bound) return false;
    // A short's target walks toward zero and must stop short of it.
    return entry + sign * distance > 0;
  });

  if (!usable.length) return [];

  const total = usable.reduce((sum, rung) => sum + rung.share, 0);

  return usable.map((rung, index) => ({
    level: index + 1,
    price: roundPrice(entry + sign * risk * rung.r),
    share: Number((rung.share / total).toFixed(4)),
  }));
}

/** What one price is worth in R, signed in the trade's direction. */
export const rAt = (
  side: 'buy' | 'sell',
  entry: number,
  initialStopLoss: number,
  price: number,
): number => {
  const risk = Math.abs(entry - initialStopLoss);
  if (!(risk > 0)) return 0;
  return ((side === 'buy' ? price - entry : entry - price) / risk);
};

/** What one price is worth as a raw move, signed in the trade's direction. */
export const pctAt = (side: 'buy' | 'sell', entry: number, price: number): number => {
  if (!(entry > 0)) return 0;
  const move = ((price - entry) / entry) * 100;
  return side === 'buy' ? move : -move;
};

/**
 * The position-weighted result of a set of fills.
 *
 * This is the whole point of the ladder. A trade that took half off at 1R and
 * gave the rest back at breakeven returned +0.5R, not +1R and not 0 — and no
 * single-level reading of the trade can say that. Both figures are computed the
 * same way so they cannot disagree about which fills counted.
 */
export const weighted = (
  fills: readonly Fill[],
  value: (price: number) => number,
): number => fills.reduce((sum, fill) => sum + fill.share * value(fill.price), 0);

/** How much of the position is still open. Guarded against float drift. */
export const remainingShare = (fills: readonly Fill[]): number => {
  const filled = fills.reduce((sum, fill) => sum + fill.share, 0);
  return Math.max(0, Number((1 - filled).toFixed(6)));
};

/** The rungs that have not filled yet, in order. */
export const pendingTargets = (targets: readonly Target[], fills: readonly Fill[]): Target[] => {
  const hit = new Set(fills.filter((fill) => fill.reason === 'target').map((fill) => fill.level));
  return targets.filter((target) => !hit.has(target.level));
};

/** Whether any target filled — the definition of a win under this system. */
export const anyTargetHit = (fills: readonly Fill[]): boolean =>
  fills.some((fill) => fill.reason === 'target');
