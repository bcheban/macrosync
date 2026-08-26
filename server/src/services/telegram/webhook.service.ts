import COMMAND_SPECS from '../../data/commands.json' with { type: 'json' };
import { env } from '../../config/env.js';
import { loadActive, loadStats, winRate } from '../trades/trades.service.js';
import { mute, mutedUntil, subscribe, subscribersStatus, unmute, unsubscribe } from './subscribers.service.js';
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  escapeHtml,
  sendTelegramMessage,
  type InlineKeyboard,
} from './telegram.client.js';
import {
  CHANNELS,
  getPrefs,
  LOCALES,
  setLocale,
  STRATEGIES,
  strandedByFilters,
  toggleChannel,
  toggleStrategy,
  wantsNothing,
  type Channel,
  type Locale,
  type Prefs,
} from './preferences.service.js';
import { dict, guessLocale, LOCALE_LABEL } from './i18n/index.js';
import { buildAnalytics, formatAnalytics } from '../admin/analytics.service.js';
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
    from?: { first_name?: string; username?: string; language_code?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { first_name?: string; username?: string; language_code?: string };
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
const TICK = (on: boolean): string => (on ? '✅' : '❌');

/**
 * The settings panel: three groups, one button per switch.
 *
 * Every button carries its own state in its label, so the keyboard *is* the
 * status display. A separate list of what is on would be a second thing to keep
 * in sync, and the moment it drifted the panel would be lying about the very
 * settings it exists to change.
 */
function settingsKeyboard(prefs: Prefs): InlineKeyboard {
  const t = dict(prefs.locale);

  const strategyLabel: Record<string, string> = {
    scalping: t.strategyScalping,
    day: t.strategyDay,
    swing: t.strategySwing,
  };
  const channelLabel: Record<Channel, string> = {
    signals: t.channelSignals,
    updates: t.channelUpdates,
    results: t.channelResults,
  };

  return [
    ...STRATEGIES.map((strategy) => [
      {
        text: `${TICK(prefs.strategies[strategy])} ${strategyLabel[strategy]}`,
        callback_data: `pref:${strategy}`,
      },
    ]),
    ...CHANNELS.map((channel) => [
      {
        text: `${TICK(prefs.channels[channel])} ${channelLabel[channel]}`,
        callback_data: `chan:${channel}`,
      },
    ]),
    // One row: three languages fit, and a column of them would dwarf the rest.
    LOCALES.map((locale) => ({
      text: prefs.locale === locale ? `• ${LOCALE_LABEL[locale]}` : LOCALE_LABEL[locale],
      callback_data: `lang:${locale}`,
    })),
  ];
}

/** The prose above the keyboard, which explains what the switches mean. */
function settingsText(prefs: Prefs): string {
  const t = dict(prefs.locale);

  const lines = [
    t.settingsTitle,
    '',
    t.settingsStrategies,
    `${t.strategyScalping} — <i>${t.strategyScalpingHint}</i>`,
    `${t.strategyDay} — <i>${t.strategyDayHint}</i>`,
    `${t.strategySwing} — <i>${t.strategySwingHint}</i>`,
    '',
    t.settingsChannels,
    `${t.channelSignals} — <i>${t.channelSignalsHint}</i>`,
    `${t.channelUpdates} — <i>${t.channelUpdatesHint}</i>`,
    `${t.channelResults} — <i>${t.channelResultsHint}</i>`,
    '',
    t.settingsHint,
  ];

  /*
   * Two states worth saying out loud, because neither is obvious from a
   * keyboard of ticks and neither is something anybody chooses on purpose.
   */
  if (wantsNothing(prefs)) lines.push('', t.settingsAllOff);
  else if (strandedByFilters(prefs)) lines.push('', t.settingsStranded);

  return lines.join('\n');
}

/** The published record, phrased the same way everywhere it appears. */
async function statsLine(locale: Locale): Promise<string> {
  const t = dict(locale);
  const [stats, active] = await Promise.all([loadStats(), loadActive()]);
  const decided = stats.wins + stats.losses;

  if (!decided) return active.length ? t.statsOnlyOpen(active.length) : t.statsNone;

  const expired = stats.expired ? t.statsExpired(stats.expired) : '';
  return [
    t.statsRate(winRate(stats), stats.wins, stats.losses, expired),
    t.statsOpen(active.length),
    '',
    t.statsFootnote,
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

/**
 * The language picker, shown once on `/start`.
 *
 * Asked outright rather than inferred, because Telegram's `language_code` is the
 * phone's setting and plenty of people run an English phone in Ukrainian. The
 * guess only decides which language the question itself is asked in.
 */
const LANGUAGE_KEYBOARD: InlineKeyboard = [
  LOCALES.map((locale) => ({ text: LOCALE_LABEL[locale], callback_data: `lang:${locale}` })),
];

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

/**
 * The welcome, in the reader's language.
 *
 * The command *names* stay English because that is what the reader has to type
 * and what Telegram's menu lists; only the prose around them moves.
 */
const welcome = (locale: Locale): string => {
  const t = dict(locale);
  return [
    t.welcomeIntro,
    '',
    t.welcomeBody,
    '',
    t.welcomeSubscribed,
    '',
    glossary(),
    '',
    t.disclaimerLong,
  ].join('\n');
};

const help = (locale: Locale): string => {
  const t = dict(locale);
  return [t.helpIntro, '', glossary(), '', t.disclaimerShort].join('\n');
};

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

async function handleCommand(
  chatId: string,
  text: string,
  profile: { name?: string; username?: string; languageCode?: string },
): Promise<void> {
  // `/start@SomeBot` in a group, and any argument, both trail the command.
  const command = text.trim().split(/[\s@]/)[0]?.toLowerCase() ?? '';

  switch (command) {
    case '/start': {
      await subscribe(chatId, profile);
      const prefs = await getPrefs(chatId);

      /*
       * A first-time subscriber is asked which language before anything else,
       * and the question is asked in the language their phone suggests — so the
       * one message they cannot yet have configured is still likely readable.
       *
       * Asked exactly once. Somebody sending /start again to lift a mute has
       * already answered, and re-asking would read as the bot forgetting.
       */
      if (!prefs.localeChosen) {
        const guessed = guessLocale(profile.languageCode);
        await sendTelegramMessage(dict(guessed).chooseLanguage, {
          chatId,
          keyboard: LANGUAGE_KEYBOARD,
        });
        return;
      }

      await sendTelegramMessage(welcome(prefs.locale), { chatId, keyboard: MENU });
      return;
    }

    case '/stop': {
      // Read before unsubscribing: the goodbye should still be in their language.
      const locale = (await getPrefs(chatId)).locale;
      await unsubscribe(chatId);
      await sendTelegramMessage(dict(locale).stopped, { chatId });
      return;
    }

    case '/stats': {
      await sendTelegramMessage(await statsLine((await getPrefs(chatId)).locale), { chatId, keyboard: MENU });
      return;
    }

    case '/balance': {
      const t = dict((await getPrefs(chatId)).locale);
      const parsed = parseBalanceCommand(text);

      if ('reset' in parsed) {
        await clearAccount(chatId);
        await sendTelegramMessage(t.balanceCleared, { chatId });
        return;
      }

      if ('error' in parsed) {
        /*
         * One message for every way of getting it wrong. Distinguishing "you
         * typed nothing" from "you typed letters" adds a branch and tells the
         * reader the same thing either way: here is the shape it wants. The
         * bounds still add their own line, because "too large" is not something
         * an example can explain.
         */
        const detail: Partial<Record<string, string>> = {
          'balance-large': t.balanceTooLarge,
          'risk-large': t.balanceRiskTooLarge,
        };
        const extra = detail[parsed.error];

        await sendTelegramMessage(
          [
            t.balanceInvalid,
            '',
            t.balanceHowTo,
            '',
            `<code>/balance 1000 1</code>  ${t.balanceExample1}`,
            `<code>/balance 500</code>  ${t.balanceExample2}`,
            `<code>/balance 0 0</code>  ${t.balanceExample3}`,
            ...(extra ? ['', extra] : []),
          ].join('\n'),
          { chatId },
        );
        return;
      }

      const account = await setAccount(chatId, parsed.balance, parsed.riskPct);
      const perTrade = (account.balance * account.riskPct) / 100;

      await sendTelegramMessage(
        [
          t.balanceSaved(account.balance.toLocaleString('en-US'), account.riskPct),
          '',
          t.balanceSavedBody(perTrade.toFixed(2)),
          '',
          t.balanceSavedNote,
        ].join('\n'),
        { chatId, keyboard: MENU },
      );
      return;
    }

    case '/stats_deep': {
      /*
       * Owner only. Not because the numbers are secret — the dashboard shows
       * the win rate to anyone — but because it replays candles for every
       * scratched trade, and an open command would let any chat make the server
       * do unbounded upstream work.
       *
       * Deliberately not in the command menu: it answers a question about the
       * strategy's own parameters, which is an operator's question.
       */
      if (chatId !== env.telegramChatId) return;

      const analytics = await buildAnalytics(env.breakevenThreshold);
      await sendTelegramMessage(formatAnalytics(analytics), { chatId });
      return;
    }

    case '/settings': {
      const prefs = await getPrefs(chatId);
      await sendTelegramMessage(settingsText(prefs), { chatId, keyboard: settingsKeyboard(prefs) });
      return;
    }

    case '/mute': {
      const { until } = await mute(chatId, MUTE_HOURS * 60 * 60_000);
      await sendTelegramMessage(
        dict((await getPrefs(chatId)).locale).muted(MUTE_HOURS),
        { chatId },
      );
      return;
    }

    case '/unmute': {
      await unmute(chatId);
      await sendTelegramMessage(dict((await getPrefs(chatId)).locale).unmuted, { chatId, keyboard: MENU });
      return;
    }

    case '/help': {
      await sendTelegramMessage(help((await getPrefs(chatId)).locale), { chatId, keyboard: MENU });
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
      const prefs = await getPrefs(chat);
      await sendTelegramMessage(settingsText(prefs), { chatId: chat, keyboard: settingsKeyboard(prefs) });
      return;
    }

    case 'pref':
    case 'chan':
    case 'lang': {
      /*
       * Three kinds of switch, one shape: flip it, say what happened in the
       * toast, redraw the keyboard in place.
       *
       * The toast carries the result because the keyboard edit is refused —
       * silently — once a message is older than 48 hours, and a tap that
       * appears to do nothing is worse than one that only says what it did.
       */
      let prefs: Prefs | undefined;
      let toast = '';

      if (action === 'pref') {
        const strategy = STRATEGIES.find((entry) => entry === argument);
        if (strategy) {
          prefs = await toggleStrategy(chat, strategy);
          const t = dict(prefs.locale);
          const label = { scalping: t.strategyScalping, day: t.strategyDay, swing: t.strategySwing }[strategy];
          toast = `${label} ${prefs.strategies[strategy] ? 'on' : 'off'}`;
        }
      } else if (action === 'chan') {
        const channel = CHANNELS.find((entry) => entry === argument);
        if (channel) {
          prefs = await toggleChannel(chat, channel);
          const t = dict(prefs.locale);
          const label = { signals: t.channelSignals, updates: t.channelUpdates, results: t.channelResults }[channel];
          toast = `${label} ${prefs.channels[channel] ? 'on' : 'off'}`;
        }
      } else {
        const locale = LOCALES.find((entry) => entry === argument);
        if (locale) {
          const before = await getPrefs(chat);
          prefs = await setLocale(chat, locale);
          toast = dict(locale).languageSet;

          /*
           * First answer: this tap came from the onboarding question, not from
           * the settings panel, so the welcome is what should follow it — and
           * there is no panel to redraw.
           */
          if (!before.localeChosen) {
            await answerCallbackQuery(id, toast);
            await sendTelegramMessage(welcome(locale), { chatId: chat, keyboard: MENU });
            return;
          }
        }
      }

      if (!prefs) {
        await answerCallbackQuery(id);
        return;
      }

      await answerCallbackQuery(id, toast);

      /*
       * The prose is redrawn too, not just the buttons. Switching language has
       * to change the whole panel, and the two warnings — everything off, and
       * results-off-while-signals-on — live in the text rather than the
       * keyboard, so a keyboard-only edit would leave them stale.
       */
      if (messageId !== undefined) {
        await editMessageText(chat, messageId, settingsText(prefs), settingsKeyboard(prefs));
      }
      return;
    }

    case 'stats': {
      // Acknowledged first: the button spins until Telegram gets an answer, and
      // reading the ledger is slower than the spinner looks patient.
      await answerCallbackQuery(id);
      await sendTelegramMessage(await statsLine((await getPrefs(chat)).locale), { chatId: chat, keyboard: MENU });
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
      // The phone's language, used only to pick which language to *ask* in.
      languageCode: message?.from?.language_code,
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
