import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectancy, winShape } from './expectancy.js';
import type { ClosedTrade } from './trades.service.js';

/**
 * The figures that explain a losing account behind a winning record.
 *
 * The live record read 26W / 18L — a 59% win rate — and net +0.6R, while the
 * person trading it was down. Nothing was miscounted. The average win was
 * +0.72R against an average loss of exactly 1R, which needs 58.3% just to break
 * even, so the entire edge was eight tenths of a percentage point. Fees are
 * larger than that.
 */

/**
 * A settled trade with a chosen R and stop width.
 *
 * `stopPct` matters as much as the outcome: at a fixed risk per trade, a
 * tighter stop buys a proportionally larger position and pays proportionally
 * more in fees for the same R.
 */
const trade = (outcome: 'win' | 'loss', r: number, stopPct = 5): ClosedTrade => {
  const entry = 100;
  const stop = entry * (1 - stopPct / 100);
  const risk = entry - stop;

  return {
    id: `${outcome}-${r}-${Math.random()}`,
    symbol: 'XUSDT',
    base: 'X',
    strategy: 'day',
    side: 'buy',
    entry,
    stopLoss: outcome === 'loss' ? stop : entry,
    initialStopLoss: stop,
    takeProfit: entry + risk * 1.5,
    timeframe: '1h',
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    outcome,
    resultPct: 0,
    // Fills carry the result: `realisedR` reads them rather than the label.
    fills:
      outcome === 'win'
        ? [{ level: 1, price: entry + risk * r, share: 1, at: '', reason: 'target' }]
        : [{ level: 0, price: stop, share: 1, at: '', reason: 'stop' }],
  } as unknown as ClosedTrade;
};

describe('expectancy', () => {
  it('is null until something has settled', () => {
    assert.equal(expectancy([]), null);
  });

  it('reproduces the shape that made a 59% win rate lose money', () => {
    /*
     * The live distribution, in miniature: most wins are the first rung only.
     * 6 wins at +0.5R and 4 losses at -1R is 60% winning and -0.4R in total.
     */
    const history = [
      ...Array.from({ length: 6 }, () => trade('win', 0.5)),
      ...Array.from({ length: 4 }, () => trade('loss', 1)),
    ];

    const e = expectancy(history)!;

    assert.equal(e.wins, 6);
    assert.equal(e.losses, 4);
    assert.equal(Math.round(e.avgWinR * 100), 50);
    assert.equal(Math.round(e.avgLossR * 100), 100);
    assert.equal(Math.round(e.winRatePct), 60);

    /*
     * The whole point of the module. A 60% win rate looks healthy and is not:
     * this payoff needs 66.7% to break even, so the strategy is 6.7 points
     * underwater while reporting that it wins more often than it loses.
     */
    assert.equal(Math.round(e.breakEvenWinRatePct * 10) / 10, 66.7);
    assert.ok(e.marginPts < 0, 'a negative margin is a losing strategy');
    assert.equal(Math.round(e.perTradeR * 100), -10);
  });

  it('charges the tighter stop more, because it buys a bigger position', () => {
    /*
     * At a fixed risk, position size is risk divided by stop distance — so a
     * 1% stop is a position five times the size of a 5% stop, and pays five
     * times the fee for the same R. This is why a strategy of tight stops can
     * be gross-profitable and net-negative.
     */
    const wide = expectancy([trade('win', 1, 10), trade('loss', 1, 10)])!;
    const tight = expectancy([trade('win', 1, 1), trade('loss', 1, 1)])!;

    assert.ok(tight.costR > wide.costR * 5, `${tight.costR} vs ${wide.costR}`);
    // Same gross result, different net. The gross figure alone is not a plan.
    assert.equal(Math.round(wide.perTradeR * 100), Math.round(tight.perTradeR * 100));
    assert.ok(tight.netPerTradeR < wide.netPerTradeR);
  });

  it('subtracts costs from the edge rather than reporting them beside it', () => {
    const e = expectancy([trade('win', 1.45), trade('loss', 1)])!;

    assert.ok(e.costR > 0, 'a real account pays to open and close');
    assert.equal(
      Math.round(e.netPerTradeR * 10000),
      Math.round((e.perTradeR - e.costR) * 10000),
    );
  });

  it('shows where the winners actually landed', () => {
    /*
     * The number that explains the average. If most wins are the first rung,
     * the average win is pinned near it however generous the far targets look.
     */
    const shape = winShape([
      trade('win', 0.5),
      trade('win', 0.5),
      trade('win', 1.45),
      trade('loss', 1),
    ]);

    assert.deepEqual(shape, [
      { r: 0.5, count: 2 },
      { r: 1.45, count: 1 },
    ]);
  });
});
