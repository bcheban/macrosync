import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/types/domain';
import { de } from './locales/de';
import { en } from './locales/en';
import { uk } from './locales/uk';

export const LOCALES: Locale[] = ['en', 'uk', 'de'];

/** BCP-47 tags for `Intl` — i18next itself works with the short codes. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  uk: 'uk-UA',
  de: 'de-DE',
};

export const STORAGE_KEY = 'ayanox.lang';

export const resources = {
  en: { translation: en },
  uk: { translation: uk },
  de: { translation: de },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: LOCALES,
    // 'uk-UA' from the browser should resolve to our 'uk' bundle.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      // `?lang=` wins, so the hreflang alternates in the sitemap resolve to the
      // language they advertise even for a first-time visitor with a cached
      // preference — that is what makes each locale separately indexable.
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    // React escapes for us; letting i18next escape too would double-encode.
    interpolation: { escapeValue: false },
    returnNull: false,
  });

/** Keeps `<html lang>` in step with the active language for a11y and the UA. */
const syncDocumentLang = (language: string): void => {
  document.documentElement.lang = language.split('-')[0] ?? 'en';
};

syncDocumentLang(i18n.language ?? 'en');
i18n.on('languageChanged', syncDocumentLang);

export const currentLocale = (): Locale => {
  const short = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0] as Locale;
  return LOCALES.includes(short) ? short : 'en';
};

export const currentIntlLocale = (): string => INTL_LOCALE[currentLocale()];

export default i18n;
