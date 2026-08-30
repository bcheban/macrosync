import type { Strategy } from '../../types/domain.js';
import COMMAND_SPECS from '../../data/commands.json' with { type: 'json' };
import { env } from '../../config/env.js';
import { mute, mutedUntil, subscribe, subscribersStatus, unmute, unsubscribe } from './subscribers.service.js';
import { addWatch, clearWatches, listWatches, parseTrackPayload } from './watches.service.js';
import { displayTicker } from '../../utils/ticker.js';
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
  initialiseOptIn,
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
import { dict, guessLocale, hubCommand, hubKeyboard, LOCALE_LABEL } from './i18n/index.js';
import { analyticsForReader, formatAnalyticsFor } from '../admin/analytics.service.js';
import {
  calculatePosition,
  clearAccount,
  getAccount,
  mexcFuturesUrl,
  parseBalanceCommand,
  setAccount,
} from './sizing.service.js';
import { loadActive, loadHistory, loadStats, winRate } from '../trades/trades.service.js';
import {
  cumulativeRoiPct,
  netR,
  recordByBucket,
  simulatedUsd,
  RISK_PER_TRADE_USD,
  THIN_SAMPLE,
} from '../trades/confidence.js';
import { maxSafeLeverage } from '../signal.engine.js';
import { getContractSpecs } from '../market.service.js';

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
const TICK = (on: boolean): string => (on ? '\u2705' : '\u274c');

/**
 * The settings tree: one compact root, two sub-menus, one message.
 *
 * It used to be a single screen carrying six toggles, three language buttons and
 * eleven lines of prose. Everything was reachable in one tap, which sounds like a
 * virtue until you look at it on a phone — the thing somebody came to change was
 * buried among five they did not.
 *
 * Every screen edits the same message rather than sending a new one, so browsing
 * leaves one panel instead of a column of stale ones showing settings that have
 * since changed.
 */
type SettingsView = 'root' | 'strategies' | 'channels';

const strategyLabels = (locale: Locale): Record<Strategy, string> => {
  const t = dict(locale);
  return { scalping: t.strategyScalping, day: t.strategyDay, swing: t.strategySwing };
};

const channelLabels = (locale: Locale): Record<Channel, string> => {
  const t = dict(locale);
  return { signals: t.channelSignals, updates: t.channelUpdates, results: t.channelResults };
};

function settingsKeyboard(prefs: Prefs, view: SettingsView): InlineKeyboard {
  const t = dict(prefs.locale);

  if (view === 'strategies') {
    const label = strategyLabels(prefs.locale);
    return [
      ...STRATEGIES.map((strategy) => [
        { text: `${TICK(prefs.strategies[strategy])} ${label[strategy]}`, callback_data: `pref:${strategy}` },
      ]),
      [{ text: t.settingsBack, callback_data: 'settings:root' }],
    ];
  }

  if (view === 'channels') {
    const label = channelLabels(prefs.locale);
    return [
      ...CHANNELS.map((channel) => [
        { text: `${TICK(prefs.channels[channel])} ${label[channel]}`, callback_data: `chan:${channel}` },
      ]),
      [{ text: t.settingsBack, callback_data: 'settings:root' }],
    ];
  }

  /*
   * The root counts what is on beside each entry, so the summary lives on the
   * button rather than in prose above it — one place to be wrong instead of two.
   */
  const onStrategies = STRATEGIES.filter((key) => prefs.strategies[key]).length;
  const onChannels = CHANNELS.filter((key) => prefs.channels[key]).length;

  return [
    [
      {
        text: `\u{1F4CA} ${t.settingsStrategiesButton} (${onStrategies}/${STRATEGIES.length})`,
        callback_data: 'settings:strategies',
      },
    ],
    [
      {
        text: `\u{1F514} ${t.settingsChannelsButton} (${onChannels}/${CHANNELS.length})`,
        callback_data: 'settings:channels',
      },
    ],
    LOCALES.map((locale) => ({
      text: prefs.locale === locale ? `\u2022 ${LOCALE_LABEL[locale]}` : LOCALE_LABEL[locale],
      callback_data: `lang:${locale}`,
    })),
  ];
}

