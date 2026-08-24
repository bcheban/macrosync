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
import { activeRecipients, unsubscribe } from './subscribers.service.js';
import { getAccount, planPosition } from './sizing.service.js';
import type { ActiveTrade } from '../trades/trades.service.js';

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

/** Buttons carried under every alert. `callback_data` is capped at 64 bytes. */
const SIGNAL_KEYBOARD: InlineKeyboard = [
  [
    { text: '📊 Stats', callback_data: 'stats' },
    { text: '🛑 Mute 2h', callback_data: 'mute:2' },
  ],
];

interface BroadcastResult {
  delivered: number;
  failed: number;
  pruned: number;
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
async function broadcast(
  render: string | ((chatId: string) => Promise<string> | string),
  keyboard?: InlineKeyboard,
  strategy?: Strategy,
): Promise<BroadcastResult> {
  const { send, filtered } = await activeRecipients(strategy);
  if (filtered.length) console.info(`[alerts] ${filtered.length} recipient(s) have ${strategy} turned off`);

  if (!send.length) return { delivered: 0, failed: 0, pruned: 0, silent: true, permanent: false };

  let delivered = 0;
  let failed = 0;
  let pruned = 0;
  let retryable = 0;

  for (const chatId of send) {
    try {
      /*
       * Rendered per recipient rather than once. A subscriber who has told the
       * bot their deposit gets a position size worked out for them, and one who
       * has not gets the same message without that line — so the body is no
       * longer a constant that can be built ahead of the loop.
       */
      const html = typeof render === 'string' ? render : await render(chatId);
      const result = await sendTelegramMessage(html, { chatId, keyboard });

      if (result.delivered) {
        delivered += 1;
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
async function sizingLine(chatId: string, signal: Signal): Promise<string | undefined> {
  const account = await getAccount(chatId);
  if (!account) return undefined;

  const plan = planPosition(account, signal);
  if (!plan) return undefined;

  const base = `💰 <b>Margin ${usd(plan.margin)}</b> at ${plan.leverage}x — risking <b>${usd(plan.riskAmount)}</b> of ${usd(account.balance)}`;

  return plan.capped
    ? `${base}
⚠️ <i>Capped at your balance: the full size for ${account.riskPct}% risk needs more collateral than the account holds.</i>`
    : base;
}

export function formatAlert(
  signal: Signal,
  summary: string,
  event: MacroEvent | undefined,
  stats?: TradeStats,
): string {
  const meta = STRATEGY_META[signal.strategy];
  const side = signal.verdict === 'buy' ? 'BUY · LONG' : 'SELL · SHORT';
  const emoji = SIDE_EMOJI[signal.verdict === 'sell' ? 'sell' : 'buy'];

  const lines = [
    `${emoji} <b>${escapeHtml(signal.base)}</b> — <b>${side}</b>`,
    `${meta.label} · <i>${escapeHtml(signal.timeframe)} bars · confluence ${signal.confidence}/100</i>`,
    '',
    `🎯 <b>Entry</b>   <code>${money(signal.entry)}</code>`,
    `🛑 <b>Stop</b>    <code>${money(signal.stopLoss)}</code>`,
    `🏁 <b>Target</b>  <code>${money(signal.takeProfit)}</code>`,
    `⚖️ R:R <b>${signal.riskReward}</b> · risk <b>${signal.suggestedRiskPct}%</b> of book`,
    `🧮 Max safe leverage: <b>${signal.maxSafeLeverage}x</b> <i>(liquidation stays past the stop)</i>`,
    `⏳ Expected duration: <b>${meta.duration}</b>`,
    '',
    `💡 ${escapeHtml(summary)}`,
  ];

  if (event) {
    const minutes = Math.max(0, Math.round((Date.parse(event.startsAt) - Date.now()) / 60_000));
    const when = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
    lines.push('', `📅 <b>${escapeHtml(event.title)}</b> in ${when} — ${escapeHtml(event.importance)} impact`);
  }

  if (stats && stats.wins + stats.losses > 0) {
    const unresolved = stats.expired ? ` · ${stats.expired} expired` : '';
    lines.push('', `📊 Win rate so far: <b>${winRate(stats)}%</b> (${stats.wins}W / ${stats.losses}L${unresolved})`);
  }

  lines.push(
    '',
    '<i>MEXC perpetuals. Model output over public market data — not financial advice.</i>',
  );
  return lines.join('\n');
}

/** The message sent when a tracked trade reaches its target or its stop. */
export function formatClose(trade: ClosedTrade, stats: TradeStats): string {
  const won = trade.outcome === 'win';
  const scratched = trade.outcome === 'breakeven';
  const meta = STRATEGY_META[trade.strategy];

  const headline = won
    ? '✅ <b>Target hit</b>'
    : scratched
      ? '🛡 <b>Closed at breakeven</b>'
      : '❌ <b>Stopped out</b>';

  return [
    `${headline} — <b>${escapeHtml(trade.base)}</b>`,
    `${meta.label} · <i>${trade.side === 'buy' ? 'long' : 'short'} from ${money(trade.entry)}</i>`,
    '',
    `${won ? '🏁' : scratched ? '🛡' : '🛑'} Exit    <code>${money(won ? trade.takeProfit : trade.stopLoss)}</code>`,
    `📈 Result  <b>${trade.resultPct > 0 ? '+' : ''}${trade.resultPct}%</b>`,
    '',
    `📊 Win rate: <b>${winRate(stats)}%</b> (${stats.wins}W / ${stats.losses}L)`,
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
export async function notifySignals(signals: Signal[], event: MacroEvent | undefined): Promise<AlertRun> {
  const empty: AlertRun = { sent: 0, failed: 0, dropped: 0, deliveries: 0, pruned: 0 };
  if (!telegramConfigured()) return empty;

  const [state, stats] = await Promise.all([
    getJson<Record<string, AlertState>>(ALERTS_KEY, {}),
    loadStats(),
  ]);
  const now = Date.now();
  let dirty = false;

  const candidates: Signal[] = [];

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
  candidates.sort((a, b) => b.confidence - a.confidence);
  const chosen = candidates.slice(0, env.alertsMaxPerRun);
  const dropped = candidates.length - chosen.length;
  if (dropped > 0) console.warn(`[alerts] ${dropped} confirmed call(s) suppressed by the per-run cap`);

  let sent = 0;
  let failed = 0;
  let deliveries = 0;
  let pruned = 0;

  for (const signal of chosen) {
    const key = keyFor(signal);
    const previous = state[key];

    const body = formatAlert(signal, signal.summary.text, event, stats);

    const result = await broadcast(
      async (chatId) => {
        const sizing = await sizingLine(chatId, signal);
        return sizing ? `${body}

${sizing}` : body;
      },
      SIGNAL_KEYBOARD,
      signal.strategy,
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
      if (!result.silent) sent += 1;
      // Only track what was actually published, so the record matches the channel.
      await openTrade(signal);
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
  return { sent, failed, dropped, deliveries, pruned };
}

/**
 * Announces a stop pulled up to entry.
 *
 * Sent to everyone unmuted, like a close notice and for the same reason: this
 * concerns a position the recipient may be holding right now, and whether they
 * have since turned that strategy off does not change that.
 */
export async function notifyBreakeven(moved: ActiveTrade[]): Promise<number> {
  if (!telegramConfigured() || !moved.length) return 0;

  let sent = 0;
  for (const trade of moved) {
    const meta = STRATEGY_META[trade.strategy];
    const html = [
      `🛡 <b>${escapeHtml(trade.base)}</b> — halfway to target`,
      `${meta.label} · <i>${trade.side === 'buy' ? 'long' : 'short'} from ${money(trade.entry)}</i>`,
      '',
      `Stop moved to entry: <code>${money(trade.entry)}</code>`,
      `<i>Was ${money(trade.initialStopLoss)}. From here the trade cannot cost you anything.</i>`,
    ].join('\n');

    const result = await broadcast(html);
    if (result.delivered > 0) sent += 1;
  }

  return sent;
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

    // No strategy filter: how a call *ended* is owed to whoever was told of it.
    const result = await broadcast(formatClose(trade, stats));
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
