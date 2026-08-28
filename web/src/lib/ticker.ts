/**
 * What a ticker is called on a card, as opposed to what the exchange calls it.
 *
 * MEXC lists a few tokens under padded names — `PUMPFUN`, `TRUMPOFFICIAL` —
 * where the tail is branding rather than part of the ticker anyone uses. Left
 * alone they are the two widest headers on the board and read as different
 * assets from the ones people know.
 *
 * The rule is a short allow-list, not a heuristic, and the reason is in the
 * catalogue: of 148 listed bases, stripping a plausible-looking suffix breaks
 * more than it fixes.
 *
 *   COIN  →  FARTCOIN becomes FART, FILECOIN becomes FILE
 *   AI    →  SKYAI becomes SKY
 *   X     →  AVAX becomes AVA, TRX becomes TR
 *
 * Every one of those is a real listing whose name simply ends that way. So the
 * list below holds only tails that are never part of a ticker, and each is
 * guarded by the length of what would remain — `FUN` is itself a token, and a
 * rule that renamed it to nothing would be worse than no rule at all.
 */

/** Tails that are branding. Ordered longest first so the greediest match wins. */
const REDUNDANT = ['OFFICIAL', 'FUN'] as const;

/** Below this, whatever is left is not a ticker and the original stands. */
const MIN_REMAINDER = 3;

/**
 * Exceptions the suffix rule cannot express.
 *
 * Empty today. It exists because the next case will be a rename rather than a
 * suffix — an exchange listing something as `1000PEPE`, say — and a map is
 * where that belongs, not another clause in the rule above.
 */
const ALIASES: Record<string, string> = {};

/**
 * The display name for a base ticker.
 *
 * Idempotent, and it never invents: anything it does not recognise comes back
 * exactly as it arrived. That matters because this runs on every card header,
 * every watchlist row and every tab — a wrong answer here renames an asset
 * across the whole interface.
 */
export function displayTicker(base: string): string {
  const upper = base.trim().toUpperCase();
  if (!upper) return base;

  const alias = ALIASES[upper];
  if (alias) return alias;

  for (const suffix of REDUNDANT) {
    if (upper.length <= suffix.length) continue;
    if (!upper.endsWith(suffix)) continue;

    const stem = upper.slice(0, -suffix.length);
    if (stem.length >= MIN_REMAINDER) return stem;
  }

  return upper;
}

/**
 * `PUMP/USDT` — the pair, for places with room for it.
 *
 * The quote is split off the symbol rather than assumed, because the board is
 * not all USDT and a hardcoded quote would be wrong the first time it is not.
 */
export function displayPair(base: string, symbol: string): string {
  const stem = displayTicker(base);
  const quote = symbol.toUpperCase().replace(base.toUpperCase(), '');
  return quote ? `${stem}/${quote}` : stem;
}
