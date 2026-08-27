/**
 * The asset a link asked for, read once and held.
 *
 * Read at module evaluation rather than from a component, because two other
 * things rewrite `window.location.search` during startup: the SEO hook
 * normalises `?lang=`, and this module strips itself out once the asset has
 * been applied. A component reading the URL later would race both and find the
 * parameter already gone — so the value is captured before any of that runs,
 * and the URL is only the transport.
 *
 * Deliberately not state. It is a one-shot instruction that arrives with the
 * page: applying it twice would fight a reader who has since changed their
 * selection, and re-reading it on a re-render would do exactly that.
 */
import { SYMBOL_PARAM } from './site';

/** `BTCUSDT`. Upper-cased and bounded, because it reaches an API path. */
const SHAPE = /^[A-Z0-9]{2,20}$/;

const read = (): string | undefined => {
  try {
    const raw = new URLSearchParams(window.location.search).get(SYMBOL_PARAM);
    if (!raw) return undefined;
    const symbol = raw.trim().toUpperCase();
    return SHAPE.test(symbol) ? symbol : undefined;
  } catch {
    return undefined;
  }
};

/**
 * What the link asked for, or `undefined`.
 *
 * Still set after {@link consumeDeepLink} — that clears the URL, not the
 * intent, so a panel that mounts later can still act on it.
 */
export const deepLinkSymbol = read();

let consumed = false;

/**
 * Takes the instruction, once.
 *
 * Returns the symbol the first time and `undefined` after, so two panels
 * racing to act on the same link cannot both open something. The parameter is
 * dropped from the address bar at the same time: it has been acted on, and
 * leaving it there would make a reload undo whatever the reader did next.
 */
export function consumeDeepLink(): string | undefined {
  if (consumed || !deepLinkSymbol) return undefined;
  consumed = true;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(SYMBOL_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* A browser refusing history writes still gets the asset. */
  }

  return deepLinkSymbol;
}
