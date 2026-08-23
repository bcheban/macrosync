import type { MacroEvent } from '../types/domain.js';

/**
 * Mock economic / political calendar.
 *
 * Each template has an anchor in the past plus a cadence, so `getUpcomingEvents`
 * can always roll forward to a real future timestamp — the countdown never dies,
 * whenever the demo is run. Swap this module for a real calendar feed
 * (Trading Economics, Finnhub, Investing.com) without touching the API layer.
 */
interface EventTemplate extends Omit<MacroEvent, 'startsAt'> {
  /** First known occurrence, UTC. */
  anchor: string;
  /** Days between occurrences. */
  cadenceDays: number;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'fomc-rate-decision',
    title: 'FOMC Interest Rate Decision',
    detail: 'Federal funds target range + statement. Dot plot on quarterly meetings.',
    category: 'monetary',
    importance: 'high',
    region: 'US',
    expectedImpact: 96,
    affects: ['BTC', 'ETH', 'SOL', 'SHIB'],
    previous: '4.25%–4.50%',
    forecast: '4.00%–4.25%',
    anchor: '2026-01-28T19:00:00Z',
    cadenceDays: 42,
  },
  {
    id: 'fed-chair-presser',
    title: 'Fed Chair Press Conference',
    detail: 'Unscripted Q&A — historically the widest intraday range of the session.',
    category: 'monetary',
    importance: 'high',
    region: 'US',
    expectedImpact: 88,
    affects: ['BTC', 'ETH'],
    anchor: '2026-01-28T19:30:00Z',
    cadenceDays: 42,
  },
  {
    id: 'us-cpi',
    title: 'US CPI (YoY)',
    detail: 'Headline and core inflation print. Primary driver of rate-cut repricing.',
    category: 'macro',
    importance: 'high',
    region: 'US',
    expectedImpact: 92,
    affects: ['BTC', 'ETH', 'SOL'],
    previous: '2.9%',
    forecast: '2.7%',
    anchor: '2026-01-13T13:30:00Z',
    cadenceDays: 30,
  },
  {
    id: 'us-nfp',
    title: 'US Non-Farm Payrolls',
    detail: 'Labour market strength — moves the dollar and, by extension, crypto beta.',
    category: 'macro',
    importance: 'high',
    region: 'US',
    expectedImpact: 84,
    affects: ['BTC', 'ETH'],
    previous: '164K',
    forecast: '148K',
    anchor: '2026-01-09T13:30:00Z',
    cadenceDays: 28,
  },
  {
    id: 'ecb-decision',
    title: 'ECB Monetary Policy Decision',
    detail: 'Euro-area rates. Second-order impact through the EUR/USD channel.',
    category: 'monetary',
    importance: 'medium',
    region: 'EU',
    expectedImpact: 62,
    affects: ['BTC', 'ETH'],
    anchor: '2026-01-30T13:15:00Z',
    cadenceDays: 42,
  },
  {
    id: 'sec-policy-hearing',
    title: 'Senate Banking Hearing — Digital Assets',
    detail: 'Political headline risk. Single sentences here have moved alt-caps 8%+.',
    category: 'political',
    importance: 'high',
    region: 'US',
    expectedImpact: 78,
    affects: ['SOL', 'SHIB', 'ETH'],
    anchor: '2026-01-21T15:00:00Z',
    cadenceDays: 21,
  },
  {
    id: 'g7-statement',
    title: 'G7 Leaders — Joint Statement on Tariffs',
    detail: 'Geopolitical tape bomb risk; timing is announced but content is not.',
    category: 'political',
    importance: 'medium',
    region: 'Global',
    expectedImpact: 58,
    affects: ['BTC'],
    anchor: '2026-01-17T09:00:00Z',
    cadenceDays: 35,
  },
  {
    id: 'btc-options-expiry',
    title: 'BTC & ETH Options Expiry (Deribit)',
    detail: 'Large open-interest roll-off. Pinning into expiry, gamma release after.',
    category: 'crypto',
    importance: 'medium',
    region: 'Global',
    expectedImpact: 66,
    affects: ['BTC', 'ETH'],
    anchor: '2026-01-02T08:00:00Z',
    cadenceDays: 7,
  },
  {
    id: 'etf-flows',
    title: 'US Spot ETF Net Flow Print',
    detail: 'Daily creations/redemptions across issuers — the clean spot-demand read.',
    category: 'crypto',
    importance: 'low',
    region: 'US',
    expectedImpact: 42,
    affects: ['BTC', 'ETH'],
    anchor: '2026-01-02T22:00:00Z',
    cadenceDays: 1,
  },
  {
    id: 'boj-decision',
    title: 'Bank of Japan Policy Decision',
    detail: 'Carry-trade unwind risk — the 2024 playbook for sudden crypto air pockets.',
    category: 'monetary',
    importance: 'medium',
    region: 'JP',
    expectedImpact: 70,
    affects: ['BTC', 'ETH', 'SOL'],
    anchor: '2026-01-23T03:00:00Z',
    cadenceDays: 49,
  },
];

const DAY_MS = 86_400_000;

/** Rolls a template's anchor forward until it lands in the future. */
export function nextOccurrence(anchor: string, cadenceDays: number, from = Date.now()): Date {
  const period = cadenceDays * DAY_MS;
  const anchorMs = new Date(anchor).getTime();
  if (anchorMs > from) return new Date(anchorMs);
  const periodsElapsed = Math.ceil((from - anchorMs) / period);
  return new Date(anchorMs + periodsElapsed * period);
}

export function getUpcomingEvents(limit = 8, from = Date.now()): MacroEvent[] {
  return EVENT_TEMPLATES.map(({ anchor, cadenceDays, ...event }) => ({
    ...event,
    startsAt: nextOccurrence(anchor, cadenceDays, from).toISOString(),
  }))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, limit);
}

/** The next event that actually matters — low-importance noise is skipped. */
export function getHeadlineEvent(from = Date.now()): MacroEvent {
  const upcoming = getUpcomingEvents(EVENT_TEMPLATES.length, from);
  return upcoming.find((event) => event.importance === 'high') ?? (upcoming[0] as MacroEvent);
}
