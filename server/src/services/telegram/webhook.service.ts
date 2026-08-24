import { env } from '../../config/env.js';
import { loadActive, loadStats, winRate } from '../trades/trades.service.js';
import { mute, mutedUntil, subscribe, subscribersStatus, unmute, unsubscribe } from './subscribers.service.js';
import { answerCallbackQuery, escapeHtml, sendTelegramMessage, type InlineKeyboard } from './telegram.client.js';

/**
 * Everything the bot does when somebody talks to it.
 *
 * Telegram delivers updates by POSTing to a public URL, which means the endpoint
 * is reachable by anyone who guesses it. `setWebhook` takes a `secret_token`
 * that Telegram then echoes in a header on every request, and checking it is the
 * only thing standing between this handler and a stranger forging subscriptions
 * or button presses. The route rejects anything without it.
 *
 * Handlers answer quickly and always resolve: Telegram retries a non-200, so an
 * error escaping here would turn one bad update into a retry loop.
 */

/** Only the fields acted on. Everything else Telegram sends is ignored. */
export interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { first_name?: string; username?: string };
    message?: { chat?: { id?: number | string } };
  };
}

const MUTE_HOURS = 2;

const MENU: InlineKeyboard = [
  [
    { text: '📊 Stats', callback_data: 'stats' },
    { text: '🛑 Mute 2h', callback_data: 'mute:2' },
  ],
];

/** The published record, phrased the same way everywhere it appears. */
async function statsLine(): Promise<string> {
  const [stats, active] = await Promise.all([loadStats(), loadActive()]);
  const decided = stats.wins + stats.losses;

  if (!decided) {
    return active.length
      ? `📊 No settled trades yet — ${active.length} still open. The record starts when the first one closes.`
      : '📊 No trades on the record yet. The first confirmed call opens one.';
  }

  const unresolved = stats.expired ? ` · ${stats.expired} expired` : '';
  return [
    `📊 <b>Win rate ${winRate(stats)}%</b> — ${stats.wins}W / ${stats.losses}L${unresolved}`,
    `📈 ${active.length} trade${active.length === 1 ? '' : 's'} open right now`,
    '',
    '<i>Counts target and stop only. Expired and superseded calls stay out of the denominator.</i>',
  ].join('\n');
}

const WELCOME = [
  '👋 <b>You are subscribed.</b>',
  '',
  'You will get a message when a call is confirmed — entry, stop, target and the reasoning, plus a note when it reaches either level.',
  '',
  'The scan covers the liquid USDT pairs on MEXC and rotates through the whole board, so this is not limited to the majors.',
  '',
  '<b>Commands</b>',
  '/stats — the current record',
  '/mute — two hours of quiet',
  '/unmute — turn alerts back on',
  '/stop — unsubscribe',
  '',
  '<i>Model output over public market data. Not financial advice.</i>',
].join('\n');

const HELP = [
  '<b>Commands</b>',
  '/start — subscribe to alerts',
  '/stats — win rate and open trades',
  '/mute — two hours of quiet',
  '/unmute — turn alerts back on',
  '/stop — unsubscribe',
].join('\n');

async function handleCommand(chatId: string, text: string, profile: { name?: string; username?: string }): Promise<void> {
  // `/start@SomeBot` in a group, and any argument, both trail the command.
  const command = text.trim().split(/[\s@]/)[0]?.toLowerCase() ?? '';

  switch (command) {
    case '/start': {
      await subscribe(chatId, profile);
      await sendTelegramMessage(WELCOME, { chatId, keyboard: MENU });
      return;
    }

    case '/stop': {
      await unsubscribe(chatId);
      await sendTelegramMessage('🔕 Unsubscribed. Send /start whenever you want them back.', { chatId });
      return;
    }

    case '/stats': {
      await sendTelegramMessage(await statsLine(), { chatId, keyboard: MENU });
      return;
    }

    case '/mute': {
      const { until } = await mute(chatId, MUTE_HOURS * 60 * 60_000);
      await sendTelegramMessage(
        `🛑 Muted until <b>${escapeHtml(new Date(until).toUTCString())}</b>. Send /unmute to lift it early.`,
        { chatId },
      );
      return;
    }

    case '/unmute': {
      await unmute(chatId);
      await sendTelegramMessage('🔔 Alerts are back on.', { chatId, keyboard: MENU });
      return;
    }

    case '/help': {
      await sendTelegramMessage(HELP, { chatId, keyboard: MENU });
      return;
    }

    default:
      /*
       * Silence for anything unrecognised. A bot that answers every stray
       * message is one people mute, and in a group chat it would be unbearable.
       */
      return;
  }
}

async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
  const id = query.id;
  const chatId = query.message?.chat?.id;

  if (!id) return;
  if (chatId === undefined) {
    await answerCallbackQuery(id);
    return;
  }

  const chat = String(chatId);
  const [action, argument] = (query.data ?? '').split(':');

  switch (action) {
    case 'stats': {
      // Acknowledged first: the button spins until Telegram gets an answer, and
      // reading the ledger is slower than the spinner looks patient.
      await answerCallbackQuery(id);
      await sendTelegramMessage(await statsLine(), { chatId: chat, keyboard: MENU });
      return;
    }

    case 'mute': {
      const hours = Number(argument) > 0 ? Number(argument) : MUTE_HOURS;
      const { until } = await mute(chat, hours * 60 * 60_000);
      await answerCallbackQuery(id, `Muted for ${hours}h — /unmute lifts it early`, true);
      await sendTelegramMessage(`🛑 Muted until <b>${escapeHtml(new Date(until).toUTCString())}</b>.`, {
        chatId: chat,
      });
      return;
    }

    default:
      await answerCallbackQuery(id);
  }
}

/**
 * Processes one update.
 *
 * Resolves whatever happens — the caller answers Telegram 200 regardless,
 * because a failed update that returns an error is redelivered, and an update
 * that fails once will fail the same way every time.
 */
export async function handleUpdate(update: TelegramUpdate): Promise<{ handled: string }> {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return { handled: 'callback_query' };
    }

    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text;

    if (chatId === undefined || !text) return { handled: 'ignored' };

    await handleCommand(String(chatId), text, {
      name: message?.from?.first_name,
      username: message?.from?.username,
    });

    return { handled: 'message' };
  } catch (error) {
    console.error('[telegram] update failed:', (error as Error).message);
    return { handled: 'error' };
  }
}

export async function botStatus() {
  const [subscribers, muted] = await Promise.all([subscribersStatus(), mutedUntil(env.telegramChatId)]);
  return { ...subscribers, webhookConfigured: Boolean(env.telegramWebhookSecret), ownerMuted: Boolean(muted) };
}
