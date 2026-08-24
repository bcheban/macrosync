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
  error?: string;
  /** True when trying the same message again could plausibly work. */
  retryable?: boolean;
}

/** What Telegram puts in the body. `ok` is authoritative; the status is not. */
interface BotApiResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

/** Rate limiting is the one failure worth waiting out rather than dropping. */
let nextSendAt = 0;

async function attempt(html: string): Promise<SendResult & { retryAfterMs?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.telegramTimeoutMs);

  try {
    const response = await fetch(`${API}/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.telegramChatId,
        text: html,
        parse_mode: 'HTML',
        // The alert is the message; a link preview would bury it.
        link_preview_options: { is_disabled: true },
      }),
    });

    /*
     * Parsed whatever the status, because the status alone is not the answer.
     * The Bot API can return 200 with `{"ok": false}`, and treating HTTP 200 as
     * success meant those were counted as delivered — a message nobody received,
     * recorded as sent, with a trade opened against it.
     */
    const body = (await response.json().catch(() => null)) as BotApiResponse | null;

    if (body?.ok === true) return { delivered: true };

    const detail = body?.description ?? `${response.status} ${response.statusText}`;
    const retryAfter = body?.parameters?.retry_after;

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
export async function sendTelegramMessage(html: string): Promise<SendResult> {
  if (!telegramConfigured()) return { delivered: false, error: 'not configured' };

  // Telegram accepts roughly one message per second to a chat; pace to suit.
  const wait = nextSendAt - Date.now();
  if (wait > 0) await sleep(wait);

  let retries = 0;
  let last: SendResult = { delivered: false, error: 'no attempt made' };

  for (let tries = 0; tries < env.alertsSendRetries; tries += 1) {
    const result = await attempt(html);
    nextSendAt = Date.now() + env.alertsSendGapMs;

    if (result.delivered) {
      await bumpStats({ delivered: 1, retries });
      return { delivered: true };
    }

    last = { delivered: false, error: result.error, retryable: result.retryable };
    if (!result.retryable) break;

    retries += 1;
    // Honour Telegram's own backoff when it gives one; otherwise back off gently.
    const backoff = result.retryAfterMs ?? env.alertsSendGapMs * (tries + 1);
    console.warn(`[telegram] attempt ${tries + 1} failed (${result.error}); retrying in ${backoff}ms`);
    if (tries + 1 < env.alertsSendRetries) await sleep(Math.min(backoff, 8_000));
  }

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
