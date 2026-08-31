import { deleteKeys, getJson, setJson, storeKey } from '../store/store.js';
import { editMessageText } from './telegram.client.js';
import { dict } from './i18n/index.js';
import type { Locale } from './preferences.service.js';
import { anyTargetHit, remainingShare, type Fill, type Target } from '../trades/targets.js';
import type { ActiveTrade, ClosedTrade } from '../trades/trades.service.js';

/**
 * The published card for one call, kept so it can be updated in place.
 *
 * A target reached is news about a message the reader already has, not a new
 * message. Sending one costs the channel its signal-to-noise on exactly the
 * days it is working hardest: three targets across a dozen open calls is
 * thirty-odd notifications for events the original card could simply have
 * absorbed. So the card is edited, and the reader watches one message change
 * rather than scrolling to reconstruct what happened.
 *
 * Stored per trade rather than on the trade, deliberately. The rendered HTML is
 * the bulk of it — a few kilobytes per recipient — and `trades:active` is read
 * and rewritten on every scan. Keeping the text out of that document leaves the
 * hot path the size it was, and these keys are read only when something
 * actually happened.
 */

/** One delivered message, and what it said. */
export interface Card {
  chatId: string;
  messageId: number;
  /** The card as it was sent, without any status block. Edits rebuild from it. */
  html: string;
  /** So an update speaks the language the original did. */
  locale: Locale;
}

const cardsKey = (tradeId: string): string => storeKey(`trades:cards:${tradeId}`);

/** Remembers where a call was announced. A trade with no cards simply has none. */
export async function rememberCards(tradeId: string, cards: Card[]): Promise<void> {
  if (!cards.length) return;
  await setJson(cardsKey(tradeId), cards);
}

/** Drops the cards for a trade. Called once its last update has been sent. */
export async function forgetCards(tradeId: string): Promise<void> {
  await deleteKeys([cardsKey(tradeId)]);
}

/**
 * The progress block appended under a card.
 *
 * Every rung is listed, hit or not, because the shape of the ladder is the
 * information: "TP1 hit" alone does not say whether two more are pending or
 * the trade is nearly done. Prices are repeated so the block reads on its own
 * for somebody who scrolled back to it days later.
 */
function progressBlock(
  targets: readonly Target[],
  fills: readonly Fill[],
  locale: Locale,
  closed?: ClosedTrade,
): string {
  const t = dict(locale);
  const hit = new Map(fills.filter((fill) => fill.reason === 'target').map((fill) => [fill.level, fill]));

  const rungs = targets.map((target) => {
    const fill = hit.get(target.level);
    const share = Math.round(target.share * 100);
    return fill
      ? t.cardTpHit(target.level, String(target.price), share)
      : t.cardTpPending(target.level, String(target.price), share);
  });

  const lines = [...rungs];

  // Stated once a rung has filled, because that is when it becomes true.
  if (anyTargetHit(fills)) lines.push(t.cardStopAtEntry);

  if (closed) {
    const pct = `${closed.resultPct >= 0 ? '+' : ''}${closed.resultPct}%`;
    lines.push('', anyTargetHit(closed.fills ?? []) ? t.cardClosedWon(pct) : t.cardClosedLost(pct));
  } else {
    const open = Math.round(remainingShare(fills) * 100);
    if (open > 0 && open < 100) lines.push(t.cardRunning(open));
  }

  return lines.join('\n');
}

/**
 * Rewrites every card for a trade to match where it now stands.
 *
 * Rebuilt from the stored original each time rather than appended to, so an
 * update is idempotent: running it twice leaves one status block, not two.
 *
 * Never throws and never blocks the caller on a failure. An edit that does not
 * land leaves a card one event out of date, which is a cosmetic problem; a
 * resolver that stopped because Telegram was slow would leave the ledger wrong,
 * which is not.
 */
export async function updateCards(
  trade: ActiveTrade,
  options: { closed?: ClosedTrade; keyboard?: (locale: Locale) => Parameters<typeof editMessageText>[3] } = {},
): Promise<number> {
  const targets = trade.targets ?? [];
  if (!targets.length) return 0;

  const cards = await getJson<Card[]>(cardsKey(trade.id), []);
  if (!cards.length) return 0;

  const fills = options.closed?.fills ?? trade.fills ?? [];
  let edited = 0;

  for (const card of cards) {
    const block = progressBlock(targets, fills, card.locale, options.closed);
    const ok = await editMessageText(
      card.chatId,
      card.messageId,
      `${card.html}\n\n${block}`,
      options.keyboard?.(card.locale),
    );
    if (ok) edited += 1;
  }

  return edited;
}
