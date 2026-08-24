import { env } from '../../config/env.js';
import {
  addToSet,
  deleteKey,
  getJson,
  removeFromSet,
  setJson,
  setMembers,
  storeKey,
} from '../store/store.js';

/**
 * Who receives alerts.
 *
 * The bot used to post to one chat id from the environment. That made the
 * channel a personal notifier: a second person could not receive anything
 * without a redeploy. The roster now lives in a Redis set that the webhook
 * writes to, so subscribing is a message rather than a configuration change.
 *
 * The env chat id is still honoured, as the owner: it is seeded into the roster
 * once rather than special-cased at send time, so there is exactly one code path
 * that decides who gets a message — and the owner can leave like anyone else.
 */

const ROSTER_KEY = storeKey('telegram:subscribers');
const SEEDED_KEY = storeKey('telegram:owner-seeded');
const PROFILE_KEY = (chatId: string): string => storeKey(`telegram:profile:${chatId}`);
const MUTE_KEY = (chatId: string): string => storeKey(`telegram:mute:${chatId}`);

export interface Subscriber {
  chatId: string;
  /** Whatever Telegram told us at `/start` — for the roster view, nothing more. */
  name?: string;
  username?: string;
  joinedAt: string;
}

/**
 * Adds a chat, or refreshes what we know about one already there.
 *
 * Idempotent: pressing start twice is the normal case, not an error, and it
 * must not produce a duplicate or reset the join date.
 */
/**
 * Puts the owner on the roster, exactly once in the deployment's lifetime.
 *
 * Runs before any roster read or write, not only when the roster is empty: a
 * deploy where somebody pressed start before the first scheduled run would
 * otherwise never seed the owner at all. The flag is what makes it once — it
 * survives the owner later sending /stop, so leaving is permanent rather than
 * being undone by the next read.
 */
async function ensureOwnerSeeded(): Promise<void> {
  const owner = env.telegramChatId.trim();
  if (!owner) return;
  if (await getJson<boolean>(SEEDED_KEY, false)) return;

  await addToSet(ROSTER_KEY, owner);
  await setJson(SEEDED_KEY, true);
}

export async function subscribe(chatId: string, profile: { name?: string; username?: string } = {}): Promise<{ added: boolean }> {
  await ensureOwnerSeeded();
  const key = PROFILE_KEY(chatId);
  const existing = await getJson<Subscriber | null>(key, null);

  await addToSet(ROSTER_KEY, chatId);
  await setJson(key, {
    chatId,
    ...profile,
    joinedAt: existing?.joinedAt ?? new Date().toISOString(),
  } satisfies Subscriber);

  // Starting again lifts a mute: it reads as "talk to me" either way.
  await deleteKey(MUTE_KEY(chatId));

  return { added: !existing };
}

export async function unsubscribe(chatId: string): Promise<void> {
  await ensureOwnerSeeded();
  await removeFromSet(ROSTER_KEY, chatId);
  await deleteKey(PROFILE_KEY(chatId));
  await deleteKey(MUTE_KEY(chatId));
}

/**
 * Everyone who should receive the next alert.
 *
 * The owner from the environment is seeded into the roster **once**, so a fresh
 * deploy alerts its operator before anyone has pressed start. Seeding once
 * rather than merging them in on every read matters: injecting the owner at read
 * time made them the one recipient who could never be removed, so if they
 * blocked the bot every run would keep trying to reach them forever.
 *
 * After seeding, the owner is an ordinary subscriber — they can /stop, and they
 * are pruned like anyone else if they block the bot.
 */
export async function listSubscribers(): Promise<string[]> {
  await ensureOwnerSeeded();
  return (await setMembers(ROSTER_KEY)).filter(Boolean);
}

/**
 * Silences one recipient for a while.
 *
 * Stored as a key with a TTL rather than a timestamp we compare against: Redis
 * expiring it is the whole mechanism, so there is no unmute to schedule and no
 * stale entry to clean up.
 */
export async function mute(chatId: string, ms: number): Promise<{ until: string }> {
  const until = new Date(Date.now() + ms).toISOString();
  await setJson(MUTE_KEY(chatId), { until }, Math.ceil(ms / 1000));
  return { until };
}

export async function unmute(chatId: string): Promise<void> {
  await deleteKey(MUTE_KEY(chatId));
}

export async function mutedUntil(chatId: string): Promise<string | null> {
  const record = await getJson<{ until: string } | null>(MUTE_KEY(chatId), null);
  if (!record) return null;

  /*
   * The TTL is authoritative, but the memory backend and a clock skew can both
   * leave a record a moment past its end. Checking the timestamp too costs
   * nothing and keeps the two backends behaving identically.
   */
  return Date.parse(record.until) > Date.now() ? record.until : null;
}

/** Splits the roster into who should be messaged now and who asked for quiet. */
export async function activeRecipients(): Promise<{ send: string[]; muted: string[] }> {
  const roster = await listSubscribers();
  const states = await Promise.all(roster.map(async (chatId) => [chatId, await mutedUntil(chatId)] as const));

  return {
    send: states.filter(([, until]) => !until).map(([chatId]) => chatId),
    muted: states.filter(([, until]) => until).map(([chatId]) => chatId),
  };
}

export async function subscribersStatus() {
  const { send, muted } = await activeRecipients();
  return { total: send.length + muted.length, receiving: send.length, muted: muted.length };
}
