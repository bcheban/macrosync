import type { ClosedTrade } from './trades.service.js';

/**
 * The record cut by the confluence reading each call was made on.
 *
 * A mirror of the web's `lib/confidence.ts`, deliberately: the bot and the
 * dashboard must not be able to quote different win rates for the same
 * bracket. The edges, the exclusions and the small-sample threshold are all
 * copied here rather than approximated, and this comment is the only thing
 * keeping them honest — the two files are in separate builds and nothing
 * compiles across them.
 *
 * Brackets are half-open: 70 belongs to `70–80` and never to both. An
 * off-by-one would count a trade twice and move both rates.
 */
export const BUCKETS = [
  { id: '60-70', label: '60–70', min: 60, max: 70 },
  { id: '70-80', label: '70–80', min: 70, max: 80 },
  { id: '80-90', label: '80–90', min: 80, max: 90 },
  { id: '90+', label: '90+', min: 90, max: Infinity },
] as const;

export type BucketId = (typeof BUCKETS)[number]['id'];

/**
 * Below this a bracket's percentage is not evidence.
 *
 * The dashboard greys the figure; the bot has no colour, so it marks the row
 * instead. Same number, so the two cannot disagree about which rows are worth
 * acting on.
 */
export const THIN_SAMPLE = 10;

/**
 * Which bracket a reading falls in, or `null` below the lowest.
 *
 * `null` is a real answer. The engine only calls a setup `live` above 62 but
 * publishes `wait` cards at any reading, so plenty of scores sit under 60 and
 * belong to none of these. Folding them into `60–70` would invent evidence for
 * the one bracket this exists to measure.
 */
export function bucketOf(confidence: number): BucketId | null {
  const found = BUCKETS.find((bucket) => confidence >= bucket.min && confidence < bucket.max);
  return found ? found.id : null;
}

/**
 * What a settled trade returned, in units of the risk it was opened with.
 *
 * Computed from the levels rather than from the reward ratio the engine
 * advertised: a breakeven close returned zero however generous its target was,
 * and a trade whose stop had already moved risked less than its published stop
 * implied. Summing advertised ratios would describe the strategy that was
 * intended rather than the one that ran.
 */
export function realisedR(trade: ClosedTrade): number {
  const opened = trade.initialStopLoss ?? trade.stopLoss;
  const risk = Math.abs(trade.entry - opened);
  if (!(risk > 0)) return 0;

  const exit =
    trade.outcome === 'win' ? trade.takeProfit : trade.outcome === 'loss' ? trade.stopLoss : trade.entry;
  const moved = trade.side === 'buy' ? exit - trade.entry : trade.entry - exit;

  return moved / risk;
}

/** Only outcomes that say something about the call. */
const SETTLED = new Set(['win', 'loss', 'breakeven']);

/**
 * What every settled trade adds up to, in units of risk.
 *
 * The one number a win rate cannot give. Rates and reward ratios move
 * independently — 40% at 2R is a business and 60% at 0.4R is not — so a
 * percentage on its own cannot say whether the engine is making money. This
 * can, and it is the figure to read first.
 *
 * Counts every settled trade, including the ones with no stored confidence.
 * Those are excluded from the brackets because they cannot be attributed to
 * one, but they are still trades that happened and their result is still part
 * of the total. The bracket rows and this line therefore do not have to sum to
 * each other, which is correct and worth knowing before someone checks.
 */
/**
 * The risk per trade a simulated dollar figure is quoted against.
 *
 * R is the honest unit — it is what the engine controls and it compares across
 * readers who size differently — but it is also abstract, and "-13.5R" does not
 * land the way "-$1,350" does. So the dollars are shown beside it rather than
 * instead of it: a round number nobody actually risks, stated as a simulation,
 * so it is read as a scale rather than as somebody's account.
 *
 * Mirrored in the web's `lib/money.ts`. Change one and the two disagree.
 */
export const RISK_PER_TRADE_USD = 100;

/** `-$1,350`. Whole dollars: the cents of a hypothetical are noise. */
export function simulatedUsd(r: number): string {
  const amount = Math.round(r * RISK_PER_TRADE_USD);
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}

/**
 * The unleveraged move, summed across every settled trade.
 *
 * `resultPct` is written at close as `((exit - entry) / entry) * 100`, signed
 * by side, so this is the raw price movement a one-unit position in each call
 * would have captured — no leverage, no position sizing, no compounding.
 *
 * It answers a different question from R and neither replaces the other. R
 * normalises by the risk each trade was opened with, so a wide-stop swing and
 * a tight scalp weigh the same; this does not, so a single volatile call can
 * dominate it. Read together they say whether the engine picks direction and
 * whether it sizes the risk of picking it.
 *
 * Summed rather than compounded, deliberately. Compounding would imply the
 * whole account rode every trade in sequence, which is not what happened and
 * would make the figure depend on their order.
 */
export function cumulativeRoiPct(history: ClosedTrade[]): number {
  return history
    .filter((trade) => SETTLED.has(trade.outcome))
    .reduce((sum, trade) => sum + (Number.isFinite(trade.resultPct) ? trade.resultPct : 0), 0);
}

export function netR(history: ClosedTrade[]): { r: number; settled: number } {
  const settled = history.filter((trade) => SETTLED.has(trade.outcome));
  return {
    r: settled.reduce((sum, trade) => sum + realisedR(trade), 0),
    settled: settled.length,
  };
}

export interface BucketRecord {
  id: BucketId;
  label: string;
  wins: number;
  losses: number;
  /** Wins plus losses. Breakevens are in `r` but out of the rate. */
  decided: number;
  /** `null` on an empty sample — zero of zero is not a rate. */
  rate: number | null;
  r: number;
  /** Fewer settled trades than the threshold, so the rate is not yet evidence. */
  thin: boolean;
}

/**
 * Every bracket, in ascending order.
 *
 * Trades with no stored confidence are dropped rather than bucketed — they were
 * opened before the ledger kept the figure, and putting them anywhere would
 * move that bracket's rate with evidence that is not about it.
 */
export function recordByBucket(history: ClosedTrade[]): BucketRecord[] {
  const settled = history.filter(
    (trade) => SETTLED.has(trade.outcome) && typeof trade.confidence === 'number',
  );

  return BUCKETS.map((bucket) => {
    const mine = settled.filter((trade) => bucketOf(trade.confidence as number) === bucket.id);
    const wins = mine.filter((trade) => trade.outcome === 'win').length;
    const losses = mine.filter((trade) => trade.outcome === 'loss').length;
    const decided = wins + losses;

    return {
      id: bucket.id,
      label: bucket.label,
      wins,
      losses,
      decided,
      rate: decided ? Math.round((wins / decided) * 100) : null,
      r: mine.reduce((sum, trade) => sum + realisedR(trade), 0),
      thin: decided > 0 && decided < THIN_SAMPLE,
    };
  });
}
