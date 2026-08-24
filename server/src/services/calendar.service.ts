import { env } from '../config/env.js';
import type { EventCategory, MacroEvent } from '../types/domain.js';
import { cache } from '../utils/cache.js';

/**
 * The real economic calendar.
 *
 * This replaced a fixture whose events were computed by rolling a known anchor
 * forward, and — worse — carried hand-written `forecast` and `previous` values.
 * A trading dashboard stating "Forecast 4.00%–4.25%" as fact when nobody
 * published that number is the most damaging kind of wrong, so nothing here is
 * invented: dates, impact ratings, forecasts and prior readings all come from
 * the feed, and anything the feed does not provide is simply absent.
 *
 * The feed covers the current week and rolls over weekly. Late in the week the
 * list legitimately runs short; the API returns what is left rather than
 * padding it.
 */
const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

interface RawEvent {
  title: string;
  /** Currency code, e.g. `USD` — the feed's stand-in for a region. */
  country: string;
  /** ISO 8601 with offset. */
  date: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  forecast?: string;
  previous?: string;
}

/** Currencies whose prints actually move crypto. */
const TRACKED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'ALL']);

/**
 * Crypto trades against the dollar, so a US print moves this tape harder than
 * the same print out of Frankfurt or Tokyo. This is the weight that pushes the
 * FOMC ahead of a German ifo survey in the queue.
 */
const CURRENCY_WEIGHT: Record<string, number> = { USD: 14, ALL: 6, EUR: 4, GBP: 2, JPY: 2, CNY: 2 };

const REGION: Record<string, string> = {
  USD: 'US',
  EUR: 'EU',
  GBP: 'UK',
  JPY: 'JP',
  CNY: 'CN',
};

const IMPORTANCE: Record<string, MacroEvent['importance']> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Holiday: 'low',
};

/** Base volatility expectation from the feed's own impact rating. */
const BASE_IMPACT: Record<MacroEvent['importance'], number> = { high: 82, medium: 54, low: 26 };

/**
 * Prints with a track record of moving crypto beyond their headline rating.
 * These are the ones a crypto desk actually clears the book for.
 */
const AMPLIFIERS = [
  'fomc',
  'federal funds',
  'rate decision',
  'interest rate',
  'cpi',
  'pce',
  'non-farm',
  'nonfarm',
  'payroll',
  'unemployment rate',
  'gdp',
  'ppi',
  'retail sales',
  'sec ',
  'fed chair',
  'powell',
];

const CATEGORY_RULES: [RegExp, EventCategory][] = [
  [/fomc|rate (decision|statement)|monetary policy|federal funds|boe |boj |ecb |central bank|press conf/i, 'monetary'],
  [/speaks|speech|testimony|hearing|summit|election|tariff|budget|debt ceiling/i, 'political'],
  [/bitcoin|crypto|etf|blockchain/i, 'crypto'],
];

const categoryFor = (title: string): EventCategory =>
  CATEGORY_RULES.find(([pattern]) => pattern.test(title))?.[1] ?? 'macro';

/**
 * A stable, human-readable key for one kind of print.
 *
 * Ids have to survive the weekly feed rollover so translations and React keys
 * stay attached, which rules out anything derived from the date.
 */
export const eventSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function toMacroEvent(raw: RawEvent): MacroEvent | undefined {
  const startsAt = new Date(raw.date);
  if (Number.isNaN(startsAt.getTime())) return undefined;

  const importance = IMPORTANCE[raw.impact] ?? 'low';
  const amplified = AMPLIFIERS.some((term) => raw.title.toLowerCase().includes(term));

  return {
    id: eventSlug(raw.title),
    title: raw.title,
    category: categoryFor(raw.title),
    importance,
    region: REGION[raw.country] ?? raw.country,
    currency: raw.country,
    startsAt: startsAt.toISOString(),
    /*
     * A derived 0–100 volatility expectation, not a published figure: the
     * feed's own impact rating, weighted up for dollar prints and for the
     * handful of releases that reliably move crypto harder than their rating
     * suggests. It drives ordering and the radar dial, nothing else.
     */
    expectedImpact: Math.min(
      99,
      BASE_IMPACT[importance] + (amplified ? 12 : 0) + (CURRENCY_WEIGHT[raw.country] ?? 0),
    ),
    // Only present when the feed actually published them.
    ...(raw.forecast ? { forecast: raw.forecast } : {}),
    ...(raw.previous ? { previous: raw.previous } : {}),
  };
}

