import COMMAND_SPECS from '../../data/commands.json' with { type: 'json' };
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

/** A non-breaking space, so a command and its description never wrap apart. */
const NBSP = ' ';

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

/**
 * The command list, from the one file that defines it.
 *
 * The same array feeds the in-chat glossary and the menu published to Telegram
 * through `setMyCommands`, so the blue Menu button and `/help` cannot describe
 * different bots — which is what happens the moment the two are maintained as
 * separate lists.
 */
interface CommandSpec {
  command: string;
  usage: string;
  /** One line, under 256 chars: what Telegram shows in the Menu button. */
  menu: string;
  /** The fuller sentence, for `/help`. May contain HTML. */
  help: string;
  /** Listed first in the glossary; the rest follow as a smaller group. */
  primary: boolean;
}

const COMMANDS = COMMAND_SPECS as CommandSpec[];

const glossaryLines = (specs: CommandSpec[]): string[] =>
  specs.map((spec) => `<code>${escapeHtml(spec.usage)}</code>${NBSP}— ${spec.help}`);

/** Everything the bot answers, primary commands first. */
function glossary(): string {
  const primary = COMMANDS.filter((spec) => spec.primary);
  const rest = COMMANDS.filter((spec) => !spec.primary);

  return [
    '<b>Commands</b>',
    ...glossaryLines(primary),
    '',
    '<b>Also</b>',
    ...glossaryLines(rest),
  ].join('\n');
}

const WELCOME = [
  '📡 <b>MacroSync</b> — an automated futures radar.',
  '',
  'It scans the liquid USDT perpetuals on MEXC around the clock, and when a setup confirms you get the call: entry, stop, target, the reasoning in one sentence, and the leverage at which liquidation still sits clear of the stop.',
  '',
  'You are subscribed. Nothing else is needed — but the commands below make the alerts yours rather than generic.',
  '',
  glossary(),
  '',
  '<i>MEXC perpetuals. Model output over public market data — not financial advice, and no order is ever placed for you.</i>',
].join('\n');

const HELP = [
  '📡 <b>MacroSync</b> — an automated futures radar for MEXC perpetuals.',
  '',
  glossary(),
  '',
  '<i>Not financial advice. No order is ever placed for you.</i>',
].join('\n');

/**
 * The block to paste into @BotFather under `/setcommands`.
 *
 * Exposed on `/api/health` rather than kept in a document, because a list that
 * lives in prose drifts from the list the code answers to. `setMyCommands` in
 * `scripts/register-webhook.mjs` publishes the same thing automatically; this is
 * for setting it by hand.
 */
export const botFatherBlock = (): string =>
  COMMANDS.map((spec) => `${spec.command} - ${spec.menu}`).join('\n');

/** What `setMyCommands` takes. */
export const menuCommands = (): { command: string; description: string }[] =>
  COMMANDS.map((spec) => ({ command: spec.command, description: spec.menu }));

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

      if ('reset' in parsed) {
        await clearAccount(chatId);
        await sendTelegramMessage(
          '💰 Cleared. Alerts will arrive without a position size until you set one again.',
          { chatId },
        );
        return;
      }

      if ('error' in parsed) {
        /*
         * One message for every way of getting it wrong. Distinguishing "you
         * typed nothing" from "you typed letters" adds a branch and tells the
         * reader the same thing either way: here is the shape it wants.
         */
        const detail: Record<string, string> = {
          'balance-large': 'That deposit looks like a typo — if it is not, size that one by hand.',
          'risk-large': 'Risking more than 20% of an account on a single trade is not something this bot will size for you.',
        };

        await sendTelegramMessage(
          [
            '⚠️ <b>Invalid format.</b>',
            '',
            'To set up your position sizing, send your deposit and the percentage of it you are willing to risk on one trade.',
            '',
            '<code>/balance 1000 1</code>  — $1,000 deposit, 1% risk',
            '<code>/balance 500</code>  — risk defaults to 1%',
            '<code>/balance 0 0</code>  — reset',
            detail[parsed.error] ? '' : undefined,
            detail[parsed.error],
          ]
            .filter((line) => line !== undefined)
            .join('\n'),
          { chatId },
        );
        return;
      }

      const account = await setAccount(chatId, parsed.balance, parsed.riskPct);
      const perTrade = (account.balance * account.riskPct) / 100;

      await sendTelegramMessage(
        [
          `💰 Saved: <b>${account.balance.toLocaleString('en-US')}</b> at <b>${account.riskPct}%</b> risk.`,
          '',
          `Every alert will now carry the margin for a position that loses <b>${perTrade.toFixed(2)}</b> if its stop fills.`,
          '',
          '<i>Sizing only. Nothing is placed for you, and nothing here is advice.</i>',
        ].join('\n'),
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
  return {
    ...subscribers,
    webhookConfigured: Boolean(env.telegramWebhookSecret),
    ownerMuted: Boolean(muted),
    commands: COMMANDS.length,
  };
}