function settingsText(prefs: Prefs, view: SettingsView): string {
  const t = dict(prefs.locale);

  if (view === 'strategies') {
    const lines = [
      t.settingsStrategiesTitle,
      '',
      `${t.strategyScalping} \u2014 <i>${t.strategyScalpingHint}</i>`,
      `${t.strategyDay} \u2014 <i>${t.strategyDayHint}</i>`,
      `${t.strategySwing} \u2014 <i>${t.strategySwingHint}</i>`,
    ];
    if (STRATEGIES.every((key) => !prefs.strategies[key])) lines.push('', t.settingsPickOne);
    return lines.join('\n');
  }

  if (view === 'channels') {
    const lines = [
      t.settingsChannelsTitle,
      '',
      `${t.channelSignals} \u2014 <i>${t.channelSignalsHint}</i>`,
      `${t.channelUpdates} \u2014 <i>${t.channelUpdatesHint}</i>`,
      `${t.channelResults} \u2014 <i>${t.channelResultsHint}</i>`,
    ];
    // The one combination nobody picks on purpose by tapping one button.
    if (strandedByFilters(prefs)) lines.push('', t.settingsStranded);
    return lines.join('\n');
  }

  const lines = [t.settingsTitle, '', t.settingsRootHint];
  if (wantsNothing(prefs)) lines.push('', t.settingsAllOff);
  return lines.join('\n');
}

/** Fixed order, so the split does not reshuffle as one setup pulls ahead. */
const STATS_ORDER: Strategy[] = ['scalping', 'day', 'swing'];

/**
 * The published record, phrased the same way everywhere it appears.
 *
 * The per-setup split reads `byStrategy`, which the ledger has maintained since
 * it was written — closing a trade already buckets it. Nothing new is stored
 * for this: a second set of counters would only be a second thing to keep in
 * step with the first, and the first is the one the reset clears.
 *
 * A setup with nothing settled is left out rather than shown at 0%. Zero of
 * zero is not a win rate, and printing one puts it in a list inviting
 * comparison against setups that have actually traded.
 */
async function statsLine(locale: Locale): Promise<string> {
  const t = dict(locale);
  const [stats, active, history] = await Promise.all([loadStats(), loadActive(), loadHistory()]);
  const decided = stats.wins + stats.losses;

  if (!decided) return active.length ? t.statsOnlyOpen(active.length) : t.statsNone;

  const expired = stats.expired ? t.statsExpired(stats.expired) : '';
  const labels = strategyLabels(locale);

  /*
   * The net result leads, above the win rate.
   *
   * A percentage cannot say whether this makes money: the rate and the reward
   * ratio move independently, and 40% at 2R is a business where 60% at 0.4R is
   * not. Putting the total first means the rate underneath it is read as a
   * detail of a known outcome rather than as the outcome.
   */
  const net = netR(history);
  /*
   * The raw move alongside the risk-normalised one. R says whether the sizing
   * works; this says whether the direction did — a wide-stop swing and a tight
   * scalp weigh the same in R and very differently here.
   */
  const roi = cumulativeRoiPct(history);
  const lines = [
    t.statsNet(`${net.r >= 0 ? '+' : ''}${net.r.toFixed(1)}R`, simulatedUsd(net.r), net.settled),
    t.statsRoi(`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`),
    '',
    t.statsRate(winRate(stats), stats.wins, stats.losses, expired),
    t.statsOpen(active.length),
  ];

  const split = STATS_ORDER.map((strategy) => ({
    label: labels[strategy],
    ...(stats.byStrategy[strategy] ?? { wins: 0, losses: 0 }),
  })).filter((row) => row.wins + row.losses > 0);

  if (split.length) {
    lines.push('', t.statsByStrategy);
    for (const row of split) {
      const n = row.wins + row.losses;
      lines.push(t.statsStrategyRow(row.label, Math.round((row.wins / n) * 100), row.wins, row.losses));
    }
  }

  /*
   * The record cut by the reading each call was made on.
   *
   * The same brackets, the same arithmetic and the same small-sample threshold
   * as the dashboard, so the bot and the site cannot quote different numbers
   * for the same question. Brackets with nothing settled are dropped rather
   * than printed as a dash — a row of them is noise in a chat message, where
   * on a web grid it is at least a column that holds its place.
   *
   * The warning is a mark, not a colour: a chat has no greying, and a
   * percentage over four trades that looks exactly like one over forty is the
   * thing this is guarding against.
   */
  const buckets = recordByBucket(history).filter((bucket) => bucket.decided > 0);

  if (buckets.length) {
    lines.push('', t.statsByConfidence);
    for (const bucket of buckets) {
      lines.push(
        t.statsConfidenceRow(
          bucket.label,
          bucket.rate ?? 0,
          bucket.wins,
          bucket.decided,
          `${bucket.r >= 0 ? '+' : ''}${bucket.r.toFixed(1)}R`,
          simulatedUsd(bucket.r),
          bucket.thin,
        ),
      );
    }
    if (buckets.some((bucket) => bucket.thin)) lines.push(t.statsThinNote(THIN_SAMPLE));
    lines.push(t.statsRiskNote(RISK_PER_TRADE_USD));
  }

  lines.push('', t.statsFootnote);
  return lines.join('\n');
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
  /**
   * What Telegram shows in the blue Menu button, per language. Under 256 chars.
   *
   * These live beside the command rather than in the locale files, unlike the
   * `/help` prose. Two reasons: they are captions rather than sentences and
   * belong with `usage` and `icon`, and `register-webhook.mjs` is plain
   * JavaScript that publishes them without ever loading the TypeScript build.
   */
  menu: Record<Locale, string>;
  /** One glyph, so the glossary scans as a list rather than a wall of text. */
  icon: string;
  /** English fallback. The reader's language comes from `commandHelp`. */
  help: string;
  /** Listed first in the glossary; the rest follow as a smaller group. */
  primary: boolean;
}

