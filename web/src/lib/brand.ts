/**
 * Single source of truth for the product identity.
 *
 * The name is deliberately not translated: it is a proper noun and should read
 * identically in every locale. Everything *about* the brand — the tagline, the
 * one-line pitch — lives in the locale files under `brand.*`.
 */
export const BRAND = {
  /** Full wordmark. */
  name: 'MacroSync',
  /** Split for the two-tone logotype: `Macro` + accented `Sync`. */
  nameParts: ['Macro', 'Sync'] as const,
  /** Used in the document title and anywhere a compact form is needed. */
  short: 'MacroSync',
  domain: 'macrosync.io',
} as const;
