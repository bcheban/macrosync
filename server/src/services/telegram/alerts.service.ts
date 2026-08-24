import { env } from '../../config/env.js';
import type { MacroEvent, Signal } from '../../types/domain.js';
import { escapeHtml, sendTelegramMessage, telegramConfigured } from './telegram.client.js';

/**
 * Alerting for confirmed calls.
 *
 * Two guards decide whether a signal is worth a message, and both matter:
 *
 *  - **Transition.** Only a verdict that *changed into* buy or sell alerts. A
 *    call that has been standing for an hour is not news.
 *  - **Cooldown.** A score sitting on its threshold flips between buy and wait
 *    from bar to bar. Without a per-asset quiet period the channel would get
 *    the same call every time the dashboard polls — which for a scalping tab is
 *    every fifteen seconds.
 *
 * Known limitation: this state lives in memory. On a serverless deploy each
 * instance keeps its own, so a cold start can repeat an alert the previous
 * instance had already sent. The cooldown is deliberately long (90 minutes by
 * default) so the blast radius of that is small.
 */
interface AlertState {
  verdict: Signal['verdict'];
  sentAt: number;
}

const lastAlert = new Map<string, AlertState>();

const keyFor = (signal: Signal): string => `${signal.symbol}:${signal.strategy}`;

const DIRECTION_EMOJI = { buy: '🟢', sell: '🔴', wait: '⏳' } as const;

/** Prices are already rounded for display by the engine. */
const money = (value: number): string => escapeHtml(String(value));

function formatAlert(signal: Signal, summary: string, event: MacroEvent | undefined): string {
  const side = signal.verdict === 'buy' ? 'BUY · LONG' : 'SELL · SHORT';
  const lines = [
    `${DIRECTION_EMOJI[signal.verdict]} <b>${escapeHtml(signal.base)}</b> — <b>${side}</b>`,
    `<i>${escapeHtml(signal.timeframe)} · confluence ${signal.confidence}/100</i>`,
    '',
    `🎯 Entry     <code>${money(signal.entry)}</code>`,
    `🛑 Stop      <code>${money(signal.stopLoss)}</code>`,
    `🏁 Target    <code>${money(signal.takeProfit)}</code>`,
    `⚖️ R:R ${signal.riskReward} · risk ${signal.suggestedRiskPct}% of book`,
    '',
    `💡 ${escapeHtml(summary)}`,
  ];

  if (event) {
    const minutes = Math.max(0, Math.round((Date.parse(event.startsAt) - Date.now()) / 60_000));
    const when = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
    lines.push('', `📅 <b>${escapeHtml(event.title)}</b> in ${when} — ${escapeHtml(event.importance)} impact`);
  }

  lines.push('', '<i>Model output over public market data. Not financial advice.</i>');
  return lines.join('\n');
}

/**
 * Considers one batch of freshly computed signals for alerting.
 *
 * Fire-and-forget by design: the dashboard request that produced these signals
 * must not wait on Telegram, and must not fail because of it.
 */
export function notifySignals(signals: Signal[], event: MacroEvent | undefined): void {
  if (!telegramConfigured()) return;

  const now = Date.now();

  for (const signal of signals) {
    const key = keyFor(signal);
    const previous = lastAlert.get(key);

    if (signal.verdict === 'wait') {
      // Remember the flip to `wait` so the next call counts as a transition.
      if (previous && previous.verdict !== 'wait') lastAlert.set(key, { verdict: 'wait', sentAt: previous.sentAt });
      continue;
    }

    // The same call standing is not news, whatever the cooldown says.
    if (previous?.verdict === signal.verdict) continue;

    /*
     * A reversal always goes out. The cooldown exists to absorb a score
     * flapping across its threshold — which shows up as wait -> buy -> wait —
     * and buy -> sell is not that: it is the tape turning over, and anyone
     * holding the previous call needs it immediately.
     */
    const reversal = previous ? previous.verdict !== 'wait' && previous.verdict !== signal.verdict : false;
    const cooling = previous ? now - previous.sentAt < env.telegramCooldownMs : false;
    if (cooling && !reversal) continue;

    lastAlert.set(key, { verdict: signal.verdict, sentAt: now });

    const summary = signal.summary.text;
    void sendTelegramMessage(formatAlert(signal, summary, event));
  }
}

/**
 * Sends the highest-conviction signal on the board as a test.
 *
 * Deliberately a real signal rather than an invented one: it proves the whole
 * path — engine, formatter, Bot API, chat id — and shows exactly what a live
 * alert will look like, using today's numbers. The marker line makes clear it
 * was requested rather than triggered.
 */
export async function sendTestAlert(
  signals: Signal[],
  event: MacroEvent | undefined,
): Promise<{ sent: boolean; reason?: string }> {
  if (!telegramConfigured()) return { sent: false, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing' };
  if (!signals.length) return { sent: false, reason: 'no signals available to sample' };

  const sample = signals.reduce((best, item) => (item.confidence > best.confidence ? item : best));
  // A `wait` card has no side to print, so the test shows what it *would* look
  // like once the same setup confirms.
  const shaped: Signal =
    sample.verdict === 'wait'
      ? { ...sample, verdict: sample.direction === 'short' ? 'sell' : 'buy' }
      : sample;

  const header =
    sample.verdict === 'wait'
      ? '🧪 <b>TEST</b> — no confirmed call right now, so this is the strongest current setup shown as it would arrive:'
      : '🧪 <b>TEST</b> — this is a live call, resent on request:';

  const body = formatAlert(shaped, shaped.summary.text, event);
  const sent = await sendTelegramMessage(`${header}

${body}`);
  return sent ? { sent: true } : { sent: false, reason: 'Telegram rejected the message — see /api/health' };
}

/** Exposed for `/health`, so a silent channel can be diagnosed. */
export const alertsStatus = () => ({
  tracked: lastAlert.size,
  cooldownMs: env.telegramCooldownMs,
});
