import type { Locale } from '../preferences.service.js';
import { de } from './de.js';
import { en, type Dictionary } from './en.js';
import { uk } from './uk.js';

/**
 * The bot speaks whichever language its reader chose.
 *
 * `Dictionary` is derived from the English file, so a key added there fails to
 * compile in the other two until they carry it. That is the whole safety net:
 * without it a missing translation surfaces as `undefined` in somebody's chat,
 * which reads as a broken bot rather than as a missing string.
 */
const DICTIONARIES: Record<Locale, Dictionary> = { en, uk, de };

/** What each language calls itself. Never translated — that is the point. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: '🇬🇧 English',
  uk: '🇺🇦 Українська',
  de: '🇩🇪 Deutsch',
};

export const dict = (locale: Locale): Dictionary => DICTIONARIES[locale] ?? en;

/**
 * Guesses a starting language from Telegram's `language_code`.
 *
 * A first draft only — the subscriber is asked outright on `/start` and their
 * answer overrides it. But opening in English for a Ukrainian phone and leaving
 * them to find the setting is a worse first impression than guessing and being
 * corrected in one tap.
 */
export function guessLocale(languageCode?: string): Locale {
  const tag = (languageCode ?? '').slice(0, 2).toLowerCase();
  return tag === 'uk' || tag === 'de' ? tag : 'en';
}

export type { Dictionary };