const COMMANDS = COMMAND_SPECS as CommandSpec[];

/**
 * One line per command, in the reader's language.
 *
 * The command *names* stay English because that is what has to be typed, and
 * the syntax comes from `commands.json` for the same reason. Only the sentence
 * after the dash is translated.
 *
 * English is the fallback rather than a thrown error: a command whose
 * translation has not landed should still be discoverable, and a glossary
 * missing a row is a worse failure than one carrying an English row.
 */
const glossaryLines = (specs: CommandSpec[], locale: Locale): string[] => {
  const table = dict(locale).commandHelp as Record<string, string | undefined>;
  return specs.map(
    (spec) =>
      `${spec.icon}${NBSP}<code>${escapeHtml(spec.usage)}</code>${NBSP}— ${table[spec.command] ?? spec.help}`,
  );
};

/**
 * The language picker, shown once on `/start`.
 *
 * Asked outright rather than inferred, because Telegram's `language_code` is the
 * phone's setting and plenty of people run an English phone in Ukrainian. The
 * guess only decides which language the question itself is asked in.
 */
/**
 * The guide's three topics.
 *
 * Separate messages rather than one long one. A beginner reading about leverage
 * does not need the strategy comparison in the same breath, and a wall of text
 * is where people stop reading — which costs more than the extra tap.
 */
const GUIDE_TOPICS = ['strategies', 'risk', 'leverage'] as const;
type GuideTopic = (typeof GUIDE_TOPICS)[number];

const guideKeyboard = (locale: Locale): InlineKeyboard => {
  const t = dict(locale);
  return [
    [{ text: t.guideStrategies, callback_data: 'guide:strategies' }],
    [{ text: t.guideRisk, callback_data: 'guide:risk' }],
    [{ text: t.guideLeverage, callback_data: 'guide:leverage' }],
  ];
};

const guideMenu = (locale: Locale): string => {
  const t = dict(locale);
  return [t.guideTitle, '', t.guideIntro].join('\n');
};

const guideBody = (locale: Locale, topic: GuideTopic): string => {
  const t = dict(locale);
  return { strategies: t.guideStrategiesBody, risk: t.guideRiskBody, leverage: t.guideLeverageBody }[topic];
};

const LANGUAGE_KEYBOARD: InlineKeyboard = [
  LOCALES.map((locale) => ({ text: LOCALE_LABEL[locale], callback_data: `lang:${locale}` })),
];

