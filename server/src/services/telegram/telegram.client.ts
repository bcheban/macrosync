import { env } from '../../config/env.js';

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

let lastError: string | undefined;
let lastSentAt: number | undefined;
let sentCount = 0;

export const telegramStatus = () => ({
  configured: telegramConfigured(),
  cooldownMs: env.telegramCooldownMs,
  sent: sentCount,
  lastSentAt: lastSentAt ? new Date(lastSentAt).toISOString() : null,
  lastError: lastError ?? null,
});

/**
 * Posts one message to the configured chat.
 *
 * Never throws: a notifier that can take down the request it is attached to is
 * worse than one that quietly misses a message, so failures are recorded for
 * `/health` and swallowed.
 */
export async function sendTelegramMessage(html: string): Promise<boolean> {
  if (!telegramConfigured()) return false;

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

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText} ${detail.slice(0, 160)}`);
    }

    lastError = undefined;
    lastSentAt = Date.now();
    sentCount += 1;
    return true;
  } catch (error) {
    lastError = (error as Error).message;
    console.warn('[telegram] send failed:', lastError);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
