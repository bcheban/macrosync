import { env } from '../../config/env.js';
import type { MacroEvent, Signal, Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';
import { loadStats, openTrade, winRate, type ClosedTrade, type TradeStats } from '../trades/trades.service.js';
import {
  escapeHtml,
  sendTelegramMessage,
  telegramConfigured,
  type InlineKeyboard,
} from './telegram.client.js';
import { activeRecipients, mutedUntil, unsubscribe, type Recipient } from './subscribers.service.js';
import { takeTriggered } from './watches.service.js';
import { displayTicker } from '../../utils/ticker.js';
import { getPrefs } from './preferences.service.js';
import type { Channel, Locale, Prefs } from './preferences.service.js';
import { dict } from './i18n/index.js';
import { bucketOf, realisedR } from '../trades/confidence.js';
import {
  cooldownFor,
  loadCooldown,
  noteAccepted,
  saveCooldown,
  type CooldownState,
} from '../trades/cooldown.js';
import { getAccount, mexcFuturesUrl, planPosition } from './sizing.service.js';
import type { ActiveTrade, Progress, RefusalReason } from '../trades/trades.service.js';
import { announceFills, forgetCards, rememberCards, updateCards, type Card } from './signal-cards.js';

/**
 * Alerting for confirmed calls.
 *
 * Two guards decide whether a signal is worth a message:
 *
 *  - **Transition.** Only a verdict that *changed into* buy or sell alerts. A
 *    call that has been standing for an hour is not news.
 *  - **Cooldown.** A score sitting on its threshold flips between buy and wait
 *    from bar to bar. Without a per-asset quiet period the channel would get
 *    the same call every time signals are computed.
 *
 * A genuine reversal (buy -> sell) ignores the cooldown: that is the tape
 * turning over, and anyone holding the previous call needs it immediately.
 *
 * State lives in the shared store rather than in memory, so the guards survive
 * a cold start — an instance recycling used to be enough to repeat an alert
 * that had already gone out.
 */
interface AlertState {
  verdict: Signal['verdict'];
  sentAt: number;
  /** Consecutive delivery failures for this pair, so a bad message gives up. */
  failures?: number;
}

/** Runs a message is retried across before the call is abandoned. */
const MAX_DELIVERY_FAILURES = 3;

export interface AlertRun {
  sent: number;
  failed: number;
  /** Confirmed calls the per-run cap suppressed. Never silently dropped. */
  dropped: number;
  /** Individual deliveries across every recipient, for the run log. */
  deliveries: number;
  /** Recipients removed because they blocked the bot or deleted the chat. */
  pruned: number;
}

/**
 * Buttons carried under every alert, labelled in the reader's language.
 *
 * `callback_data` is capped at 64 bytes and stays English — it is an identifier
 * the bot parses, not text anybody sees.
 */
/**
 * The dashboard, in one language, optionally opened on one asset.
 *
 * English is the bare URL and the others hang off `?lang=`, which is exactly
 * how the site's own hreflang alternates are built — so a link from here lands
 * on the same indexable URL the reader would have reached from search. The
 * symbol rides alongside as a deep link rather than as part of that identity:
 * the terminal drops it from the address bar once it has opened the chart, and
 * the canonical tag never carries it, so an alert for every pair does not turn
 * into a hundred indexable URLs serving one page.
 *
 * Built through `URL` rather than by concatenation. `publicBaseUrl` already has
 * its trailing slashes stripped, but the ordering and the escaping of two
 * optional parameters is exactly the arithmetic that produces `//?lang=` or a
 * stray `&` when it is done by hand.
 */
const terminalUrl = (locale: Locale, symbol?: string): string => {
  const url = new URL(`${env.publicBaseUrl}/`);
  if (locale !== 'en') url.searchParams.set('lang', locale);
  if (symbol) url.searchParams.set('symbol', symbol);
  return url.toString();
};

const signalKeyboard = (prefs: Prefs, symbol?: string): InlineKeyboard => {
  const t = dict(prefs.locale);

  return [
    /*
     * The contract page, on its own row and first. Everything above it in the
     * message is a reason to act; this is the only button that acts, and burying
     * it beside "Stats" would make the reader hunt for the one thing they came
     * to do.
     */
    ...(symbol ? [[{ text: t.tradeOnMexc, url: mexcFuturesUrl(symbol) }]] : []),
    /*
     * The terminal, in the reader's own language.
     *
     * Second row rather than beside the exchange link: both are destinations,
     * and a reader who wants the chart before the trade should not have to pick
     * the right one of two adjacent blue buttons under a message they are
     * skimming. Omitted entirely when `PUBLIC_BASE_URL` is unset.
     */
    ...(env.publicBaseUrl
      ? [[{ text: t.openTerminal, url: terminalUrl(prefs.locale, symbol) }]]
      : []),
    [
      { text: t.statsButton, callback_data: 'stats' },
      { text: t.muteButton(2), callback_data: 'mute:2' },
    ],
  ];
};

interface BroadcastResult {
  delivered: number;
  failed: number;
  pruned: number;
  /**
   * Every message that landed, with the text it landed as.
   *
   * Collected here because this is the only place that knows all three things
   * at once: which chat, which message id Telegram assigned, and what the
   * personalised body actually said. Reconstructing any of that afterwards
   * would mean re-rendering a card against prices that have since moved.
   */
  cards: Card[];
  /**
   * Nobody was told and nothing failed: an empty roster, everyone muted, or the
   * last recipient having just been pruned. Distinct from a failure, because
   * there was nothing to go wrong.
   */
  silent: boolean;
  /**
   * Every failure was one that retrying cannot fix — malformed HTML, say, which
   * fails identically for every recipient. Without this a bad message would be
   * re-sent to the whole roster on each of the next three runs before the
   * failure counter gave up on it.
   */
  permanent: boolean;
}

/**
 * Sends one message to every subscriber who is not muted.
 *
 * Each recipient is isolated. One person blocking the bot, or one send timing
 * out, must never cost the rest of the roster their alert — so the loop
 * continues past any single failure, and a recipient Telegram reports as gone is
 * dropped from the roster rather than retried on every run forever.
 */
/**
 * Sends one message to everyone entitled to it, in their own language.
 *
 * `render` is called per recipient rather than once, because two things now vary
 * between subscribers: the language they chose, and whether they have told the
 * bot their deposit. Building the body ahead of the loop would force every
 * reader onto the first one's settings.
 */
async function broadcast(
  render: (recipient: Recipient) => Promise<string> | string,
  keyboard?: (prefs: Prefs) => InlineKeyboard,
  strategy?: Strategy,
  channel?: Channel,
  /** Delivery options that apply to every recipient of this one message. */
  options?: { quiet?: boolean },
): Promise<BroadcastResult> {
  const { send, filtered } = await activeRecipients(strategy, channel);
  if (filtered.length) {
    const why = [strategy, channel].filter(Boolean).join('/');
    console.info(`[alerts] ${filtered.length} recipient(s) filtered out ${why}`);
  }

  if (!send.length) {
    return { delivered: 0, failed: 0, pruned: 0, cards: [], silent: true, permanent: false };
  }

  const cards: Card[] = [];
  let delivered = 0;
  let failed = 0;
  let pruned = 0;
  let retryable = 0;

  for (const recipient of send) {
    const { chatId } = recipient;
    try {
      const html = await render(recipient);
      const result = await sendTelegramMessage(html, {
        chatId,
        keyboard: keyboard?.(recipient.prefs),
        ...(options?.quiet ? { quiet: true } : {}),
      });

      if (result.delivered) {
        delivered += 1;
        // No id means no handle to edit by, which is a card that simply cannot
        // be updated — recorded as delivered, because it was.
        if (result.messageId) {
          cards.push({ chatId, messageId: result.messageId, html, locale: recipient.prefs.locale });
        }
      } else if (result.blocked) {
        await unsubscribe(chatId);
        pruned += 1;
        console.warn(`[alerts] dropped ${chatId} from the roster: ${result.error}`);
      } else {
        failed += 1;
        if (result.retryable !== false) retryable += 1;
      }
    } catch (error) {
      // Belt and braces: the send path is written not to throw, but a store
      // failure inside the prune could. One bad recipient is not the roster.
      failed += 1;
      retryable += 1;
      console.error(`[alerts] recipient ${chatId} errored:`, (error as Error).message);
    }
  }

  return {
    delivered,
    failed,
    pruned,
    cards,
    silent: delivered === 0 && failed === 0,
    permanent: failed > 0 && retryable === 0,
  };
}

const ALERTS_KEY = storeKey('alerts:last');

const keyFor = (signal: Signal): string => `${signal.symbol}:${signal.strategy}`;

/** How a strategy presents itself, and roughly how long its trades run. */
const STRATEGY_META: Record<Strategy, { label: string; duration: string }> = {
  scalping: { label: '⚡ Scalping', duration: '15 minutes – 2 hours' },
  day: { label: '📅 Day trade', duration: '2 – 12 hours' },
  swing: { label: '🌊 Swing', duration: '1 – 4 days' },
};

const SIDE_EMOJI = { buy: '🟢', sell: '🔴' } as const;

/** Prices are already rounded for display by the engine. */
const money = (value: number): string => escapeHtml(String(value));

/** Account figures, rounded to something a person would actually type. */
const usd = (value: number): string =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(2);

/**
 * What this call is worth to one particular reader.
 *
 * Appended only for subscribers who have told the bot their deposit. The
 * arithmetic is theirs either way; doing it here removes the step most likely
 * to be got wrong while a setup is live.
 */
async function sizingLine(chatId: string, signal: Signal, locale: Locale): Promise<string | undefined> {
  const account = await getAccount(chatId);
  if (!account) return undefined;

  const plan = planPosition(account, signal);
  if (!plan) return undefined;

  const t = dict(locale);
  const base = t.sizingMargin(usd(plan.margin), plan.leverage, usd(plan.riskAmount), usd(account.balance));

  return plan.capped ? `${base}
${t.sizingCapped(account.riskPct)}` : base;
}

export function formatAlert(
  signal: Signal,
  summary: string,
  event: MacroEvent | undefined,
  stats: TradeStats | undefined,
  locale: Locale = 'en',
): string {
  const t = dict(locale);
  const meta = STRATEGY_META[signal.strategy];
  const long = signal.verdict === 'buy';
  const emoji = SIDE_EMOJI[long ? 'buy' : 'sell'];

  // Signed toward the trade, so a short reads positive when it is right.
  const targetPct = ((signal.takeProfit - signal.entry) / signal.entry) * 100 * (long ? 1 : -1);

  const lines = [
    `${emoji} <b>${escapeHtml(displayTicker(signal.base))}</b> — <b>${long ? t.alertLong : t.alertShort}</b>`,
    /*
     * An engine call shows how much of its own confluence agreed. An external
     * one has no such quantity — the levels came off somebody's chart — so it
     * says where it came from instead. Printing `0/100` would read as a broken
     * signal, and printing an invented number would be worse.
     */
    signal.source === 'tradingview'
      ? `${meta.label} · <i>${escapeHtml(signal.timeframe)} · ${t.alertViaTradingView}</i>`
      : `${meta.label} · <i>${escapeHtml(signal.timeframe)} · ${t.alertConfidence} ${signal.confidence}/100</i>`,
    '',
    /*
     * Entry, target, stop — the order a trade is thought about rather than the
     * order it might end in, and the same order the card uses on the site. A
     * reader moving between the two should not have to re-find the line.
     */
    `🎯 <b>${t.alertEntry}</b>   <code>${money(signal.entry)}</code>`,
    `🏁 <b>${t.alertTarget}</b>  <code>${money(signal.takeProfit)}</code>`,
    `🛑 <b>${t.alertStop}</b>    <code>${money(signal.stopLoss)}</code>`,
    `⚖️ ${t.alertRiskReward} <b>${signal.riskReward}</b> · ${t.alertRisk(String(signal.suggestedRiskPct))}`,
    /*
     * The move to TP in percent, at 1x, next to the leverage ceiling.
     *
     * Without it the ceiling multiplies nothing a reader can see: 45x is a
     * limit on an unstated quantity. With it the arithmetic is theirs to do.
     *
     * The two are kept apart deliberately. `maxSafeLeverage` is the highest
     * leverage at which liquidation still sits past the SL — a ceiling, not a
     * recommendation — and printing it as "Leverage: 45x" would turn a
     * safety limit into an instruction.
     */
    `📈 ${t.alertToTarget}: <b>${targetPct >= 0 ? '+' : ''}${targetPct.toFixed(2)}%</b> <i>(${t.alertUnleveraged})</i>`,
    `🧮 ${t.alertLeverage}: <b>${signal.maxSafeLeverage}x</b> <i>(${t.alertLeverageNote})</i>`,
    '',
    `💡 ${escapeHtml(summary)}`,
  ];

  if (event) {
    const minutes = Math.max(0, Math.round((Date.parse(event.startsAt) - Date.now()) / 60_000));
    const when = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
    lines.push('', `📅 <b>${escapeHtml(event.title)}</b> — ${when} · ${escapeHtml(event.importance)}`);
  }

  if (stats && stats.wins + stats.losses > 0) {
    lines.push('', t.statsRate(winRate(stats), stats.wins, stats.losses));
  }

  lines.push('', t.disclaimerLong);
  return lines.join('\n');
}

/** The message sent when a tracked trade reaches its target or its stop. */
export function formatClose(trade: ClosedTrade, stats: TradeStats, locale: Locale = 'en'): string {
  const t = dict(locale);
  const won = trade.outcome === 'win';
  const scratched = trade.outcome === 'breakeven';
  const meta = STRATEGY_META[trade.strategy];

  const headline = won ? t.closeWin : scratched ? t.closeBreakeven : t.closeLoss;

  return [
    `${headline} — <b>${escapeHtml(displayTicker(trade.base))}</b>`,
    `${meta.label} · <i>${trade.side === 'buy' ? t.alertLong : t.alertShort}</i>`,
    '',
    `🎯 ${t.alertEntry}   <code>${money(trade.entry)}</code>`,
    `${won ? '🏁' : scratched ? '🛡' : '🛑'} ${t.closeExit}    <code>${money(won ? trade.takeProfit : trade.stopLoss)}</code>`,
    `📈 ${t.closeResult}  <b>${trade.resultPct > 0 ? '+' : ''}${trade.resultPct}%</b>`,
    '',
    t.statsRate(winRate(stats), stats.wins, stats.losses),
  ].join('\n');
}

/**
 * Considers one batch of freshly computed signals for alerting.
 *
 * Awaited rather than fire-and-forget, so a serverless function is not torn
 * down mid-send.
 *
 * Called **once per run** over every strategy's signals together. Calling it per
 * strategy turned the per-run cap into a per-strategy one — three times the
 * messages intended — and let each strategy rank its calls in isolation.
 */
/**
 * Answers the watches this scan resolved.
 *
 * Sent per chat rather than broadcast, and deliberately without consulting the
 * channel preferences: a watch is a question one person asked about one setup,
 * and honouring a "no swing alerts" setting here would mean the Track button
 * silently did nothing for most of the people who pressed it. Asking to be told
 * about a specific setup is the stronger statement of the two.
 *
 * A mute is still respected. Somebody who asked for two hours of quiet asked
 * for it about everything.
 *
 * `takeTriggered` removes each watch as it hands it over, so a send that fails
 * costs one notification rather than leaving a watch to fire again on every
 * scan for as long as the call stands.
 */
export async function notifyWatches(
  signals: Signal[],
  event: MacroEvent | undefined,
): Promise<{ fired: number; failed: number }> {
  if (!telegramConfigured()) return { fired: 0, failed: 0 };

  const hits = await takeTriggered(signals);
  if (!hits.length) return { fired: 0, failed: 0 };

  const stats = await loadStats();
  let fired = 0;
  let failed = 0;

  for (const { watch, signal } of hits) {
    if (await mutedUntil(watch.chatId)) continue;

    const prefs = await getPrefs(watch.chatId);
    const t = dict(prefs.locale);
    const label = STRATEGY_META[signal.strategy]?.label ?? signal.strategy;
    const head = t.watchTriggered(displayTicker(signal.base), label);
    const body = formatAlert(signal, signal.summary.text, event, stats, prefs.locale);

    const result = await sendTelegramMessage(head + '\n\n' + body, {
      chatId: watch.chatId,
      keyboard: signalKeyboard(prefs, signal.symbol),
    });

    if (result.delivered) fired += 1;
    else failed += 1;
  }

  if (fired || failed) console.info(`[watches] ${fired} answered, ${failed} failed`);
  return { fired, failed };
}

export async function notifySignals(signals: Signal[], event: MacroEvent | undefined): Promise<AlertRun> {
  const empty: AlertRun = { sent: 0, failed: 0, dropped: 0, deliveries: 0, pruned: 0 };
  if (!telegramConfigured()) return empty;

  const [state, stats] = await Promise.all([
    getJson<Record<string, AlertState>>(ALERTS_KEY, {}),
    loadStats(),
  ]);
  const now = Date.now();
  let dirty = false;

  /*
   * One read for the whole batch. The scan touches 150 tickers and asking the
   * store per candidate would cost more than the scan itself; the document is
   * small, and nothing else writes it while a run is in flight.
   */
  let cooldown = await loadCooldown();

  const candidates: Signal[] = [];
  const blockedByRate: Record<string, number> = {};

  for (const signal of signals) {
    const key = keyFor(signal);
    const previous = state[key];

    if (signal.verdict === 'wait') {
      // Remember the flip to `wait` so the next call counts as a transition.
      if (previous && previous.verdict !== 'wait') {
        state[key] = { ...previous, verdict: 'wait' };
        dirty = true;
      }
      continue;
    }

    /*
     * Checked here, before anything is formatted or sent, rather than at
     * `openTrade` where the ledger would refuse a call the channel had already
     * announced. A silenced signal should leave no trace anywhere.
     */
    const rejection = cooldownFor(cooldown, signal.base, now);
    if (rejection) {
      blockedByRate[rejection] = (blockedByRate[rejection] ?? 0) + 1;
      continue;
    }

    // The same call standing is not news, whatever the cooldown says.
    if (previous?.verdict === signal.verdict) continue;

    const reversal = previous ? previous.verdict !== 'wait' && previous.verdict !== signal.verdict : false;
    const cooling = previous ? now - previous.sentAt < env.telegramCooldownMs : false;
    if (cooling && !reversal) continue;

    candidates.push(signal);
  }

  /*
   * Scanning 150 pairs can confirm a dozen calls in one run, and a channel that
   * fires a dozen messages at once is one nobody reads. Conviction decides which
   * survive the cap, and the rest are reported as dropped rather than vanishing.
   */
  for (const [reason, count] of Object.entries(blockedByRate)) {
    console.info(`[alerts] ${count} call(s) held back — ${reason}`);
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const chosen = candidates.slice(0, env.alertsMaxPerRun);
  const dropped = candidates.length - chosen.length;
  if (dropped > 0) console.warn(`[alerts] ${dropped} confirmed call(s) suppressed by the per-run cap`);

  let sent = 0;
  let failed = 0;
  let deliveries = 0;
  let pruned = 0;
  let cooldownDirty = false;

  for (const signal of chosen) {
    const key = keyFor(signal);
    const previous = state[key];

    const result = await broadcast(
      async ({ chatId, prefs }) => {
        const body = formatAlert(signal, signal.summary.text, event, stats, prefs.locale);
        const sizing = await sizingLine(chatId, signal, prefs.locale);
        return sizing ? `${body}

${sizing}` : body;
      },
      (prefs) => signalKeyboard(prefs, signal.symbol),
      signal.strategy,
      'signals',
    );
    deliveries += result.delivered;
    pruned += result.pruned;
    dirty = true;

    /*
     * A call counts as published if anyone received it, and also if there was
     * nobody to receive it. Muting a phone is a delivery preference, not a
     * change to the call — letting it stop the ledger would leave the win rate
     * with holes wherever the only subscriber wanted an evening off.
     */
    if (result.delivered > 0 || result.silent) {
      /*
       * State is committed *after* delivery, not before. Marking the pair as
       * alerted up front meant a failed send still started its ninety-minute
       * quiet period: the message never arrived, nothing retried it, and the
       * pair went silent for an hour and a half as though it had been announced.
       */
      state[key] = { verdict: signal.verdict, sentAt: now, failures: 0 };

      /*
       * The asset's quiet period starts on the same condition that commits the
       * alert state, and for the same reason: a send that failed announced
       * nothing, and silencing the ticker for twelve hours over a message
       * nobody received would be the failure costing twice.
       */
      cooldown = noteAccepted(cooldown, signal.base, now);
      cooldownDirty = true;

      if (!result.silent) sent += 1;
      // Only track what was actually published, so the record matches the channel.
      const { trade } = await openTrade(signal);
      /*
       * The cards are filed against the trade, not the signal, because the
       * trade is what later events are about. A call that was published but
       * refused by the ledger — unusable levels — files nothing, and the
       * updater finds no cards and does nothing, which is correct.
       */
      if (trade) await rememberCards(trade.id, result.cards);
      continue;
    }

    failed += 1;
    const failures = (previous?.failures ?? 0) + 1;

    if (result.permanent || failures >= MAX_DELIVERY_FAILURES) {
      /*
       * Nothing more to try. The verdict is recorded anyway so a permanently
       * unsendable call — malformed, or a chat the bot has been removed from —
       * cannot pin the pair in a retry loop on every run from now on.
       */
      console.error(
        `[alerts] giving up on ${key} after ${failures} failed run(s)${result.permanent ? ' — not retryable' : ''}`,
      );
      state[key] = { verdict: signal.verdict, sentAt: now, failures: 0 };
    } else {
      // Left un-alerted on purpose: the next run sees the same transition again.
      state[key] = {
        verdict: previous?.verdict ?? 'wait',
        sentAt: previous?.sentAt ?? 0,
        failures,
      };
    }
  }

  if (dirty) await setJson(ALERTS_KEY, state);
  // Written once per run, only when something actually claimed a slot.
  if (cooldownDirty) await saveCooldown(cooldown);
  return { sent, failed, dropped, deliveries, pruned };
}

/**
 * Updates the cards a trade was announced on, instead of announcing again.
 *
 * The whole point of the ladder is that a call now has several moments worth
 * reporting: a rung booked, the stop pulled to entry, the remainder settled.
 * Sending each of those as its own message would turn a good week into thirty
 * notifications about trades the reader already knows they are in. Editing puts
 * the same information where they will look for it — under the call itself.
 *
 * Returns how many messages were rewritten, which is a diagnostic rather than a
 * success condition: a card that could not be edited is a card one event out of
 * date, and nothing downstream depends on it.
 */
export async function notifyProgress(
  progressed: Progress[],
  closed: ClosedTrade[],
): Promise<number> {
  if (!telegramConfigured()) return 0;

  const keyboard = (symbol: string) => (locale: Locale) =>
    signalKeyboard({ locale } as Prefs, symbol);

  let edited = 0;

  for (const { trade, filled } of progressed) {
    /*
     * The card first, then the ping. A reader whose notification arrives before
     * the message it points at has been rewritten taps through to a card that
     * still says the target is pending — and distrusts both.
     */
    edited += await updateCards(trade, { keyboard: keyboard(trade.symbol) });

    /*
     * Recipient policy stays here rather than in the cards module, which knows
     * about messages and nothing about who wants them. A rung filling is an
     * `updates` event for this trade's strategy, and mutes apply.
     */
    const { send } = await activeRecipients(trade.strategy, 'updates');
    await announceFills(trade, filled, new Set(send.map((recipient) => recipient.chatId)));
  }

  /*
   * A closed trade gets one last edit and then its cards are dropped. Dropping
   * them matters: these keys are per trade and nothing else would ever delete
   * them, so skipping this would leave one small orphan in the store for every
   * call the bot has ever published.
   */
  for (const trade of closed) {
    if (!trade.targets?.length) continue;
    edited += await updateCards(trade, { closed: trade, keyboard: keyboard(trade.symbol) });
    await forgetCards(trade.id);
  }

  return edited;
}

/**
 * Publishes a call the engine did not find.
 *
 * The webhook path. It skips everything `notifySignals` does to decide *whether*
 * to speak — the transition guard, the cooldown, the per-run cap ranked by
 * conviction — because none of those questions apply: somebody set this alert
 * deliberately and firing it is the answer. What it does not skip is the ledger,
 * the ladder or the cards, so an external call is a first-class trade from the
 * moment it lands.
 *
 * Returns the trade so the caller can answer the webhook with something more
 * useful than `ok`, and `undefined` when the ledger refused the levels.
 */
export async function publishExternalSignal(
  signal: Signal,
  event?: MacroEvent,
): Promise<{
  trade?: ActiveTrade;
  delivered: number;
  superseded?: string;
  reason?: RefusalReason;
}> {
  if (!telegramConfigured()) {
    const { trade, superseded, reason } = await openTrade(signal);
    return {
      trade,
      delivered: 0,
      ...(superseded ? { superseded: superseded.base } : {}),
      ...(reason ? { reason } : {}),
    };
  }

  const stats = await loadStats();
  const result = await broadcast(
    async ({ chatId, prefs }) => {
      const body = formatAlert(signal, signal.summary.text, event, stats, prefs.locale);
      const sizing = await sizingLine(chatId, signal, prefs.locale);
      return sizing ? `${body}\n\n${sizing}` : body;
    },
    (prefs) => signalKeyboard(prefs, signal.symbol),
    signal.strategy,
    'signals',
  );

  /*
   * Opened after the broadcast, like the engine path, and for the same reason:
   * the cards are filed against the trade id, so the trade has to exist to file
   * them against and the messages have to exist to be filed.
   */
  const { trade, superseded, reason } = await openTrade(signal);
  if (trade) await rememberCards(trade.id, result.cards);

  return {
    trade,
    delivered: result.delivered,
    ...(superseded ? { superseded: superseded.base } : {}),
    ...(reason ? { reason } : {}),
  };
}

/**
 * Sends the end-of-day summary to everyone who still wants results.
 *
 * On the results channel rather than a channel of its own. Somebody who turned
 * off "did the trade win" has already said they do not want the bot reporting
 * outcomes at them, and a daily digest of outcomes is the same request answered
 * once instead of ten times — a new switch would only let them turn it off
 * twice.
 */
export async function publishDailyReport(
  render: (locale: Locale) => Promise<string>,
): Promise<number> {
  if (!telegramConfigured()) return 0;

  const result = await broadcast(
    ({ prefs }) => render(prefs.locale),
    undefined,
    undefined,
    'results',
  );

  return result.delivered;
}

/**
 * Says, quietly, that a trade ran out of time.
 *
 * These used to close in silence. That was right when the only silent outcome
 * was a call that never went anywhere — but a laddered trade can time out
 * having already booked a rung, so "expired" now covers results that moved real
 * money, and a reader watching a position deserves to know it ended.
 *
 * Sent without a notification sound and on the `updates` channel, so it obeys
 * the same preferences as every other in-flight message. A trade closing on its
 * own clock is bookkeeping: worth finding when you read back, not worth waking
 * anybody for.
 */
export async function notifyTimedOut(closed: readonly ClosedTrade[]): Promise<number> {
  if (!telegramConfigured()) return 0;

  /*
   * Identified by how the remainder closed rather than by the outcome label.
   * A timed-out trade that filled a rung is graded a win or a loss like any
   * other, so the label cannot tell it apart from one that reached its target.
   */
  const timedOut = closed.filter((trade) => trade.fills?.at(-1)?.reason === 'expiry');
  if (!timedOut.length) return 0;

  let sent = 0;
  for (const trade of timedOut) {
    const days = Math.max(
      1,
      Math.round((Date.parse(trade.closedAt) - Date.parse(trade.openedAt)) / 86_400_000),
    );
    const r = realisedR(trade);

    const result = await broadcast(
      ({ prefs }) => {
        const t = dict(prefs.locale);
        return t.timedOut(
          escapeHtml(displayTicker(trade.base)),
          days,
          `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`,
        );
      },
      undefined,
      trade.strategy,
      'updates',
      { quiet: true },
    );

    if (result.delivered > 0) sent += 1;
  }

  return sent;
}

/**
 * A result somebody would actually paste into a chat.
 *
 * A rendered PNG was the obvious reading of "shareable card", and the wrong one
 * here: this runs on a serverless function with no fonts and no canvas, and
 * shipping a headless renderer to draw six numbers would cost more cold-start
 * than the whole scan. A monospace block forwards natively in Telegram, survives
 * a screenshot, and can be copied as text — which a picture cannot.
 *
 * Kept deliberately narrow so it does not wrap on a phone.
 */
export function resultCard(trade: ClosedTrade, locale: Locale): string {
  const t = dict(locale);
  const long = trade.side === 'buy';

  const headline =
    trade.outcome === 'win' ? t.cardWin : trade.outcome === 'breakeven' ? t.cardScratch : t.cardLoss;

  const roi = `${trade.resultPct > 0 ? '+' : ''}${trade.resultPct}%`;
  const risk = Math.abs(trade.entry - (trade.initialStopLoss ?? trade.stopLoss));
  const rr = risk > 0 ? (Math.abs(trade.takeProfit - trade.entry) / risk).toFixed(1) : '—';

  const heldMinutes = Math.max(1, Math.round((Date.parse(trade.closedAt) - Date.parse(trade.openedAt)) / 60_000));
  const hours = Math.floor(heldMinutes / 60);
  const minutes = heldMinutes % 60;
  // "3h 0m" is noise; a whole number of hours should read as one.
  const held = hours ? (minutes ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

  /*
   * The column is measured, not guessed. A fixed width fit "Held" and "ROI" and
   * broke the moment German wanted "Gehalten" — the labels are translated, so
   * the alignment has to be computed from whichever ones this locale uses.
   */
  const labels = [t.cardRoi, t.cardRR, t.cardHeld];
  const width = Math.max(...labels.map((label) => label.length));
  const pad = (label: string, value: string): string => `${label.padEnd(width)}  ${value}`;

  return [
    '<pre>',
    `┌─ ${headline}`,
    `│`,
    `│ ${displayTicker(trade.base)}  ${long ? t.alertLong : t.alertShort}`,
    `│`,
    `│ ${pad(t.cardRoi, roi)}`,
    `│ ${pad(t.cardRR, rr)}`,
    `│ ${pad(t.cardHeld, held)}`,
    `│`,
    `└─ ${t.cardFooter}`,
    '</pre>',
  ].join('\n');
}

/** Announces trades that reached their target or stop. */
export async function notifyClosed(closed: ClosedTrade[], stats: TradeStats): Promise<number> {
  if (!telegramConfigured() || !closed.length) return 0;

  let sent = 0;
  for (const trade of closed) {
    /*
     * Only decisive outcomes are announced. An expired or superseded call is
     * bookkeeping — telling the channel about it would be noise, and dressing
     * it up as a result would be worse.
     */
    if (trade.outcome !== 'win' && trade.outcome !== 'loss' && trade.outcome !== 'breakeven') continue;

    /*
     * Filtered on `results` but not on strategy. How a call ended is owed to
     * whoever was told of it, so the strategy they have since turned off is not
     * grounds to withhold it — but somebody who explicitly switched results off
     * has asked not to hear this, and the panel warned them what that means.
     */
    const result = await broadcast(
      ({ prefs }) => {
        const body = formatClose(trade, stats, prefs.locale);
        /*
         * The card rides along with a win only. Nobody forwards a stop-out, and
         * attaching one would read as the bot asking to be shared at the reader's
         * expense.
         */
        return trade.outcome === 'win' ? `${body}

${resultCard(trade, prefs.locale)}` : body;
      },
      undefined,
      undefined,
      'results',
    );
    if (result.delivered > 0) sent += 1;
    else if (!result.silent) console.error(`[alerts] close notice for ${trade.base} reached nobody`);
  }
  return sent;
}

/**
 * Sends the highest-conviction signal on the board as a test.
 *
 * Deliberately a real signal rather than an invented one: it proves the whole
 * path — engine, formatter, Bot API, chat id — and shows exactly what a live
 * alert will look like, using today's numbers.
 */
export async function sendTestAlert(
  signals: Signal[],
  event: MacroEvent | undefined,
): Promise<{ sent: boolean; reason?: string }> {
  if (!telegramConfigured()) return { sent: false, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing' };
  if (!signals.length) return { sent: false, reason: 'no signals available to sample' };

  const sample = signals.reduce((best, item) => (item.confidence > best.confidence ? item : best));
  const shaped: Signal =
    sample.verdict === 'wait'
      ? { ...sample, verdict: sample.direction === 'short' ? 'sell' : 'buy' }
      : sample;

  const header =
    sample.verdict === 'wait'
      ? '🧪 <b>TEST</b> — no confirmed call right now, so this is the strongest current setup shown as it would arrive:'
      : '🧪 <b>TEST</b> — this is a live call, resent on request:';

  const stats = await loadStats();
  const sent = await sendTelegramMessage(
    `${header}\n\n${formatAlert(shaped, shaped.summary.text, event, stats)}`,
  );
  return sent ? { sent: true } : { sent: false, reason: 'Telegram rejected the message — see /api/health' };
}

export const alertsStatus = () => ({ cooldownMs: env.telegramCooldownMs });
