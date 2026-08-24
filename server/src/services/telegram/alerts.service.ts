import { env } from '../../config/env.js';
import type { MacroEvent, Signal, Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';
import { loadStats, openTrade, winRate, type ClosedTrade, type TradeStats } from '../trades/trades.service.js';
import { escapeHtml, sendTelegramMessage, telegramConfigured } from './telegram.client.js';

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
    lines.push('', `📊 Win rate so far: <b>${winRate(stats)}%</b> (${stats.wins}W / ${stats.losses}L)`);
  }

  lines.push('', '<i>Model output over public market data. Not financial advice.</i>');
  return lines.join('\n');
}

/** The message sent when a tracked trade reaches its target or its stop. */
export function formatClose(trade: ClosedTrade, stats: TradeStats): string {
  const won = trade.outcome === 'win';
  const meta = STRATEGY_META[trade.strategy];

  return [
    `${won ? '✅ <b>Target hit</b>' : '❌ <b>Stopped out</b>'} — <b>${escapeHtml(trade.base)}</b>`,
    `${meta.label} · <i>${trade.side === 'buy' ? 'long' : 'short'} from ${money(trade.entry)}</i>`,
    '',
    `${won ? '🏁' : '🛑'} Exit    <code>${money(won ? trade.takeProfit : trade.stopLoss)}</code>`,
    `📈 Result  <b>${trade.resultPct > 0 ? '+' : ''}${trade.resultPct}%</b>`,
    '',
    `📊 Win rate: <b>${winRate(stats)}%</b> (${stats.wins}W / ${stats.losses}L)`,
  ].join('\n');
}

/**
 * Considers one batch of freshly computed signals for alerting.
 *
 * Awaited rather than fire-and-forget, so a serverless function is not torn
 * down mid-send. The dashboard path calls it without waiting.
 */
export async function notifySignals(signals: Signal[], event: MacroEvent | undefined): Promise<number> {
  if (!telegramConfigured()) return 0;

  const [state, stats] = await Promise.all([
    getJson<Record<string, AlertState>>(ALERTS_KEY, {}),
    loadStats(),
  ]);
  const now = Date.now();
  let sent = 0;
  let dirty = false;

  for (const signal of signals) {
    const key = keyFor(signal);
    const previous = state[key];

    if (signal.verdict === 'wait') {
      // Remember the flip to `wait` so the next call counts as a transition.
      if (previous && previous.verdict !== 'wait') {
        state[key] = { verdict: 'wait', sentAt: previous.sentAt };
        dirty = true;
      }
      continue;
    }

    // The same call standing is not news, whatever the cooldown says.
    if (previous?.verdict === signal.verdict) continue;

    const reversal = previous ? previous.verdict !== 'wait' && previous.verdict !== signal.verdict : false;
    const cooling = previous ? now - previous.sentAt < env.telegramCooldownMs : false;
    if (cooling && !reversal) continue;

    state[key] = { verdict: signal.verdict, sentAt: now };
    dirty = true;

    const delivered = await sendTelegramMessage(formatAlert(signal, signal.summary.text, event, stats));
    if (delivered) {
      sent += 1;
      // Only track what was actually announced, so the record matches the channel.
      await openTrade(signal);
    }
  }

  if (dirty) await setJson(ALERTS_KEY, state);
  return sent;
}

/** Announces trades that reached their target or stop. */
export async function notifyClosed(closed: ClosedTrade[], stats: TradeStats): Promise<number> {
  if (!telegramConfigured() || !closed.length) return 0;

  let sent = 0;
  for (const trade of closed) {
    if (await sendTelegramMessage(formatClose(trade, stats))) sent += 1;
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
