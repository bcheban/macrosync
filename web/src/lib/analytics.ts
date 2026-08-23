/**
 * GA4 integration.
 *
 * Three deliberate choices keep it off the critical rendering path:
 *  - the tag is injected from JS *after* the app has painted, on an idle
 *    callback, rather than sitting in `<head>` blocking discovery of the app
 *    bundle;
 *  - the script is `async`, so it never blocks parsing even once injected;
 *  - events fired before the tag lands are queued by `dataLayer` (gtag's own
 *    queue), so nothing is lost during that window.
 *
 * Analytics is inert unless `VITE_GA_MEASUREMENT_ID` is set, and it opts out
 * entirely when the browser asks not to be tracked.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';

type GtagArgs =
  | ['js', Date]
  | ['config', string, Record<string, unknown>?]
  | ['event', string, Record<string, unknown>?]
  | ['set', Record<string, unknown>];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

const doNotTrack = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const legacy = (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;
  const signal = navigator.doNotTrack ?? legacy ?? (window as { doNotTrack?: string }).doNotTrack;
  return signal === '1' || signal === 'yes';
};

export const analyticsEnabled = (): boolean => Boolean(MEASUREMENT_ID) && !doNotTrack();

let started = false;

/** Runs `task` when the browser is idle, with a timeout so it always runs. */
const whenIdle = (task: () => void): void => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 4000 });
  } else {
    window.setTimeout(task, 1200);
  }
};

/**
 * Injects the GA4 tag once, after first paint. Safe to call repeatedly.
 * `send_page_view` is disabled so page views are emitted explicitly — the app
 * is a single view whose "page" is really its language.
 */
export function initAnalytics(): void {
  if (started || !analyticsEnabled()) return;
  started = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: GtagArgs) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false, anonymize_ip: true });

  whenIdle(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  });
}

/** A page view for the current URL — re-sent when the language changes. */
export function trackPageView(locale: string, title: string): void {
  if (!analyticsEnabled()) return;
  window.gtag?.('event', 'page_view', {
    page_title: title,
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}`,
    language: locale,
  });
}

/** Product events: strategy switches, asset scope changes, language switches. */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!analyticsEnabled()) return;
  window.gtag?.('event', name, params);
}
