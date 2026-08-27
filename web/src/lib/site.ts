import { BRAND } from './brand';
import type { Locale } from '@/types/domain';

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Canonical site identity used by the SEO layer.
 *
 * `VITE_SITE_URL` must be the absolute origin the app is deployed to — social
 * crawlers and `sitemap.xml` both need absolute URLs. The same value is read by
 * the build-time SEO plugin so the static HTML, the sitemap and the runtime
 * meta tags can never disagree.
 */
export const SITE = {
  url: stripTrailingSlash(import.meta.env.VITE_SITE_URL ?? `https://${BRAND.domain}`),
  ogImage: '/og-image.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterHandle: '@ayanox',
} as const;

/** The query parameter that makes each language a distinct, indexable URL. */
export const LANG_PARAM = 'lang';

/**
 * The asset a deep link points at, e.g. `?symbol=BTCUSDT`.
 *
 * Deliberately absent from `localeUrl`, which is what feeds the canonical tag
 * and the hreflang alternates. A link from an alert is a way in for one
 * reader, not another page: every symbol would otherwise be a separate
 * indexable URL serving identical markup.
 */
export const SYMBOL_PARAM = 'symbol';

/**
 * The indexable URL for one locale.
 *
 * English is the canonical bare URL; other locales hang off `?lang=`. Keeping
 * one page per locale is what makes `hreflang` meaningful for a client-rendered
 * app that has no server-side routing.
 */
export function localeUrl(locale: Locale, origin: string = SITE.url): string {
  return locale === 'en' ? `${origin}/` : `${origin}/?${LANG_PARAM}=${locale}`;
}

export const absoluteUrl = (path: string, origin: string = SITE.url): string =>
  `${origin}${path.startsWith('/') ? path : `/${path}`}`;
