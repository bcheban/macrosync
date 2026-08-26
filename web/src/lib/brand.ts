/**
 * Single source of truth for the product identity.
 *
 * The name is deliberately not translated: it is a proper noun and should read
 * identically in every locale. Everything *about* the brand — the tagline, the
 * one-line pitch — lives in the locale files under `brand.*`.
 */
export const BRAND = {
  /** Full wordmark. */
  name: 'Ayanox',
  /** Split for the two-tone logotype: `Aya` + accented `nox`. */
  nameParts: ['Aya', 'nox'] as const,
  /** Used in the document title and anywhere a compact form is needed. */
  short: 'Ayanox',
  /*
   * Still the old origin, deliberately. This value is the canonical URL, the
   * `hreflang` alternates and every absolute link in `sitemap.xml`; pointing it
   * at a host that does not resolve yet would deindex a live site far faster
   * than the rename could ever pay back. Flip it in the same change that moves
   * DNS, not before.
   */
  domain: 'macrosync.io',
} as const;
