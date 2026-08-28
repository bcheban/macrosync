import type { JournalTrade } from '@/types/domain';

/**
 * The engine's confluence reading, cut into numeric brackets.
 *
 * These replaced High / Medium / Low, and the reason is that the old labels
 * could not be checked against anything. "High" is a claim about the engine;
 * `80–90` is a fact about a number, and the whole point of this control is to
 * find out which brackets actually win — a question a word cannot be wrong
 * about, and a range can.
 *
 * The edges are half-open: a score of exactly 70 belongs to `70–80`, never to
 * both. Stated because an off-by-one here would double-count a trade into two
 * brackets and quietly move both their win rates.
 */
export const BUCKETS = [
  { id: '60-70', min: 60, max: 70 },
  { id: '70-80', min: 70, max: 80 },
  { id: '80-90', min: 80, max: 90 },
  { id: '90+', min: 90, max: Infinity },
] as const;

export type Bucket = (typeof BUCKETS)[number]['id'];

/** Every bracket's id, in ascending order. */
export const BUCKET_IDS = BUCKETS.map((bucket) => bucket.id) as readonly Bucket[];

/** What a bracket is called on screen. Digits, so it needs no translation. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  '60-70': '60–70',
  '70-80': '70–80',
  '80-90': '80–90',
  '90+': '90+',
};

/**
 * Which bracket a score falls in, or `null` below the lowest.
 *
 * `null` is a real answer, not a failure. The engine only calls a setup `live`
 * above 62, but it still publishes `wait` cards at any reading — so a board of
 * fifty signals can hold a dozen that sit under 60 and belong in none of these.
 * Bucketing them into `60–70` to make the counts add up would be inventing
 * evidence for the one bracket this control exists to measure.
 */
export function bucketOf(confidence: number): Bucket | null {
  const found = BUCKETS.find((bucket) => confidence >= bucket.min && confidence < bucket.max);
  return found ? found.id : null;
}

export interface BucketRecord {
  bucket: Bucket;
  wins: number;
  losses: number;
  /** `null` until something has settled — zero of zero is not a rate. */
  rate: number | null;
  /** Cumulative return in units of risk, which is what a rate cannot say. */
  r: number;
}

/**
 * The settled record in one bracket.
 *
 * Trades with no stored confidence are excluded rather than bucketed. They were
 * opened before the ledger kept the figure, and dropping them anywhere would
 * move that bracket's rate with evidence that is not about it.
 */
export function recordForBucket(trades: JournalTrade[], bucket: Bucket | null): BucketRecord {
  const scoped = trades.filter((trade) => {
    if (trade.confidence === null || trade.confidence === undefined) return false;
    const found = bucketOf(trade.confidence);
    return bucket === null ? found !== null : found === bucket;
  });

  const wins = scoped.filter((trade) => trade.outcome === 'win').length;
  const losses = scoped.filter((trade) => trade.outcome === 'loss').length;
  const decided = wins + losses;

  return {
    bucket: bucket ?? '60-70',
    wins,
    losses,
    rate: decided ? Math.round((wins / decided) * 100) : null,
    r: scoped.reduce((sum, trade) => sum + trade.r, 0),
  };
}

/**
 * Every bracket at once — the map the filter is really for.
 *
 * Reading one bracket at a time answers "how did this one do"; reading them
 * side by side answers "does the score mean anything at all", which is the
 * question worth asking before recalibrating anything.
 */
export function recordByBucket(trades: JournalTrade[]): BucketRecord[] {
  return BUCKET_IDS.map((bucket) => ({ ...recordForBucket(trades, bucket), bucket }));
}
