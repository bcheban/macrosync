import { env } from '../../config/env.js';
import { loadActive, loadStats, winRate } from '../trades/trades.service.js';
import { mute, mutedUntil, subscribe, subscribersStatus, unmute, unsubscribe } from './subscribers.service.js';
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  escapeHtml,
  sendTelegramMessage,
  type InlineKeyboard,
} from './telegram.client.js';
import { getPrefs, STRATEGIES, togglePref, wantsNothing, type StrategyPrefs } from './preferences.service.js';
import { clearAccount, getAccount, parseBalanceCommand, setAccount } from './sizing.service.js';

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
    /** `message_id` is what lets a toggle redraw its own keyboard in place. */
    message?: { message_id?: number; chat?: { id?: number | string } };
  };
}

const MUTE_HOURS = 2;

const MENU: InlineKeyboard = [
  [
    { text: '📊 Stats', callback_data: 'stats' },
    { text: '🛑 Mute 2h', callback_data: 'mute:2' },
  ],
  [{ text: '⚙️ Settings', callback_data: 'settings' }],
];

const STRATEGY_LABEL: Record<(typeof STRATEGIES)[number], string> = {
  scalping: '⚡ Scalping',
  day: '📅 Day trading',
  swing: '🌊 Swing',
};

/**
 * The settings panel: one row per strategy, its own state written on it.
 *
 * The tick is the entire status display — there is no separate line saying what
 * is on, so the button cannot disagree with the state it toggles.
 */
const settingsKeyboard = (prefs: StrategyPrefs): InlineKeyboard =>
  STRATEGIES.map((strategy) => [
    {
      text: `${prefs[strategy] ? '✅' : '❌'} ${STRATEGY_LABEL[strategy]}`,
      callback_data: `pref:${strategy}`,
    },
  ]);

const SETTINGS_TEXT = [
  '⚙️ <b>Which calls do you want?</b>',
  '',
  'Tap to turn a strategy on or off. Only what is ticked will reach you.',
  '',
  '⚡ <b>Scalping</b> — 5m bars, 15 minutes to 2 hours',
  '📅 <b>Day trading</b> — 1h bars, 2 to 12 hours',
  '🌊 <b>Swing</b> — 4h bars, 1 to 4 days',
  '',
  '<i>Turning everything off is allowed — you stay subscribed and simply hear nothing until you turn something back on.</i>',
].join('\n');

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
  '/settings — choose which strategies reach you',
  '/balance — size positions for your deposit',
  '/mute — two hours of quiet',
  '/unmute — turn alerts back on',
  '/stop — unsubscribe',
  '',
  '<i>MEXC perpetuals. Model output over public market data — not financial advice.</i>',
].join('\n');

const HELP = [
  '<b>Commands</b>',
  '/start — subscribe to alerts',
  '/stats — win rate and open trades',
  '/settings — choose which strategies reach you',
  '/balance — size positions for your deposit',
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

    case '/balance': {
      const parsed = parseBalanceCommand(text);

      if ('error' in parsed) {
        if (parsed.error === 'usage') {
          const existing = await getAccount(chatId);
          await sendTelegramMessage(
            [
              '💰 <b>Position sizing</b>',
              '',
              'Tell me your deposit and how much of it you are willing to risk on one trade, and every alert will carry the margin worked out for you.',
              '',
              '<code>/balance 1000 1</code> — $1,000 deposit, 1% risk',
              '<code>/balance 500</code> — risk defaults to 1%',
              '<code>/balance off</code> — forget it',
              '',
              existing
                ? `Currently: <b>${existing.balance}</b> at <b>${existing.riskPct}%</b> — ${Math.round((existing.balance * existing.riskPct) / 100)} per trade.`
                : '<i>Nothing saved. Alerts arrive without a size until you set one.</i>',
            ].join(String.fromCharCode(10)),
            { chatId },
          );
          return;
        }

        if (text.trim().split(/\s+/)[1]?.toLowerCase() === 'off') {
          await clearAccount(chatId);
          await sendTelegramMessage('💰 Forgotten. Alerts will arrive without a size.', { chatId });
          return;
        }

        const complaint: Record<string, string> = {
          balance: 'That deposit did not read as a number. Try <code>/balance 1000 1</code>.',
          'balance-large': 'That deposit looks like a typo. If it is not, size it by hand.',
          risk: 'That risk did not read as a number. Try <code>/balance 1000 1</code>.',
          'risk-large': 'Over 20% of an account on one trade is not something this bot will size for you.',
        };
        await sendTelegramMessage(`⚠️ ${complaint[parsed.error] ?? 'Could not read that.'}`, { chatId });
        return;
      }

      const account = await setAccount(chatId, parsed.balance, parsed.riskPct);
      const perTrade = (account.balance * account.riskPct) / 100;

      await sendTelegramMessage(
        [
          `💰 Saved: <b>${account.balance}</b> at <b>${account.riskPct}%</b> risk.`,
          '',
          `Every alert will now carry the margin for a position that loses <b>${perTrade.toFixed(2)}</b> if its stop fills.`,
          '',
          '<i>Sizing only. Nothing is placed for you, and nothing here is advice.</i>',
        ].join(String.fromCharCode(10)),
        { chatId, keyboard: MENU },
      );
      return;
    }

    case '/settings': {
      const prefs = await getPrefs(chatId);
      await sendTelegramMessage(SETTINGS_TEXT, { chatId, keyboard: settingsKeyboard(prefs) });
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
  const messageId = query.message?.message_id;
  const [action, argument] = (query.data ?? '').split(':');

  switch (action) {
    case 'settings': {
      await answerCallbackQuery(id);
      await sendTelegramMessage(SETTINGS_TEXT, { chatId: chat, keyboard: settingsKeyboard(await getPrefs(chat)) });
      return;
    }

    case 'pref': {
      const strategy = STRATEGIES.find((entry) => entry === argument);
      if (!strategy) {
        await answerCallbackQuery(id);
        return;
      }

      const prefs = await togglePref(chat, strategy);
      const state = prefs[strategy] ? 'on' : 'off';

      /*
       * The toast carries the result, so the answer is useful even if the
       * keyboard edit is refused — which it is, silently, once a message is
       * older than 48 hours and no longer editable.
       */
      await answerCallbackQuery(
        id,
        wantsNothing(prefs)
          ? 'All strategies off — you will not receive new calls'
          : `${STRATEGY_LABEL[strategy]} ${state}`,
      );

      if (messageId !== undefined) await editMessageReplyMarkup(chat, messageId, settingsKeyboard(prefs));
      return;
    }

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
