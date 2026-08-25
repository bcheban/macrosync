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

  const strategies: StrategyPrefs = flat
    ? {
        scalping: stored?.scalping ?? true,
        day: stored?.day ?? true,
        swing: stored?.swing ?? true,
      }
    : {
        scalping: stored?.strategies?.scalping ?? true,
        day: stored?.strategies?.day ?? true,
        swing: stored?.strategies?.swing ?? true,
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
  };
}

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
  const next: Prefs = { ...current, strategies: { ...current.strategies, [strategy]: !current.strategies[strategy] } };

  await setPrefs(chatId, next);
  return next;
}

export async function toggleChannel(chatId: string, channel: Channel): Promise<Prefs> {
  const current = await getPrefs(chatId);
  const next: Prefs = { ...current, channels: { ...current.channels, [channel]: !current.channels[channel] } };

  await setPrefs(chatId, next);
  return next;
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
