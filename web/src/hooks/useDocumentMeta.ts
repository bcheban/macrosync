import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { INTL_LOCALE, LOCALES } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { LANG_PARAM, SITE, absoluteUrl, localeUrl } from '@/lib/site';
import type { Locale } from '@/types/domain';

/** Upserts a `<meta>` tag, keyed by `name` or `property`. */
function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

/** Upserts a `<link>` tag, keyed by rel (+ hreflang when present). */
function setLink(rel: string, href: string, hreflang?: string): void {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let tag = document.head.querySelector<HTMLLinkElement>(selector);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    if (hreflang) tag.hreflang = hreflang;
    document.head.appendChild(tag);
  }
  tag.href = href;
}

/**
 * Keeps `?lang=` in the address bar in step with the active language.
 *
 * This is what makes the two locales separately linkable and indexable: the
 * `hreflang` alternates below point at real URLs a crawler can fetch, and the
 * language detector reads the same parameter back on load.
 */
function syncLocaleUrl(locale: Locale): void {
  const url = new URL(window.location.href);
  const current = url.searchParams.get(LANG_PARAM);

  if (locale === 'en') {
    if (current === null) return;
    url.searchParams.delete(LANG_PARAM);
  } else {
    if (current === locale) return;
    url.searchParams.set(LANG_PARAM, locale);
  }

  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Structured data so search results can render a rich card for the app. */
function setStructuredData(name: string, description: string, locale: Locale): void {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url: localeUrl(locale),
    description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    inLanguage: LOCALES,
    image: absoluteUrl(SITE.ogImage),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  let script = document.head.querySelector<HTMLScriptElement>('script[data-seo="structured-data"]');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seo = 'structured-data';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
}

/**
 * Single owner of everything in `<head>` that depends on the active language:
 * title, description, Open Graph / Twitter cards, canonical, `hreflang`
 * alternates and JSON-LD. Runs on mount and on every language change.
 */
export function useDocumentMeta(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';

  useEffect(() => {
    const locale = (LOCALES as string[]).includes(language) ? (language as Locale) : 'en';
    const title = `${BRAND.name} · ${t('brand.tagline')}`;
    const description = t('brand.pitch');
    const canonical = localeUrl(locale);
    const image = absoluteUrl(SITE.ogImage);

    document.title = title;
    document.documentElement.lang = locale;

    setMeta('name', 'description', description);
    setMeta('name', 'application-name', BRAND.name);

    setMeta('property', 'og:site_name', BRAND.name);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:image:width', String(SITE.ogImageWidth));
    setMeta('property', 'og:image:height', String(SITE.ogImageHeight));
    setMeta('property', 'og:image:alt', title);
    // Derived, not a binary choice — a third locale used to fall through to en_US.
    setMeta('property', 'og:locale', INTL_LOCALE[locale].replace('-', '_'));

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:site', SITE.twitterHandle);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);

    setLink('canonical', canonical);
    for (const alternate of LOCALES) setLink('alternate', localeUrl(alternate), alternate);
    setLink('alternate', localeUrl('en'), 'x-default');

    setStructuredData(BRAND.name, description, locale);
    syncLocaleUrl(locale);
  }, [t, language]);
}
