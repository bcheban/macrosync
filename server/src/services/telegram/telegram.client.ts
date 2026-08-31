import { env } from '../../config/env.js';
import { getJson, setJson, storeKey } from '../store/store.js';

const API = 'https://api.telegram.org';

/**
 * HTML is the safer of Telegram's two parse modes.
 *
 * MarkdownV2 requires escaping eighteen characters, and a single unescaped `.`
 * or `-` in a price rejects the whole message with a 400. HTML needs three
 * escapes and nothing in a ticker or a number can break it.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const telegramConfigured = (): boolean =>
  Boolean(env.telegramBotToken && env.telegramChatId);

/**
 * Delivery counters, in the store rather than in a module variable.
 *
 * They used to live in memory, which made them worse than useless: every
 * serverless invocation started with `sent: 0, lastError: null`, so `/health`
 * reported a clean slate no matter how many messages had just failed. There was
 * no way to tell a bot that was silent because nothing had triggered from one
 * that was silent because every send was being rejected.
 */
export interface DeliveryStats {
  attempts: number;
  delivered: number;
  failed: number;
  retries: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

const STATS_KEY = storeKey('telegram:delivery');

const EMPTY_STATS: DeliveryStats = {
  attempts: 0,
  delivered: 0,
  failed: 0,
  retries: 0,
  lastSentAt: null,
  lastError: null,
  lastErrorAt: null,
};

export const deliveryStats = (): Promise<DeliveryStats> => getJson<DeliveryStats>(STATS_KEY, EMPTY_STATS);

export const telegramStatus = async () => ({
  configured: telegramConfigured(),
  cooldownMs: env.telegramCooldownMs,
  maxPerRun: env.alertsMaxPerRun,
  delivery: await deliveryStats(),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SendResult {
  delivered: boolean;
  /**
   * Telegram's id for the message that arrived.
   *
   * The handle a later edit needs. Present only on a delivered message, and
   * absent even then if the Bot API answered without one — a caller that wants
   * to update a card has to cope with never having been given a way to.
   */
  messageId?: number;
  error?: string;
  /** True when trying the same message again could plausibly work. */
  retryable?: boolean;
  /**
   * The recipient is gone for good — blocked the bot, deleted the account, or
   * the chat no longer exists. The caller drops them from the roster; retrying
   * would fail identically every run, forever.
   */
  blocked?: boolean;
}

/** One row of buttons under a message. */
/**
 * One row per array. A button either calls back or opens a URL — Telegram
 * rejects both on the same button, and silently drops one that carries neither.
 */
export type InlineButton =
  | { text: string; callback_data: string; url?: never }
  | { text: string; url: string; callback_data?: never };

export type InlineKeyboard = InlineButton[][];

export interface SendOptions {
  /** Defaults to the owner chat from the environment. */
  chatId?: string;
  keyboard?: InlineKeyboard;
  /**
   * The buttons that live at the bottom of the chat, replacing the keyboard.
   *
   * Sent with a message rather than on its own — Telegram has no way to set one
   * without one. It persists until replaced, so it is attached to the messages
   * that mark a change of state (the welcome, a language switch) rather than to
   * every reply, which would be a wasted field on ninety percent of sends.
   */
  replyKeyboard?: string[][];
}

/** What Telegram puts in the body. `ok` is authoritative; the status is not. */
interface BotApiResponse {
  ok: boolean;
  /** Present on success. Only the id is read; the rest is the echoed message. */
  result?: { message_id?: number };
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Telegram enforces two separate limits, so this tracks two clocks.
 *
 * About one message per second to any single chat, and about thirty a second
 * across all of them. Pacing a broadcast at the per-chat rate would take half a
 * minute to reach twenty subscribers for no reason — they are different chats.
 */
let nextGlobalSendAt = 0;
const nextChatSendAt = new Map<string, number>();

/** ~25/s, comfortably inside the documented 30. */
const GLOBAL_GAP_MS = 40;

/**
 * Descriptions that mean the recipient will never receive anything again.
 *
 * `chat not found` is deliberately absent, though Telegram returns it with a
 * 400 that reads exactly like a dead chat. It is also what the API says about
 * somebody who has simply never pressed Start on *this* bot — which, the first
 * time a newly issued token broadcasts, is every name on the roster. Left on
 * this list it would have emptied the roster on the move to @AyanoxTradeBot,
 * one alert run after the token changed.
 *
 * The two mistakes do not cost the same. Keeping a genuinely dead chat costs
 * one failed request per run. Dropping a live one loses a subscriber with no
 * way to ask them back, because a bot cannot open a conversation its user has
 * not started.
 */
const GONE = ['bot was blocked', 'user is deactivated', 'bot was kicked', 'group chat was upgraded'];

const isGone = (status: number, description: string): boolean => {
  const detail = description.toLowerCase();
  return (status === 403 || status === 400) && GONE.some((phrase) => detail.includes(phrase));
};

async function attempt(html: string, options: SendOptions): Promise<SendResult & { retryAfterMs?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.telegramTimeoutMs);

  try {
    const response = await fetch(`${API}/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chatId ?? env.telegramChatId,
        text: html,
        parse_mode: 'HTML',
        // The alert is the message; a link preview would bury it.
        link_preview_options: { is_disabled: true },
        /*
         * One or the other. Telegram takes a single `reply_markup`, and an
         * inline keyboard under the message is not the same object as the
         * persistent one under the composer — sending both means losing one
         * silently, so the inline keyboard wins where a caller asks for both.
         */
        ...(options.keyboard
          ? { reply_markup: { inline_keyboard: options.keyboard } }
          : options.replyKeyboard
            ? {
                reply_markup: {
                  keyboard: options.replyKeyboard.map((row) => row.map((text) => ({ text }))),
                  resize_keyboard: true,
                  is_persistent: true,
                },
              }
            : {}),
      }),
    });

    /*
     * Parsed whatever the status, because the status alone is not the answer.
     * The Bot API can return 200 with `{"ok": false}`, and treating HTTP 200 as
     * success meant those were counted as delivered — a message nobody received,
     * recorded as sent, with a trade opened against it.
     */
    const body = (await response.json().catch(() => null)) as BotApiResponse | null;

    if (body?.ok === true) {
      const messageId = body.result?.message_id;
      return { delivered: true, ...(typeof messageId === 'number' ? { messageId } : {}) };
    }

    const detail = body?.description ?? `${response.status} ${response.statusText}`;
    const retryAfter = body?.parameters?.retry_after;

    if (isGone(response.status, detail)) {
      return { delivered: false, retryable: false, blocked: true, error: detail };
    }

    if (response.status === 429 || retryAfter) {
      return {
        delivered: false,
        retryable: true,
        error: `rate limited: ${detail}`,
        retryAfterMs: (retryAfter ?? 1) * 1000,
      };
    }

    /*
     * 4xx other than 429 is the message itself being wrong — bad HTML, a chat
     * the bot was removed from, a wrong id. Retrying cannot fix any of those.
     */
    const permanent = response.status >= 400 && response.status < 500;
    return { delivered: false, retryable: !permanent, error: detail };
  } catch (error) {
    // A timeout or a socket failure: transient by nature, so worth another go.
    return { delivered: false, retryable: true, error: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Posts one message to the configured chat, retrying what is worth retrying.
 *
 * Never throws — a notifier that can take down the run it is attached to is
 * worse than one that misses a message — but it no longer fails *silently*:
 * every outcome lands in the delivery counters, and the caller is told whether
 * the message actually arrived so it can decide what to record.
 */
export async function sendTelegramMessage(html: string, options: SendOptions = {}): Promise<SendResult> {
  if (!telegramConfigured()) return { delivered: false, error: 'not configured' };

  const chat = options.chatId ?? env.telegramChatId;

  // Whichever clock is further out decides when this message may go.
  const wait = Math.max(nextGlobalSendAt, nextChatSendAt.get(chat) ?? 0) - Date.now();
  if (wait > 0) await sleep(wait);

  let retries = 0;
  let last: SendResult = { delivered: false, error: 'no attempt made' };

  for (let tries = 0; tries < env.alertsSendRetries; tries += 1) {
    const result = await attempt(html, options);
    const now = Date.now();
    nextGlobalSendAt = now + GLOBAL_GAP_MS;
    nextChatSendAt.set(chat, now + env.alertsSendGapMs);

    if (result.delivered) {
      await bumpStats({ delivered: 1, retries });
      return { delivered: true, ...(result.messageId ? { messageId: result.messageId } : {}) };
    }

    last = { delivered: false, error: result.error, retryable: result.retryable, blocked: result.blocked };
    if (!result.retryable) break;

    retries += 1;
    // Honour Telegram's own backoff when it gives one; otherwise back off gently.
    const backoff = result.retryAfterMs ?? env.alertsSendGapMs * (tries + 1);
    console.warn(`[telegram] attempt ${tries + 1} failed (${result.error}); retrying in ${backoff}ms`);
    if (tries + 1 < env.alertsSendRetries) await sleep(Math.min(backoff, 8_000));
  }

  /*
   * A recipient who blocked the bot is expected attrition, not a fault. Logging
   * it as an error and recording it as a delivery failure would make a healthy
   * roster look broken and bury real problems under the noise.
   */
  if (last.blocked) return last;

  console.error('[telegram] send failed:', last.error);
  await bumpStats({ failed: 1, retries, error: last.error ?? 'unknown' });
  return last;
}

async function bumpStats(delta: { delivered?: number; failed?: number; retries: number; error?: string }) {
  try {
    const stats = await deliveryStats();
    const now = new Date().toISOString();

    await setJson(STATS_KEY, {
      attempts: stats.attempts + 1,
      delivered: stats.delivered + (delta.delivered ?? 0),
      failed: stats.failed + (delta.failed ?? 0),
      retries: stats.retries + delta.retries,
      lastSentAt: delta.delivered ? now : stats.lastSentAt,
      lastError: delta.error ?? stats.lastError,
      lastErrorAt: delta.error ? now : stats.lastErrorAt,
    } satisfies DeliveryStats);
  } catch (error) {
    // Bookkeeping must never be the reason an alert path fails.
    console.warn('[telegram] could not record delivery stats:', (error as Error).message);
  }
}

/**
 * Acknowledges a button press.
 *
 * Telegram shows a spinner on the button until this is called, so it must
 * happen on every callback — including the ones that fail — or the button looks
 * stuck. The toast text is optional; without it the spinner just clears.
 */
export async function answerCallbackQuery(id: string, text?: string, showAlert = false): Promise<void> {
  if (!telegramConfigured()) return;

  try {
    await fetch(`${API}/bot${env.telegramBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text, show_alert: showAlert }),
    });
  } catch (error) {
    console.warn('[telegram] callback ack failed:', (error as Error).message);
  }
}

/**
 * Rewrites a message's text *and* its buttons in place.
 *
 * The settings panel needs both: switching language has to redraw the prose, and
 * the two warnings it can show — everything off, and results-off-while-signals-on
 * — live in the text rather than in the keyboard, so editing only the buttons
 * would leave a warning on screen that no longer applies.
 */
export async function editMessageText(
  chatId: string,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  if (!telegramConfigured()) return false;

  try {
    const response = await fetch(`${API}/bot${env.telegramBotToken}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      }),
    });

    const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    // A double tap edits nothing, and Telegram calls that an error. It is not.
    if (body?.ok !== true && !body?.description?.includes('not modified')) {
      console.warn('[telegram] message edit failed:', body?.description ?? response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[telegram] message edit errored:', (error as Error).message);
    return false;
  }
}

/**
 * Rewrites the buttons under a message that is already in the chat.
 *
 * Used by `/settings`: a toggle should redraw the checkmarks in place. Sending
 * a fresh message per tap would leave a column of near-identical panels, and
 * the older ones would still show stale state while looking live.
 */
export async function editMessageReplyMarkup(
  chatId: string,
  messageId: number,
  keyboard: InlineKeyboard,
): Promise<boolean> {
  if (!telegramConfigured()) return false;

  try {
    const response = await fetch(`${API}/bot${env.telegramBotToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard },
      }),
    });

    const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    /*
     * "message is not modified" is Telegram's answer to an edit that changes
     * nothing, which happens on a double tap. It is not a failure worth logging.
     */
    if (body?.ok !== true && !body?.description?.includes('not modified')) {
      console.warn('[telegram] keyboard edit failed:', body?.description ?? response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[telegram] keyboard edit failed:', (error as Error).message);
    return false;
  }
}
