import { getJson, setJson, storeKey } from '../store/store.js';
import { loadHistory, loadStats } from '../trades/trades.service.js';
import { summarise, tiers, startOfUtcDay } from '../trades/periods.js';
import { dict } from './i18n/index.js';
import type { Locale } from './preferences.service.js';
import type { PeriodSummary } from '../trades/periods.js';

/**
 * The end-of-day summary, published once per UTC day.
 *
 * Driven by the same five-minute pinger that runs the scan rather than by a
 * scheduler of its own. A second schedule is a second thing to configure, a
 * second secret to rotate and a second thing to notice has stopped; piggybacking
 * costs one date comparison per run and cannot silently stop while the bot is
 * still alerting.
 *
 * Which means the trigger cannot be "it is 23:59" — the pinger may land at
 * 23:57 and 00:02 and never on the minute. It is "the most recent 23:59 has
 * passed and its report has not gone out", which fires exactly once whatever
 * the pinger does, including after an outage that spanned midnight.
 */

const MARKER_KEY = storeKey('telegram:daily-report');

/** The hour and minute, UTC, the day is considered closed for reporting. */
const REPORT_HOUR = 23;
const REPORT_MINUTE = 59;

interface Marker {
  /** `YYYY-MM-DD` of the last day reported. */
  date: string;
}

const isoDate = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * The day whose report is now due.
 *
 * Before 23:59 that is yesterday — today is still running and reporting it
 * would publish a part-day as a day. From 23:59 it is today.
 */
export function dueDate(now: Date): string {
  const past =
    now.getUTCHours() > REPORT_HOUR ||
    (now.getUTCHours() === REPORT_HOUR && now.getUTCMinutes() >= REPORT_MINUTE);

  if (past) return isoDate(now);
  return isoDate(new Date(now.getTime() - 24 * 60 * 60_000));
}

/** One tier as a line: rate, record, R and the deposit share. */
function line(label: string, period: PeriodSummary, locale: Locale): string {
  const t = dict(locale);
  if (!period.settled) return t.reportQuiet(label);

  return t.reportRow(
    label,
    period.rate ?? 0,
    period.wins,
    period.losses,
    `${period.r >= 0 ? '+' : ''}${period.r.toFixed(1)}R`,
    `${period.roiPct >= 0 ? '+' : ''}${period.roiPct.toFixed(2)}%`,
  );
}

/**
 * Renders the report for one UTC day.
 *
 * The day being reported is not necessarily the day this runs — after an
 * outage it can be a day that has fully passed — so the window is derived from
 * the date rather than from the clock.
 */
export async function renderDailyReport(date: string, locale: Locale): Promise<string> {
  const t = dict(locale);
  const [history, stats] = await Promise.all([loadHistory(), loadStats()]);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const closedThatDay = history.filter((trade) => {
    const at = Date.parse(trade.closedAt);
    return at >= dayStart.getTime() && at < dayEnd.getTime();
  });

  const day = summarise(closedThatDay, dayStart);
  const { weekly, total } = tiers(history, stats, dayEnd);

  const lines = [
    t.reportTitle(date),
    '',
    line(t.reportDay, day, locale),
    line(t.reportWeek, weekly, locale),
    line(t.reportTotal, total, locale),
  ];

  // Said only when it is true, and it is true whenever the log has rolled.
  if (!weekly.complete) lines.push('', t.reportPartialWeek);

  lines.push('', t.reportFootnote);
  return lines.join('\n');
}

/**
 * Publishes the report if one is due, and records that it went out.
 *
 * The marker is written **before** the send rather than after. A send that
 * half-worked and then threw would otherwise be retried on the next run five
 * minutes later, and the failure mode of a duplicate daily report is worse than
 * the failure mode of a missing one: the first is noise nobody can undo, the
 * second is one quiet evening.
 */
export async function maybePublishDailyReport(
  publish: (render: (locale: Locale) => Promise<string>) => Promise<number>,
  now = new Date(),
): Promise<{ published: boolean; date: string; delivered?: number }> {
  const date = dueDate(now);
  const marker = await getJson<Marker | null>(MARKER_KEY, null);

  /*
   * A deployment that has never reported adopts the current day silently.
   *
   * Otherwise the first run after this shipped would publish a report for a day
   * that ended before the feature existed — to every subscriber, unprompted.
   * One skipped report on the first day is the cheaper mistake.
   */
  if (!marker) {
    await setJson(MARKER_KEY, { date });
    return { published: false, date };
  }

  if (marker.date >= date) return { published: false, date };

  await setJson(MARKER_KEY, { date });
  const delivered = await publish((locale) => renderDailyReport(date, locale));

  return { published: true, date, delivered };
}

export { startOfUtcDay };
