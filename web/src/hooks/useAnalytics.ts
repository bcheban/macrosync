import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { initAnalytics, trackPageView } from '@/lib/analytics';
import { BRAND } from '@/lib/brand';

/**
 * Boots GA4 after the first render and reports a page view per language.
 *
 * The two locales are distinct URLs (`/` and `/?lang=uk`), so treating a
 * language switch as a page view is accurate rather than inflationary.
 */
export function useAnalytics(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    // Lets the meta hook rewrite `?lang=` first, so `page_location` is correct.
    const timer = window.setTimeout(() => trackPageView(language, `${BRAND.name} · ${t('brand.tagline')}`), 0);
    return () => window.clearTimeout(timer);
  }, [language, t]);
}
