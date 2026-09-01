import { env } from '../../config/env.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * How often the engine is allowed to speak about the same asset, and about
 * anything at all.
 *
 * `MAX_OPEN_TRADES` stopped the book growing without limit, and in doing so
 * turned into a blind wall: the engine filled sixty-two slots in a day, hit the
 * cap, and then ignored everything for the rest of it — including setups better
 * than the ones already holding the slots. A cap answers "how much risk is
 * open" and cannot answer "is this worth a slot", so it was answering the wrong
 * question loudly.
 *
 * Two limits, doing different jobs:
 *
 *   - **Per asset.** One call per ticker per window, across every strategy. The
 *     same chart confirming on the 5m, the 1h and the 4h within an hour is one
 *     idea, and publishing it three times is three slots spent on one opinion.
 *
 *   - **Global velocity.** A ceiling on accepted calls per rolling hour. When
 *     the whole market moves together, every asset confirms together, and the
 *     book fills with sixty correlated positions that a single reversal closes
 *     at once. That is the burst the cap was really there to stop.
 *
 * Both live in one document rather than one key per asset. A scan touches 150
 * tickers, and 150 round trips over a REST store to answer "may I speak" would
 * cost more than the scan.
 */

export interface CooldownState {
  /** Base ticker to the ISO time a call for it was last accepted. */
  assets: Record<string, string>;
  /** Accepted times, newest last, for the rolling velocity window. */
  accepted: string[];
}

const KEY = storeKey('trades:cooldown');
const EMPTY: CooldownState = { assets: {}, accepted: [] };

/** The rolling window the velocity limit counts over. */
const VELOCITY_WINDOW_MS = 60 * 60 * 1000;

export type Rejection = 'cooldown' | 'velocity';

export const loadCooldown = (): Promise<CooldownState> => getJson<CooldownState>(KEY, EMPTY);

/**
 * Why this call may not be published, or `null` if it may.
 *
 * Pure, so the emitter can decide for a whole batch from one read rather than
 * asking the store per candidate. The asset check runs first: it is the
 * specific reason, and reporting "too many signals" for an asset that simply
 * spoke an hour ago would send somebody looking at the wrong setting.
 */
export function cooldownFor(
  state: CooldownState,
  base: string,
  now = Date.now(),
): Rejection | null {
  const last = state.assets[base.toUpperCase()];
  if (last && now - Date.parse(last) < env.assetCooldownMs) return 'cooldown';

  const recent = state.accepted.filter((at) => now - Date.parse(at) < VELOCITY_WINDOW_MS);
  if (recent.length >= env.signalsPerHour) return 'velocity';

  return null;
}

/**
 * Records an accepted call, and forgets what has aged out.
 *
 * Pruned on write rather than on read: the document is read on every scan and
 * written only when something is published, so the cheap moment to tidy it is
 * the rare one. Without it the map would keep an entry for every asset the
 * engine has ever traded, and the velocity list would grow without bound.
 */
export function noteAccepted(
  state: CooldownState,
  base: string,
  now = Date.now(),
): CooldownState {
  const at = new Date(now).toISOString();

  const assets: Record<string, string> = { [base.toUpperCase()]: at };
  for (const [asset, seen] of Object.entries(state.assets)) {
    if (now - Date.parse(seen) < env.assetCooldownMs) assets[asset] ??= seen;
  }

  return {
    assets,
    accepted: [
      ...state.accepted.filter((seen) => now - Date.parse(seen) < VELOCITY_WINDOW_MS),
      at,
    ],
  };
}

export const saveCooldown = (state: CooldownState): Promise<void> => setJson(KEY, state);

/**
 * The read-check-write path, for callers that handle one signal at a time.
 *
 * The webhook is the only one. It arrives as a single request and has no batch
 * to amortise a read across, so it pays for its own — where the scan reads once
 * and decides for everything it found.
 *
 * Claiming and checking are one call because they are one decision. Two
 * requests arriving together would otherwise both read an empty cooldown and
 * both publish, which is the burst this exists to prevent.
 */
export async function claimSlot(base: string): Promise<Rejection | null> {
  const state = await loadCooldown();
  const rejection = cooldownFor(state, base);
  if (rejection) return rejection;

  await saveCooldown(noteAccepted(state, base));
  return null;
}