let lastError: string | undefined;
let lastFetchedAt: number | undefined;

export const calendarStatus = () => ({
  source: 'forexfactory',
  url: FEED_URL,
  lastError: lastError ?? null,
  lastFetchedAt: lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null,
});

/** Everything still ahead of us this week, soonest first. */
async function loadCalendar(): Promise<MacroEvent[]> {
  return cache.wrap('calendar', env.calendarTtlMs, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.calendarTimeoutMs);
    try {
      const response = await fetch(FEED_URL, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'MacroSyncBot/1.0' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const raw = (await response.json()) as RawEvent[];
      lastError = undefined;
      lastFetchedAt = Date.now();

      return raw
        .filter((event) => TRACKED.has(event.country) && event.impact !== 'Holiday')
        .map(toMacroEvent)
        .filter((event): event is MacroEvent => Boolean(event))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    } finally {
      clearTimeout(timer);
    }
  });
}

async function safeCalendar(): Promise<MacroEvent[]> {
  try {
    return await loadCalendar();
  } catch (error) {
    lastError = (error as Error).message;
    console.warn('[calendar] feed unavailable:', lastError);
    // Stale beats invented; an empty list beats a fabricated one.
    return cache.stale<MacroEvent[]>('calendar') ?? [];
  }
}

export interface CalendarQuery {
  limit?: number;
  /** Low-impact prints are noise for a crypto desk and are hidden by default. */
  includeLow?: boolean;
  from?: number;
}

export interface CalendarPage {
  events: MacroEvent[];
  /** How many upcoming prints each tier holds, before `limit` is applied. */
  counts: { high: number; medium: number; low: number };
}

/**
 * Upcoming prints, chronological, with the noise removed.
 *
 * The raw feed is mostly regional surveys and second-tier releases — of 66
 * events in a typical week only nine are rated high. Showing all of them buries
 * the two that matter, so low-impact prints are dropped unless asked for, and
 * the caller is told how many were hidden.
 */
export async function getUpcomingEvents(query: CalendarQuery = {}): Promise<CalendarPage> {
  const { limit = 8, includeLow = false, from = Date.now() } = query;
  const upcoming = (await safeCalendar()).filter((event) => Date.parse(event.startsAt) > from);

  const counts = {
    high: upcoming.filter((event) => event.importance === 'high').length,
    medium: upcoming.filter((event) => event.importance === 'medium').length,
    low: upcoming.filter((event) => event.importance === 'low').length,
  };

  const visible = includeLow ? upcoming : upcoming.filter((event) => event.importance !== 'low');
  return { events: visible.slice(0, limit), counts };
}

/**
 * The next event that actually matters — low-importance noise is skipped.
 * Returns undefined when the week has run out, which the UI renders as an
 * explicit "nothing scheduled" state rather than an empty countdown.
 */
/**
 * The print the radar counts down to.
 *
 * Not simply the next event: a German business survey in two hours is not the
 * thing a crypto trader needs a countdown for, while an FOMC decision in two
 * days is. High-impact prints win, and among them the soonest — falling back to
 * moderate, and only then to whatever is left.
 */
export async function getHeadlineEvent(from = Date.now()): Promise<MacroEvent | undefined> {
  const { events } = await getUpcomingEvents({ limit: 200, includeLow: true, from });
  const byTier = (tier: MacroEvent['importance']) => events.filter((event) => event.importance === tier);

  const high = byTier('high');
  if (high.length) {
    // Among high-impact prints, the one the market weights heaviest wins ties.
    return [...high].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || b.expectedImpact - a.expectedImpact,
    )[0];
  }
  return byTier('medium')[0] ?? events[0];
}
