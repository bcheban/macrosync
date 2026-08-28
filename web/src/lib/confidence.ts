import type { JournalTrade } from '@/types/domain';

/**
 * The engine's confluence reading, cut into three bands.
 *
 * The number itself is agreement between trend, momentum, mean reversion and
 * volume, on 0–100. It is already shown on every card as a meter; what it is
 * not, on its own, is a filter — nobody scans a board deciding whether 68 is
 * better than 63.
 *
 * The cuts are drawn where the engine's own behaviour already changes. It only
 * calls a setup `live` at 62, so everything published sits above that: `high`
 * is the top of that range rather than the top of the scale, and `low` is not
 * "weak", it is "confirmed, but barely".
 *
 * Bands are a presentation decision and live only here. The API publishes the
 * raw figure, which means these can be redrawn without a deploy of the server
 * and without invalidating any stored record.
 */
export const BANDS = ['high', 'medium', 'low'] as const;
export type Band = (typeof BANDS)[number];

const HIGH = 75;
const MEDIUM = 66;

export function bandOf(confidence: number): Band {
  if (confidence >= HIGH) return 'high';
  if (confidence >= MEDIUM) return 'medium';
  return 'low';
}

/** The range each band covers, for the tooltip that has to explain itself. */
export const BAND_RANGE: Record<Band, string> = {
  high: `${HIGH}+`,
  medium: `${MEDIUM}–${HIGH - 1}`,
  low: `<${MEDIUM}`,
};

export interface BandRecord {
  wins: number;
  losses: number;
  /** `null` until something has settled — zero of zero is not a rate. */
  rate: number | null;
  /** Cumulative return in units of risk, which is what a rate cannot say. */
  r: number;
}

/**
 * What the record looks like at one band.
 *
 * Trades with no stored confidence are excluded rather than bucketed. They are
 * the ones opened before the ledger kept the figure, and dropping them into any
 * band would move that band's rate using evidence that does not belong to it —
 * which is the exact thing this readout exists to measure.
 *
 * `null` for the rate on an empty sample, so a caller has to decide what to
 * show rather than printing a confident 0%.
 */
export function recordForBand(trades: JournalTrade[], band: Band | null): BandRecord {
  const scoped = trades.filter((trade) => {
    if (trade.confidence === null || trade.confidence === undefined) return false;
    return band === null || bandOf(trade.confidence) === band;
  });

  const wins = scoped.filter((trade) => trade.outcome === 'win').length;
  const losses = scoped.filter((trade) => trade.outcome === 'loss').length;
  const decided = wins + losses;

  return {
    wins,
    losses,
    rate: decided ? Math.round((wins / decided) * 100) : null,
    r: scoped.reduce((sum, trade) => sum + trade.r, 0),
  };
}
