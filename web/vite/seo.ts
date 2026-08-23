import type { Plugin } from 'vite';

export interface SeoOptions {
  /** Absolute origin, no trailing slash. */
  siteUrl: string;
  locales: string[];
  defaultLocale: string;
  /** Query parameter that selects a locale — must match `LANG_PARAM` in the app. */
  langParam?: string;
  /** GA4 measurement id; only used to warm up the DNS lookup. */
  gaId?: string;
  ogImage?: string;
}

const stripSlash = (value: string): string => value.replace(/\/+$/, '');

/** `/` for the default locale, `/?lang=xx` for the rest. */
const localeUrl = (siteUrl: string, locale: string, defaultLocale: string, param: string): string =>
  locale === defaultLocale ? `${siteUrl}/` : `${siteUrl}/?${param}=${locale}`;

function buildRobots(siteUrl: string): string {
  return `# ${siteUrl}
User-agent: *
Allow: /

# The JSON API carries no indexable content.
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
}

/**
 * One `<url>` per locale, each declaring every locale as an alternate. That is
 * the shape Google expects for a site whose languages differ only by a query
 * parameter.
 */
function buildSitemap(options: Required<Pick<SeoOptions, 'siteUrl' | 'locales' | 'defaultLocale' | 'langParam'>>): string {
  const { siteUrl, locales, defaultLocale, langParam } = options;
  const lastmod = new Date().toISOString().slice(0, 10);

  const alternates = [
    ...locales.map(
      (locale) =>
        `    <xhtml:link rel="alternate" hreflang="${locale}" href="${localeUrl(siteUrl, locale, defaultLocale, langParam)}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${localeUrl(siteUrl, defaultLocale, defaultLocale, langParam)}" />`,
  ].join('\n');

  const entries = locales
    .map(
      (locale) => `  <url>
    <loc>${localeUrl(siteUrl, locale, defaultLocale, langParam)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>${locale === defaultLocale ? '1.0' : '0.9'}</priority>
${alternates}
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

/**
 * Generates the crawler-facing files and resolves the absolute-URL tokens in
 * `index.html`.
 *
 * The app is client-rendered, so the head tags it ships statically are what a
 * crawler (or a social scraper, which does not run JS at all) sees first.
 * `useDocumentMeta` then keeps them in step with the active language at
 * runtime — both read the same site config, so they cannot disagree.
 */
export function seo(options: SeoOptions): Plugin {
  const siteUrl = stripSlash(options.siteUrl);
  const langParam = options.langParam ?? 'lang';
  const ogImage = options.ogImage ?? '/og-image.png';
  const { locales, defaultLocale, gaId } = options;

  const robots = buildRobots(siteUrl);
  const sitemap = buildSitemap({ siteUrl, locales, defaultLocale, langParam });

  const alternateLinks = [
    ...locales.map(
      (locale) =>
        `    <link rel="alternate" hreflang="${locale}" href="${localeUrl(siteUrl, locale, defaultLocale, langParam)}" />`,
    ),
    `    <link rel="alternate" hreflang="x-default" href="${localeUrl(siteUrl, defaultLocale, defaultLocale, langParam)}" />`,
    `    <link rel="canonical" href="${localeUrl(siteUrl, defaultLocale, defaultLocale, langParam)}" />`,
    // The tag itself is injected on idle; this only warms the DNS lookup.
    gaId ? '    <link rel="dns-prefetch" href="https://www.googletagmanager.com" />' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    name: 'macrosync:seo',

    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replaceAll('%SITE_URL%', siteUrl)
          .replaceAll('%OG_IMAGE%', `${siteUrl}${ogImage}`)
          .replace('<!--%SEO_LINKS%-->', alternateLinks.trim()),
    },

    /** Serves the generated files in dev too, so they can be verified locally. */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const send = (body: string, type: string) => {
          res.setHeader('content-type', type);
          res.end(body);
        };
        if (req.url === '/robots.txt') return send(robots, 'text/plain; charset=utf-8');
        if (req.url === '/sitemap.xml') return send(sitemap, 'application/xml; charset=utf-8');
        return next();
      });
    },

    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
    },
  };
}
