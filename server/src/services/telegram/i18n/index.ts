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

/** The four hub buttons, in the reader's language. */
export const hubKeyboard = (locale: Locale): string[][] => {
  const t = dict(locale);
  return [
    [t.hubDeepStats, t.hubSettings],
    [t.hubCalculator, t.hubGuide],
  ];
};

/**
 * Maps a hub button press back to the command it stands for.
 *
 * Checked against *every* language, not just the reader's. Telegram keeps a
 * reply keyboard on screen until it is replaced, so somebody who switches to
 * German is still looking at the Ukrainian buttons until the next message
 * carrying a keyboard arrives — and a press that did nothing would read as a
 * broken bot rather than as stale markup.
 */
export function hubCommand(text: string): string | undefined {
  const trimmed = text.trim();

  for (const locale of Object.keys(DICTIONARIES) as Locale[]) {
    const t = DICTIONARIES[locale];
    if (trimmed === t.hubDeepStats) return '/stats_deep';
    if (trimmed === t.hubSettings) return '/settings';
    if (trimmed === t.hubCalculator) return '/calc';
    if (trimmed === t.hubGuide) return '/guide';
  }

  return undefined;
}

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
  if (tag === 'de') return 'de';
  /*
   * `ru` opens in Ukrainian, not English.
   *
   * A judgement about this audience rather than about the languages: the tape
   * is Ukrainian futures traders, and a phone set to Russian in that group is
   * far more likely to read Ukrainian comfortably than English. It only decides
   * the language the *question* is asked in — the picker is the next message,
   * and one tap overrides it.
   */
  if (tag === 'uk' || tag === 'ru' || tag === 'be') return 'uk';
  return 'en';
}

export type { Dictionary };