/** Everything the bot answers, primary commands first. */
function glossary(locale: Locale): string {
  const t = dict(locale);
  const primary = COMMANDS.filter((spec) => spec.primary);
  const rest = COMMANDS.filter((spec) => !spec.primary);

  return [
    t.commandsHeading,
    ...glossaryLines(primary, locale),
    '',
    t.alsoHeading,
    ...glossaryLines(rest, locale),
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

  /*
   * What this is, then what it can do, then the small print.
   *
   * The glossary used to be left out of here on the argument that a first
   * screen has one job and the list is a tap away in /help. That holds for
   * somebody arriving from a link who already knows what they came for; it does
   * not hold for the case this is now written for, which is a stranger opening
   * the bot cold. They cannot tap a command they have not been shown, and
   * "send /help" is a worse first instruction than the help itself.
   *
   * The primary commands only. The full list including /stop and /stats_deep
   * stays in /help — an onboarding message that ends with how to leave has
   * spent its last line badly.
   */
  return [
    t.welcomeIntro,
    '',
    t.welcomeBody,
    '',
    t.commandsHeading,
    ...glossaryLines(COMMANDS.filter((spec) => spec.primary), locale),
    '',
    t.welcomeSubscribed,
    '',
    t.disclaimerLong,
  ].join('\n');
};

const help = (locale: Locale): string => {
  const t = dict(locale);
  return [t.helpIntro, '', glossary(locale), '', t.disclaimerShort].join('\n');
};

/**
 * The block to paste into @BotFather under `/setcommands`.
 *
 * Exposed on `/api/health` rather than kept in a document, because a list that
 * lives in prose drifts from the list the code answers to. `setMyCommands` in
 * `scripts/register-webhook.mjs` publishes the same thing automatically; this is
 * for setting it by hand.
 */
export const botFatherBlock = (locale: Locale = 'en'): string =>
  COMMANDS.map((spec) => `${spec.command} - ${spec.menu[locale] ?? spec.menu.en}`).join('\n');

/**
 * What `setMyCommands` takes, for one language.
 *
 * Telegram keys menus by `language_code` and falls back to the default list for
 * anything unpublished, so the default stays English and `uk`/`de` are
 * published alongside it. A reader's menu language follows their Telegram
 * client, not the language they picked here — those are different settings and
 * Telegram only lets us answer the first.
 */
export const menuCommands = (locale: Locale = 'en'): { command: string; description: string }[] =>
  COMMANDS.map((spec) => ({ command: spec.command, description: spec.menu[locale] ?? spec.menu.en }));

async function handleCommand(
  chatId: string,
  text: string,
  profile: { name?: string; username?: string; languageCode?: string },
): Promise<void> {
  /*
   * A hub button arrives as ordinary text carrying its own label, so it is
   * translated back into a command before anything else looks at it.
   */
  const pressed = hubCommand(text);
  const line = pressed ?? text;

  // `/start@SomeBot` in a group, and any argument, both trail the command.
  const command = line.trim().split(/[\s@]/)[0]?.toLowerCase() ?? '';
  /*
   * Everything after the command, kept verbatim.
   *
   * `/start` is the only command Telegram lets a link carry an argument for —
   * `t.me/bot?start=<payload>` arrives as `/start <payload>` — which is what
   * makes a deep link the whole of the web's side of this. No account, no
   * session, nothing typed: the button on the card already knows which setup
   * it is about, and the link carries it.
   */
  const payload = line.trim().split(/\s+/).slice(1).join(' ');

  switch (command) {
    case '/start': {
      const { added } = await subscribe(chatId, profile);

      /*
       * Opt-in applies to chats joining for the first time, and only those. A
       * subscriber who has been receiving calls since before this existed keeps
       * receiving them — a deployment that silences people is not a UX change,
       * it is an outage they have to notice on their own.
       */
      if (added) await initialiseOptIn(chatId);

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

      /*
       * A tracked setup arrived with the link.
       *
       * Answered instead of the welcome, not after it. Somebody who pressed
       * "Track" on a card asked one question, and replying with the full
       * onboarding first would bury the answer under a page of text they have
       * usually read before — the deep link is used most by people already
       * subscribed.
       */
      const track = parseTrackPayload(payload);
      if (track) {
        const t = dict(prefs.locale);
        const { added, full } = await addWatch({ chatId, ...track });
        // The same name the site shows, so a deep link and its card agree.
        const base = displayTicker(track.symbol.replace(/USDT$/, ''));

        await sendTelegramMessage(
          full
            ? t.watchFull
            : added
              ? t.watchAdded(base, strategyLabels(prefs.locale)[track.strategy])
              : t.watchAlready(base),
          { chatId, replyKeyboard: hubKeyboard(prefs.locale) },
        );
        return;
      }

      await sendTelegramMessage(welcome(prefs.locale), { chatId, replyKeyboard: hubKeyboard(prefs.locale) });
      return;
    }

    case '/watching': {
      const t = dict((await getPrefs(chatId)).locale);
      const mine = await listWatches(chatId);

      if (payload.trim().toLowerCase() === 'clear') {
        const cleared = await clearWatches(chatId);
        await sendTelegramMessage(t.watchCleared(cleared), { chatId });
        return;
      }

      await sendTelegramMessage(
        mine.length
          ? t.watchList(mine.map((w) => `${displayTicker(w.symbol.replace(/USDT$/, ''))} · ${w.strategy}`))
          : t.watchNone,
        { chatId },
      );
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
      const parsed = parseBalanceCommand(line);

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

    case '/calc': {
      const locale = (await getPrefs(chatId)).locale;
      const t = dict(locale);

      const parts = line.trim().split(/\s+/).slice(1);
      const num = (raw: string | undefined): number => Number((raw ?? '').replace(/[$%,\s]/g, ''));

      // `/calc` bare is a request for the instructions, not a failed command.
      if (!parts.length && !(await getAccount(chatId))) {
        await sendTelegramMessage(t.calcUsage, { chatId });
        return;
      }

      const account = await getAccount(chatId);
      const balance = parts.length ? num(parts[0]) : (account?.balance ?? 0);
      const riskPct = parts.length > 1 ? num(parts[1]) : (account?.riskPct ?? 1);

      if (!(balance > 0) || !(riskPct > 0)) {
        await sendTelegramMessage(parts.length ? t.calcUsage : t.calcNoAccount, { chatId });
        return;
      }

      /*
       * Levels come from the command when given, and otherwise from whatever the
       * bot is currently tracking — the newest open trade. Pricing against a
       * call that is already running is the common case: somebody reads an
       * alert, wants their own size, and should not have to retype its levels.
       */
      let entry = parts.length > 2 ? num(parts[2]) : 0;
      let stopLoss = parts.length > 3 ? num(parts[3]) : 0;
      let fromSignal: string | undefined;
      let symbol: string | undefined;

      if (!entry || !stopLoss) {
        const active = await loadActive();
        const latest = active[active.length - 1];
        if (!latest) {
          await sendTelegramMessage(t.calcNoLevels, { chatId });
          return;
        }
        entry = latest.entry;
        // The published stop, not one that has since moved to breakeven.
        stopLoss = latest.initialStopLoss ?? latest.stopLoss;
        fromSignal = latest.base;
        symbol = latest.symbol;
      }

      if (!(entry > 0) || !(stopLoss > 0) || entry === stopLoss) {
        await sendTelegramMessage(t.calcBadLevels, { chatId });
        return;
      }

      /*
       * Leverage is derived from the levels rather than carried on the trade.
       * The ledger never stored it, and recomputing is both cheap — the specs
       * are cached — and correct for hand-typed levels the bot never called.
       */
      const specs = symbol ? await getContractSpecs().catch(() => new Map()) : new Map();
      const leverage = maxSafeLeverage(entry, stopLoss, symbol ? specs.get(symbol) : undefined);

      const result = calculatePosition({ balance, riskPct, entry, stopLoss, leverage });
      if (!result) {
        await sendTelegramMessage(t.calcBadLevels, { chatId });
        return;
      }

      const money = (value: number): string =>
        value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(2);
      // Coin quantities span nine orders of magnitude across this board.
      const qty = result.quantity >= 1 ? result.quantity.toFixed(2) : result.quantity.toPrecision(4);

      const lines = [
        fromSignal ? t.calcTitle(fromSignal) : t.calcTitleCustom,
        fromSignal ? t.calcFromSignal(fromSignal) : '',
        '',
        t.calcAccount(money(balance), riskPct, money(result.riskAmount)),
        t.calcStopDistance((result.stopFraction * 100).toFixed(2)),
        '',
        t.calcSize(money(result.notional)),
        // The coin count is the number that goes into an order ticket.
        t.calcQty(qty, fromSignal ?? '').trimEnd(),
        result.margin !== null && result.leverage ? t.calcMargin(money(result.margin), result.leverage) : '',
        result.capped ? t.calcCapped : '',
        '',
        t.calcNote,
      ];

      await sendTelegramMessage(
        lines.filter((line) => line !== '').join('\n'),
        {
          chatId,
          keyboard: fromSignal
            ? [[{ text: t.tradeOnMexc, url: mexcFuturesUrl(`${fromSignal}USDT`) }]]
            : MENU,
        },
      );
      return;
    }

    case '/guide': {
      const locale = (await getPrefs(chatId)).locale;
      await sendTelegramMessage(guideMenu(locale), { chatId, keyboard: guideKeyboard(locale) });
      return;
    }

    case '/stats_deep': {
      /*
       * Open to everyone. It used to be owner-only because it replayed candles
       * for every scratched trade on each call; it now reads a snapshot the
       * cron refreshes, so the cost of a tap is one store read.
       */
      const locale = (await getPrefs(chatId)).locale;
      const analytics = await analyticsForReader(env.breakevenThreshold);

      await sendTelegramMessage(formatAnalyticsFor(analytics, locale), { chatId, keyboard: MENU });
      return;
    }

    case '/settings': {
      const prefs = await getPrefs(chatId);
      await sendTelegramMessage(settingsText(prefs, 'root'), { chatId, keyboard: settingsKeyboard(prefs, 'root') });
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
      const locale = (await getPrefs(chatId)).locale;
      // Refreshed here too, so a reader who changed language sees their own labels.
      await sendTelegramMessage(help(locale), { chatId, replyKeyboard: hubKeyboard(locale) });
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
      /*
       * `settings:root|strategies|channels`. A bare `settings` still arrives
       * from the persistent menu keyboard, which predates the sub-menus.
       */
      const view: SettingsView = argument === 'strategies' || argument === 'channels' ? argument : 'root';

      await answerCallbackQuery(id);
      const prefs = await getPrefs(chat);

      // Edited in place when there is a message to edit, so navigating the
      // sub-menus leaves one panel rather than a column of them.
      if (messageId !== undefined) {
        await editMessageText(chat, messageId, settingsText(prefs, view), settingsKeyboard(prefs, view));
        return;
      }

      await sendTelegramMessage(settingsText(prefs, view), { chatId: chat, keyboard: settingsKeyboard(prefs, view) });
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
           * The hub is stale the moment the language changes, so it is replaced
           * — but only for a reader who already had one. During onboarding the
           * welcome carries it a moment later, and sending a bare confirmation
           * first would be one message saying what the next one already shows.
           */
          if (before.localeChosen) {
            await sendTelegramMessage(dict(locale).languageSet, {
              chatId: chat,
              replyKeyboard: hubKeyboard(locale),
            });
          }

          /*
           * First answer: this tap came from the onboarding question, not from
           * the settings panel, so the welcome is what should follow it — and
           * there is no panel to redraw.
           */
          if (!before.localeChosen) {
            await answerCallbackQuery(id, toast);
            await sendTelegramMessage(welcome(locale), { chatId: chat, replyKeyboard: hubKeyboard(locale) });

            /*
             * The strategy picker follows immediately, because opt-in without a
             * visible next step is just a bot that says hello and goes quiet. A
             * new subscriber has nothing turned on, and this is the screen that
             * turns something on.
             */
            const fresh = await getPrefs(chat);
            if (!fresh.configured) {
              await sendTelegramMessage(settingsText(fresh, 'strategies'), {
                chatId: chat,
                keyboard: settingsKeyboard(fresh, 'strategies'),
              });
            }
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
       * Redrawn on the screen the tap came from, so a toggle inside a sub-menu
       * does not bounce the reader back to the root. The prose is rewritten too,
       * not just the buttons: switching language changes the whole panel, and
       * the warnings live in the text rather than the keyboard.
       */
      const view: SettingsView = action === 'pref' ? 'strategies' : action === 'chan' ? 'channels' : 'root';

      if (messageId !== undefined) {
        await editMessageText(chat, messageId, settingsText(prefs, view), settingsKeyboard(prefs, view));
      }
      return;
    }

    case 'guide': {
      const locale = (await getPrefs(chat)).locale;
      await answerCallbackQuery(id);

      if (argument === 'menu') {
        if (messageId !== undefined) {
          await editMessageText(chat, messageId, guideMenu(locale), guideKeyboard(locale));
        }
        return;
      }

      const topic = GUIDE_TOPICS.find((entry) => entry === argument);
      if (!topic) return;

      /*
       * Edited in place with a way back, so browsing topics leaves one message
       * rather than a column of them — and the older copies cannot sit there
       * showing a topic the reader has moved on from.
       */
      if (messageId !== undefined) {
        await editMessageText(chat, messageId, guideBody(locale, topic), [
          [{ text: dict(locale).guideBack, callback_data: 'guide:menu' }],
        ]);
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
