import type { Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * What each subscriber wants to hear about.
 *
 * The roster answered *who* gets a message; this answers *which*. A scalper and
 * a swing trader were both receiving all three strategies, so most of what
 * arrived was noise to one of them — and the only remedy on offer was muting
 * everything for two hours.
 *
 * Preferences are stored per chat and default to all three on. A new subscriber
 * who has never opened `/settings` has no record at all, and reading that as
 * "wants nothing" would silence them permanently; the default has to be the
 * permissive one.
 */

export const STRATEGIES: Strategy[] = ['scalping', 'day', 'swing'];

export type StrategyPrefs = Record<Strategy, boolean>;

const ALL_ON: StrategyPrefs = { scalping: true, day: true, swing: true };

const PREFS_KEY = (chatId: string): string => storeKey(`telegram:prefs:${chatId}`);

/** Guards against a stored record from an older shape or a hand-edited key. */
const normalise = (stored: Partial<StrategyPrefs> | null): StrategyPrefs => ({
  scalping: stored?.scalping ?? true,
  day: stored?.day ?? true,
  swing: stored?.swing ?? true,
});

export async function getPrefs(chatId: string): Promise<StrategyPrefs> {
  return normalise(await getJson<Partial<StrategyPrefs> | null>(PREFS_KEY(chatId), null));
}

/**
 * Flips one strategy and returns the whole set.
 *
 * Turning the last one off is allowed. It is a coherent thing to want — quiet
 * until further notice, without unsubscribing — and refusing it would be the
 * bot overriding somebody's explicit choice about their own notifications.
 * `/settings` says so, so it is not a silent state.
 */
export async function togglePref(chatId: string, strategy: Strategy): Promise<StrategyPrefs> {
  const current = await getPrefs(chatId);
  const next: StrategyPrefs = { ...current, [strategy]: !current[strategy] };

  await setJson(PREFS_KEY(chatId), next);
  return next;
}

export async function setPrefs(chatId: string, prefs: StrategyPrefs): Promise<void> {
  await setJson(PREFS_KEY(chatId), prefs);
}

export const wantsAll = (prefs: StrategyPrefs): boolean => STRATEGIES.every((key) => prefs[key]);
export const wantsNothing = (prefs: StrategyPrefs): boolean => STRATEGIES.every((key) => !prefs[key]);

/** Reads the default without a store round trip, for callers that need it. */
export const defaultPrefs = (): StrategyPrefs => ({ ...ALL_ON });
