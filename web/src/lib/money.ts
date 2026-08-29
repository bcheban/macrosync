/**
 * What an R-multiple looks like in dollars, for somebody who thinks in dollars.
 *
 * R is the honest unit: it is what the engine controls, and it compares across
 * readers who size differently. It is also abstract — "-13.5R" does not land
 * the way "-$1,350" does — so the dollars sit beside it rather than instead of
 * it, against a round number nobody actually risks, labelled as a simulation.
 *
 * Mirrored in the server's `services/trades/confidence.ts`. Change one and the
 * bot and the site quote different money for the same record.
 */
export const RISK_PER_TRADE_USD = 100;

/** `-$1,350`. Whole dollars — the cents of a hypothetical are noise. */
export function simulatedUsd(r: number): string {
  const amount = Math.round(r * RISK_PER_TRADE_USD);
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}
