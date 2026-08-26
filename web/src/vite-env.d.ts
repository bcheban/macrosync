/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the API base. Defaults to `/api` (proxied to the Express server in dev). */
  readonly VITE_API_BASE?: string;
  /** Absolute origin the site is served from — used for canonical URLs, OG tags and the sitemap. */
  readonly VITE_SITE_URL?: string;
  /** GA4 measurement id, e.g. `G-XXXXXXXXXX`. Analytics stays off when unset. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Public link to the alert bot, e.g. `https://t.me/AyanoxTradeBot`. The CTA
   *  renders only when this is set. */
  readonly VITE_TELEGRAM_BOT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
