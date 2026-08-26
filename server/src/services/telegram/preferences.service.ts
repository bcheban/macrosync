import type { Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';

/**
 * What each subscriber wants to hear about, and in which language.
 *
 * The roster answered *who* gets a message; this answers *which*, *when* and
 * *how it reads*. A scalper and a swing trader were both receiving all three
 * strategies, so most of what arrived was noise to one of them — and the only
 * remedy on offer was muting everything for two hours.
 *
 * Everything one subscriber chose lives in a single record. The broadcast loop
 * reads it once per recipient per message, so splitting language, strategies and
 * channels across three keys would triple that for no benefit.
 */

export const STRATEGIES: Strategy[] = ['scalping', 'day', 'swing'];

/**
 * The three kinds of message, which are three different promises.
 *
 * `signals` opens a position, `results` closes it, `updates` changes it while it
 * runs. They are separable because people genuinely want different subsets — a
 * reader who trades their own book may want only the entries — but see the
 * warning in `/settings`: switching results off while signals is on means being
 * told to enter and never told to leave.
 */
export const CHANNELS = ['signals', 'updates', 'results'] as const;
export type Channel = (typeof CHANNELS)[number];

export const LOCALES = ['en', 'uk', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export type StrategyPrefs = Record<Strategy, boolean>;
export type ChannelPrefs = Record<Channel, boolean>;

export interface Prefs {
  strategies: StrategyPrefs;
  channels: ChannelPrefs;
  locale: Locale;
  /** False until the subscriber has actually been asked, so `/start` asks once. */
  localeChosen: boolean;
  /**
   * Whether this record was written by somebody making a choice.
   *
   * The flag that keeps opt-in defaults from silencing anyone. New subscribers
   * start with every strategy off and pick what they want; a record that
   * predates this field was written when the default was all-on, and reading
   * *its* absence as "wants nothing" would silently unsubscribe people who
   * have been receiving calls for weeks.
   *
   * So absence means "grandfathered, all on" — the opposite of what it means
   * for a subscriber created after this change.
   */
  configured: boolean;
}

const PREFS_KEY = (chatId: string): string => storeKey(`telegram:prefs:${chatId}`);

/** The old flat shape, still in the store for anyone who set preferences before. */
type StoredPrefs = Partial<Prefs> & Partial<StrategyPrefs>;

/**
 * Reads a stored record of any vintage.
 *
 * Two shapes exist in production: the original flat `{scalping, day, swing}` and
 * the nested one. A subscriber who turned swing off months ago must not have it
 * turned back on by a deployment — silently restoring a preference somebody set
 * is worse than never having offered the setting.
 *
 * Every default is the permissive one. Absence means "has not chosen", and
 * reading that as "wants nothing" would silence a subscriber permanently.
 */
function normalise(stored: StoredPrefs | null): Prefs {
  const flat = stored?.scalping !== undefined || stored?.day !== undefined || stored?.swing !== undefined;

  /*
   * Everything except an explicit opt-in record is grandfathered to all-on.
   *
   * That includes *no record at all*, which is what most subscribers look like:
   * they joined before `/settings` existed and have never opened it. Reading
   * their absence as "wants nothing" would silently unsubscribe people who have
   * been receiving calls for weeks — which a test caught, on the two production
   * subscribers who have no preferences row.
   *
   * Opt-in is therefore something the new onboarding *writes*, not something
   * absence implies.
   */
  const fallback = stored?.configured !== false;

  const strategies: StrategyPrefs = flat
    ? {
        scalping: stored?.scalping ?? fallback,
        day: stored?.day ?? fallback,
        swing: stored?.swing ?? fallback,
      }
    : {
        scalping: stored?.strategies?.scalping ?? fallback,
        day: stored?.strategies?.day ?? fallback,
        swing: stored?.strategies?.swing ?? fallback,
      };

  const locale = stored?.locale;

  return {
    strategies,
    channels: {
      signals: stored?.channels?.signals ?? true,
      updates: stored?.channels?.updates ?? true,
      results: stored?.channels?.results ?? true,
    },
    locale: locale && (LOCALES as readonly string[]).includes(locale) ? locale : 'en',
    localeChosen: stored?.localeChosen ?? false,
    configured: stored?.configured ?? stored !== null,
  };
}

/** True when a subscriber has been onboarded but has not picked a strategy. */
export const awaitingChoice = (prefs: Prefs): boolean =>
  prefs.localeChosen && !prefs.configured && STRATEGIES.every((key) => !prefs.strategies[key]);

export async function getPrefs(chatId: string): Promise<Prefs> {
  return normalise(await getJson<StoredPrefs | null>(PREFS_KEY(chatId), null));
}

export async function setPrefs(chatId: string, prefs: Prefs): Promise<void> {
  await setJson(PREFS_KEY(chatId), prefs);
}

/**
 * Flips one strategy and returns the whole record.
 *
 * Turning the last one off is allowed. It is a coherent thing to want — quiet
 * until further notice, without unsubscribing — and refusing it would be the bot
 * overriding somebody's explicit choice about their own notifications.
 */
export async function toggleStrategy(chatId: string, strategy: Strategy): Promise<Prefs> {
  const current = await getPrefs(chatId);
  // The first tap is the choice that makes this record a configured one.
  const next: Prefs = {
    ...current,
    configured: true,
    strategies: { ...current.strategies, [strategy]: !current.strategies[strategy] },
  };

  await setPrefs(chatId, next);
  return next;
}

export async function toggleChannel(chatId: string, channel: Channel): Promise<Prefs> {
  const current = await getPrefs(chatId);
  const next: Prefs = { ...current, channels: { ...current.channels, [channel]: !current.channels[channel] } };

  await setPrefs(chatId, next);
  return next;
}

/**
 * Writes the empty record a brand-new subscriber starts from.
 *
 * Only ever called for a chat joining the roster for the first time. Everyone
 * already on it keeps what they had, because the alternative is a deployment
 * that quietly stops talking to existing readers.
 */
export async function initialiseOptIn(chatId: string): Promise<void> {
  const existing = await getJson<StoredPrefs | null>(PREFS_KEY(chatId), null);
  if (existing) return;

  await setJson(PREFS_KEY(chatId), {
    strategies: { scalping: false, day: false, swing: false },
    channels: { signals: true, updates: true, results: true },
    locale: 'en',
    localeChosen: false,
    configured: false,
  } satisfies Prefs);
}

export async function setLocale(chatId: string, locale: Locale): Promise<Prefs> {
  const current = await getPrefs(chatId);
  const next: Prefs = { ...current, locale, localeChosen: true };

  await setPrefs(chatId, next);
  return next;
}

export const wantsNothing = (prefs: Prefs): boolean =>
  STRATEGIES.every((key) => !prefs.strategies[key]) || CHANNELS.every((key) => !prefs.channels[key]);

/**
 * The state worth warning about: told to enter, never told to leave.
 *
 * Allowed, because it is the subscriber's call and they may be closing positions
 * on their own terms. Said out loud in the panel, because nobody chooses it on
 * purpose by tapping one button.
 */
export const strandedByFilters = (prefs: Prefs): boolean => prefs.channels.signals && !prefs.channels.results;

export const defaultPrefs = (): Prefs => normalise(null);
