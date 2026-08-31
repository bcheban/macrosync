import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resetMemoryStore } from '../store/store.js';
import { summarise, tiers } from './periods.js';
import { dueDate } from '../telegram/daily-report.js';
import type { ClosedTrade, TradeStats } from './trades.service.js';

/**
 * The tiers are where a scope error is easiest to make and hardest to see: a
 * day, a week and the record all render as a percentage, and nothing about the
 * output says which of them can be trusted. These pin the two things that keep
 * them honest — each window counts only what closed inside it, and the total
 * never comes from the log.
 */

const HOUR = 60 * 60_000;

/** A settled day trade, closed `agoHours` ago. Long from 100, risking 5. */
const closed = (outcome: 'win' | 'loss', agoHours: number, id: string): ClosedTrade =>
  ({
    id,
    symbol: 'XUSDT',
    base: 'X',
    strategy: 'day',
    side: 'buy',
    entry: 100,
    stopLoss: 95,
    initialStopLoss: 95,
    takeProfit: 107.5,
    timeframe: '1h',
    openedAt: new Date(Date.now() - (agoHours + 1) * HOUR).toISOString(),
    closedAt: new Date(Date.now() - agoHours * HOUR).toISOString(),
    outcome,
    resultPct: outcome === 'win' ? 7.5 : -5,
  }) as ClosedTrade;

const stats = (over: Partial<TradeStats> = {}): TradeStats => ({
  wins: 40,
  losses: 79,
  expired: 0,
  superseded: 0,
  voided: 0,
  breakeven: 0,
  byStrategy: { day: { wins: 40, losses: 79 } },
  sums: { r: -19, roiPct: -14.25, settled: 119 },
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('the tiered record', () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it('counts only what closed inside the window', () => {
    // Two today, one four days back, one a fortnight back.
    const history = [closed('win', 1, 'a'), closed('loss', 2, 'b'), closed('win', 96, 'c'), closed('loss', 336, 'd')];

    const now = new Date();
    const cut = tiers(history, stats(), now);

    // The day window opens at midnight UTC, so "an hour ago" is only in it
    // when the clock has passed 01:00 — the assertion has to be about the
    // window, not about a fixed count.
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const expectedToday = history.filter((trade) => Date.parse(trade.closedAt) >= midnight).length;

    assert.equal(cut.daily.settled, expectedToday);
    assert.equal(cut.weekly.settled, 3, 'the fortnight-old close is outside seven days');
    assert.equal(cut.weekly.wins + cut.weekly.losses, cut.weekly.settled);
  });

  it('takes the total from the counters, never from the log', () => {
    /*
     * The distinction the whole tier system rests on. The log here holds two
     * trades; the record holds 119. A total summed from the log would be a
     * fortnight's trading wearing the words "all time".
     */
    const history = [closed('win', 1, 'a'), closed('loss', 2, 'b')];
    const cut = tiers(history, stats());

    assert.equal(cut.total.settled, 119);
    assert.equal(cut.total.r, -19);
    assert.equal(cut.total.roiPct, -14.25);
    assert.equal(cut.total.settled, cut.total.wins + cut.total.losses);
  });

  it('says when the log no longer reaches the start of the window', () => {
    // Nothing older than two days, so a seven-day window is partly unseen.
    const history = [closed('win', 12, 'a'), closed('loss', 40, 'b')];
    const cut = tiers(history, stats());

    assert.equal(cut.weekly.complete, false, 'a partial week must not pass as a week');
    assert.equal(cut.total.complete, true);
  });

  it('reports a window with nothing in it as empty rather than as zero percent', () => {
    const empty = summarise([], new Date(Date.now() - 24 * HOUR));

    assert.equal(empty.settled, 0);
    assert.equal(empty.rate, null, 'zero of zero is not a win rate');
    assert.equal(empty.r, 0);
  });
});

describe('when the daily report is due', () => {
  it('waits for the day to end before reporting it', () => {
    // 23:58 UTC: today is still running, so yesterday is the day owed.
    assert.equal(dueDate(new Date('2026-08-30T23:58:00Z')), '2026-08-29');
    assert.equal(dueDate(new Date('2026-08-30T23:59:00Z')), '2026-08-30');
    assert.equal(dueDate(new Date('2026-08-30T12:00:00Z')), '2026-08-29');
  });

  it('still owes yesterday after midnight has passed', () => {
    /*
     * The case a fixed 23:59 trigger gets wrong. A pinger that fires every five
     * minutes may land at 00:02 and never on the minute, and an outage can span
     * midnight entirely — so the report is owed for the last day that ended,
     * not for the minute that was missed.
     */
    assert.equal(dueDate(new Date('2026-08-31T00:02:00Z')), '2026-08-30');
    assert.equal(dueDate(new Date('2026-08-31T06:00:00Z')), '2026-08-30');
  });
});
