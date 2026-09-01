import { deleteKeys, getJson, setJson, storeKey } from '../store/store.js';
import { editMessageText, sendTelegramMessage } from './telegram.client.js';
import { displayTicker } from '../../utils/ticker.js';
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

/**
 * What is kept per trade: where it was announced, and what has been announced.
 *
 * `announced` is the idempotency record for the reply pings. It is not derived
 * from the fills, deliberately — a fill is a fact about the market and an
 * announcement is a fact about what was sent, and conflating them means any
 * change to how fills are persisted silently changes how many notifications
 * people receive.
 */
interface CardDoc {
  cards: Card[];
  /** Rung levels that have already been pinged. Never shrinks. */
  announced: number[];
}

const cardsKey = (tradeId: string): string => storeKey(`trades:cards:${tradeId}`);

/**
 * Reads the document, tolerating the shape that shipped before it had one.
 *
 * The first release stored a bare `Card[]`. Those keys are live right now, and
 * a trade whose document failed to load would lose both its edits and its
 * pings — so the older shape is read rather than discarded.
 */
async function loadDoc(tradeId: string): Promise<CardDoc> {
  const raw = await getJson<CardDoc | Card[] | null>(cardsKey(tradeId), null);
  if (!raw) return { cards: [], announced: [] };
  if (Array.isArray(raw)) return { cards: raw, announced: [] };
  return { cards: raw.cards ?? [], announced: raw.announced ?? [] };
}

/** Remembers where a call was announced. A trade with no cards simply has none. */
export async function rememberCards(tradeId: string, cards: Card[]): Promise<void> {
  if (!cards.length) return;
  await setJson(cardsKey(tradeId), { cards, announced: [] } satisfies CardDoc);
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

  const { cards } = await loadDoc(trade.id);
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

/**
 * Pings the reader that a rung has paid, as a reply to the call itself.
 *
 * The edit above keeps the card correct; this makes a phone buzz. Both are
 * needed and neither replaces the other: an edited message is silent, so
 * without this the one moment a reader might act on — half the position booked,
 * the stop now safe — arrives without a notification. And a ping without the
 * edit would leave the card claiming a target is still pending.
 *
 * ## Once per level, and the claim comes first
 *
 * The levels are written to the store **before** the messages go out. A send
 * that half-worked and then threw would otherwise be retried on the next scan,
 * five minutes later, and half the roster would be told twice that TP1 hit.
 * Between a missed ping and a duplicate one, the duplicate is the one that
 * cannot be taken back — and the card, which is always correct, is there for
 * anyone who missed the buzz.
 *
 * One reply per run rather than one per rung. A candle that sweeps TP1 and TP2
 * together is one event to a reader; two messages a second apart would be the
 * spam this whole design exists to avoid. Each level still appears in exactly
 * one reply, ever, which is what "once per level" has to mean.
 */
export async function announceFills(
  trade: ActiveTrade,
  filled: readonly Fill[],
  reachable: ReadonlySet<string>,
): Promise<number> {
  const levels = [...new Set(filled.filter((fill) => fill.reason === 'target').map((fill) => fill.level))];
  if (!levels.length) return 0;

  const doc = await loadDoc(trade.id);
  if (!doc.cards.length) return 0;

  const fresh = levels.filter((level) => !doc.announced.includes(level)).sort((a, b) => a - b);
  if (!fresh.length) return 0;

  await setJson(cardsKey(trade.id), {
    cards: doc.cards,
    announced: [...doc.announced, ...fresh],
  } satisfies CardDoc);

  /*
   * The share booked is the sum of the rungs named here, not of everything
   * filled so far. A reader seeing "secured 80%" on the second ping when the
   * first said 50% would reasonably read it as 130% of a position.
   */
  const targets = trade.targets ?? [];
  const share = targets
    .filter((target) => fresh.includes(target.level))
    .reduce((sum, target) => sum + target.share, 0);

  /* The stop moves on the first rung, so it is news exactly once. */
  const protectedNow = fresh.includes(Math.min(...targets.map((target) => target.level)));
  const ticker = displayTicker(trade.base);

  let sent = 0;
  for (const card of doc.cards) {
    /*
     * A card exists for everyone who received the original call. That is not
     * the same set as everyone who wants a notification now: somebody may have
     * turned updates off, muted the bot, or switched that strategy off since.
     *
     * The edit above rightly ignores all of that — rewriting a message they
     * already hold is not a new notification. This is, it buzzes a phone, and
     * sending it to somebody who asked for quiet is the bot ignoring its own
     * settings screen.
     */
    if (!reachable.has(card.chatId)) continue;

    const t = dict(card.locale);
    const body = [
      t.replyHit(ticker, fresh.map((level) => `TP${level}`).join(' + '), Math.round(share * 100)),
      ...(protectedNow ? [t.replyBreakeven] : []),
    ].join(' ');

    const result = await sendTelegramMessage(body, { chatId: card.chatId, replyTo: card.messageId });
    if (result.delivered) sent += 1;
  }

  return sent;
}
