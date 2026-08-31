import { realisedR } from './confidence.js';
import { STRATEGY_PROFILES } from '../signal.engine.js';
import type { ClosedTrade, TradeStats } from './trades.service.js';

/**
 * The record cut three ways: today, the trailing week, and all of it.
 *
 * The three answer different questions and only the last one is a claim about
 * the strategy. A day holds a handful of trades — noise wearing a percentage —
 * and its value is operational: did the bot work today, is anything obviously
 * broken. The week is long enough to show a run turning without being long
 * enough to prove anything. Total is the record.
 *
 * They are labelled that way rather than presented side by side as equals,
 * because a reader comparing a 100% day against a 33% record will believe the
 * day, and the day is the one figure here that cannot mean anything.
 */

export interface PeriodSummary {
  /** Start of the window, or null for the whole record. */
  since: string | null;
  wins: number;
  losses: number;
  /** Always exactly wins + losses. */
  settled: number;
  /** `null` on an empty window — zero of zero is not a rate. */
  rate: number | null;
  /** Net R over the window. */
  r: number;
  /** The same window as a share of a deposit, at each setup's own risk. */
  roiPct: number;
  /**
   * Whether the log actually reaches the start of the window.
   *
   * False means the window is longer than the retained log, so the figures
   * describe part of it and would understate a busy week. Reported rather than
   * silently truncated: a partial week presented as a week is the same class of
   * error as a two-day record presented as the whole one.
   */
  complete: boolean;
}

/** Decided means the call was right or it was wrong. Nothing else counts. */
const decided = (trade: ClosedTrade): boolean => trade.outcome === 'win' || trade.outcome === 'loss';

/**
 * The record over one window of the detailed log.
 *
 * Computed per trade rather than from counters, because counters have no
 * timestamps — they are a running total and cannot be asked what happened
 * yesterday. That is the trade-off the tiers accept: they can only see as far
 * back as the log retains, and they say so.
 */
export function summarise(history: ClosedTrade[], since: Date | null): PeriodSummary {
  const from = since ? since.getTime() : -Infinity;
  const window = history.filter((trade) => decided(trade) && Date.parse(trade.closedAt) >= from);

  const wins = window.filter((trade) => trade.outcome === 'win').length;

  /*
   * The log reaches the window if anything in it closed before the window
   * opened. An empty log cannot claim coverage of anything; a window with no
   * start is covered by definition.
   */
  const oldest = history.reduce(
    (earliest, trade) => Math.min(earliest, Date.parse(trade.closedAt)),
    Infinity,
  );
  const complete = since === null || (Number.isFinite(oldest) && oldest <= from);

  const r = window.reduce((sum, trade) => sum + realisedR(trade), 0);
  const roiPct = window.reduce(
    (sum, trade) => sum + realisedR(trade) * (STRATEGY_PROFILES[trade.strategy]?.baseRiskPct ?? 0),
    0,
  );

  return {
    since: since ? since.toISOString() : null,
    wins,
    losses: window.length - wins,
    settled: window.length,
    rate: window.length ? Math.round((wins / window.length) * 100) : null,
    r: Number(r.toFixed(2)),
    roiPct: Number(roiPct.toFixed(2)),
    complete,
  };
}

/** Midnight UTC of the day `now` falls in. */
export const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const WEEK_MS = 7 * 24 * 60 * 60_000;

export interface Tiers {
  daily: PeriodSummary;
  weekly: PeriodSummary;
  total: PeriodSummary;
}

/**
 * All three tiers in one pass.
 *
 * The week is a trailing seven days rather than a calendar week, deliberately.
 * A calendar week means a Monday report covers one day and a Sunday report
 * covers seven, so the figure changes meaning as the week goes on and two
 * readings of it are never comparable. Trailing seven always answers the same
 * question.
 *
 * Total does not come from the log at all. It comes from the counters, which
 * are added to at close and never roll out — the log holds the most recent
 * closes, so a sum over it would quietly become a fortnight's record wearing
 * the word "total".
 */
export function tiers(history: ClosedTrade[], stats: TradeStats, now = new Date()): Tiers {
  return {
    daily: summarise(history, startOfUtcDay(now)),
    weekly: summarise(history, new Date(now.getTime() - WEEK_MS)),
    total: {
      since: null,
      wins: stats.wins,
      losses: stats.losses,
      settled: stats.wins + stats.losses,
      rate: stats.wins + stats.losses
        ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
        : null,
      r: stats.sums.r,
      roiPct: stats.sums.roiPct,
      complete: true,
    },
  };
}
