import type { Strategy } from '@/types/domain';

const BOT_URL = import.meta.env.VITE_TELEGRAM_BOT_URL ?? '';

/**
 * A link that asks the bot to watch one setup.
 *
 * `?start=<payload>` is the only argument Telegram lets a link carry, and it is
 * what removes the need for accounts here entirely: pressing this opens the
 * bot, and the bot already knows who is pressing it. The site never learns who
 * anybody is, which is the right amount for a site that only publishes.
 *
 * Payload alphabet is `A-Z a-z 0-9 _ -`, 64 characters — so an underscore
 * separator and an upper-cased symbol, matching `parseTrackPayload` on the
 * server. Built through `URL` because the bot link may already carry a query.
 *
 * `undefined` when no bot is configured, so the button can be left off the card
 * rather than rendered pointing nowhere.
 */
export function trackUrl(symbol: string, strategy: Strategy): string | undefined {
  if (!BOT_URL) return undefined;

  try {
    const url = new URL(BOT_URL);
    url.searchParams.set('start', `track_${symbol.toUpperCase()}_${strategy}`);
    return url.toString();
  } catch {
    // A malformed VITE_TELEGRAM_BOT_URL costs the button, not the card.
    return undefined;
  }
}
