import { addToSet, removeFromSet, setMembers, storeKey } from '../store/store.js';
import type { Signal, Strategy } from '../../types/domain.js';
import { STRATEGIES } from './preferences.service.js';

/**
 * "Tell me when this one triggers."
 *
 * A signal the engine is watching but not calling is the most common thing on
 * the board and the least useful to stare at. A watch turns that into a
 * question the bot answers later: register the setup, close the tab, hear about
 * it if it becomes a call.
 *
 * One-shot on purpose. A watch that survived firing would repeat on every scan
 * for as long as the call stood, which is the behaviour of an alarm nobody can
 * switch off — and the standing call is already covered by an ordinary
 * subscription. Re-arming is one tap on the same link.
 *
 * Stored as one flat set of `chatId:SYMBOL:strategy` rather than a per-chat set
 * plus a per-setup index. Two indexes have to be kept in step and this one
 * cannot desync; the cost is reading the whole set on each scan, which is a
 * single Redis call and stays sensible into the thousands. Past that, split it.
 */
const KEY = storeKey('telegram:watches');

/** Per chat, so one person cannot fill the set on everybody else's behalf. */
const MAX_PER_CHAT = 25;

export interface Watch {
  chatId: string;
  symbol: string;
  strategy: Strategy;
}

const encode = (watch: Watch): string => `${watch.chatId}:${watch.symbol}:${watch.strategy}`;

const decode = (raw: string): Watch | undefined => {
  const [chatId, symbol, strategy] = raw.split(':');
  if (!chatId || !symbol || !strategy) return undefined;
  if (!(STRATEGIES as string[]).includes(strategy)) return undefined;
  return { chatId, symbol, strategy: strategy as Strategy };
};

const all = async (): Promise<Watch[]> =>
  (await setMembers(KEY)).map(decode).filter((watch): watch is Watch => watch !== undefined);

/**
 * The payload a deep link carries, e.g. `track_SOLUSDT_day`.
 *
 * Telegram allows `A-Z a-z 0-9 _ -` and 64 characters in a `start` payload, so
 * the separator is an underscore and the symbol is upper-cased on the way in.
 * Anything that does not parse returns `undefined` and is treated as an
 * ordinary `/start` — a malformed link should open the bot, not error at
 * somebody who only clicked a button.
 */
export function parseTrackPayload(payload: string | undefined): { symbol: string; strategy: Strategy } | undefined {
  if (!payload) return undefined;
  const match = /^track_([A-Za-z0-9]{2,20})_([a-z]+)$/.exec(payload.trim());
  if (!match) return undefined;

  const symbol = (match[1] as string).toUpperCase();
  const strategy = match[2] as string;
  if (!(STRATEGIES as string[]).includes(strategy)) return undefined;

  return { symbol, strategy: strategy as Strategy };
}

/** Builds the other half of the same link, for the web to point at. */
export const trackPayload = (symbol: string, strategy: Strategy): string =>
  `track_${symbol.toUpperCase()}_${strategy}`;

export async function addWatch(watch: Watch): Promise<{ added: boolean; full: boolean }> {
  const existing = await all();
  const mine = existing.filter((entry) => entry.chatId === watch.chatId);

  if (mine.some((entry) => entry.symbol === watch.symbol && entry.strategy === watch.strategy)) {
    return { added: false, full: false };
  }
  if (mine.length >= MAX_PER_CHAT) return { added: false, full: true };

  await addToSet(KEY, encode(watch));
  return { added: true, full: false };
}

export async function listWatches(chatId: string): Promise<Watch[]> {
  return (await all()).filter((watch) => watch.chatId === chatId);
}

export async function clearWatches(chatId: string): Promise<number> {
  const mine = await listWatches(chatId);
  await Promise.all(mine.map((watch) => removeFromSet(KEY, encode(watch))));
  return mine.length;
}

/**
 * Which watches this scan just answered.
 *
 * A watch fires when its setup stops being a `wait` — that is the whole
 * question it was registered to ask. Each is removed as it fires, so the caller
 * can send without worrying about repeating itself on the next scan.
 */
export async function takeTriggered(signals: Signal[]): Promise<{ watch: Watch; signal: Signal }[]> {
  const watches = await all();
  if (!watches.length) return [];

  const called = new Map(
    signals
      .filter((signal) => signal.verdict !== 'wait')
      .map((signal) => [`${signal.symbol}:${signal.strategy}`, signal]),
  );

  const hits = watches
    .map((watch) => ({ watch, signal: called.get(`${watch.symbol}:${watch.strategy}`) }))
    .filter((hit): hit is { watch: Watch; signal: Signal } => hit.signal !== undefined);

  await Promise.all(hits.map((hit) => removeFromSet(KEY, encode(hit.watch))));
  return hits;
}

export async function watchesStatus() {
  const watches = await all();
  return { total: watches.length, chats: new Set(watches.map((watch) => watch.chatId)).size };
}
