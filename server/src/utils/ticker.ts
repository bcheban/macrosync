/**
 * What a ticker is called in a message, as opposed to what the exchange calls it.
 *
 * A mirror of the web's `lib/ticker.ts`. The two are separate builds and
 * nothing compiles across them, so this comment and the tests are what keep
 * them in step — a reader who sees `PUMP` on the site and `PUMPFUN` in an alert
 * has to work out whether those are the same asset.
 *
 * The rule is a short allow-list, not a heuristic, and the catalogue is why: of
 * 148 listed bases, stripping a plausible-looking suffix breaks more than it
 * fixes.
 *
 *   COIN  →  FARTCOIN becomes FART, FILECOIN becomes FILE
 *   AI    →  SKYAI becomes SKY
 *   X     →  AVAX becomes AVA, TRX becomes TR
 *
 * Each is a real listing whose name simply ends that way. So only tails that
 * are never part of a ticker are listed, and each is guarded by the length of
 * what would remain — `FUN` is itself a token.
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
 * Never invents: anything unrecognised comes back as it arrived. Tolerates a
 * missing name rather than throwing, because this runs inside message
 * formatting — an exception here would cost the whole alert, not one word.
 */
export function displayTicker(base: string | null | undefined): string {
  if (typeof base !== 'string') return '';
  const upper = base.trim().toUpperCase();
  if (!upper) return '';

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
