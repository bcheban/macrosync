import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectancy, tp1Conversion, winShape } from './expectancy.js';
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


/**
 * The measurement that decides whether the ladder stays as it is.
 *
 * Waiting for TP2 before protecting a trade costs -0.5R every time a first rung
 * reverses, and pays when it does not. Roughly 70% of TP1 fills have to convert
 * for that to be worth it, so the conversion rate is not a curiosity — it is
 * the input to `BREAKEVEN_AFTER_RUNG`.
 */
describe('the TP1 conversion tracker', () => {
  /** A trade whose fills say how far up the ladder it got. */
  const laddered = (levels: number[], finalR: number, outcome: 'win' | 'loss'): ClosedTrade => {
    const entry = 100;
    const stop = 95;
    const risk = entry - stop;
    const shares: Record<number, number> = { 1: 0.25, 2: 0.45, 3: 0.3 };

    const rungs = levels.map((level) => ({
      level,
      price: entry + risk * (level === 1 ? 1 : level === 2 ? 1.5 : 2.5),
      share: shares[level]!,
      at: '',
      reason: 'target' as const,
    }));

    const booked = rungs.reduce(
      (sum, fill) => sum + (fill.share * (fill.price - entry)) / risk,
      0,
    );
    const rest = 1 - rungs.reduce((sum, fill) => sum + fill.share, 0);
    // One closing fill priced so the whole trade lands on `finalR`.
    const exit = rest > 0 ? entry + ((finalR - booked) / rest) * risk : entry;

    return {
      id: `t${Math.random()}`,
      symbol: 'XUSDT',
      base: 'X',
      strategy: 'day',
      side: 'buy',
      entry,
      stopLoss: stop,
      initialStopLoss: stop,
      takeProfit: entry + risk * 2.5,
      timeframe: '1h',
      openedAt: '',
      closedAt: '',
      outcome,
      resultPct: 0,
      // Ran the current rule, so it counts toward the current question.
      protectAfterRung: 2,
      fills: [
        ...rungs,
        ...(rest > 0 ? [{ level: 0, price: exit, share: rest, at: '', reason: 'stop' as const }] : []),
      ],
    } as unknown as ClosedTrade;
  };

  it('counts nothing when nothing has reached the first rung', () => {
    const conversion = tp1Conversion([]);

    assert.equal(conversion.reachedTp1, 0);
    assert.equal(conversion.conversionPct, null, 'zero of zero is not a rate');
  });

  it('excludes trades that ran the rule this is deciding whether to restore', () => {
    /*
     * The trap this metric walks into if left alone.
     *
     * Under the old rule the stop moved at TP1, so a trade that filled the
     * first rung and pulled back was *closed* right there. It could not have
     * reached TP2. Counting it as a failure to convert argues for a rollback
     * using evidence manufactured by the thing being rolled back to — and on
     * the live record that read 28% against a 53% threshold, which is a
     * recommendation to undo the change based on data that cannot see it.
     */
    const oldRule = { ...laddered([1], -0.5, 'loss'), protectAfterRung: 1 } as ClosedTrade;
    const currentRule = laddered([1, 2], 0.925, 'win');

    const conversion = tp1Conversion([oldRule, currentRule]);

    assert.equal(conversion.reachedTp1, 1, 'only the trade that ran this rule');
    assert.equal(conversion.otherRule, 1, 'and the other is reported, not hidden');
    assert.equal(conversion.conversionPct, 100);
  });

  it('splits TP1 fills into converted, stalled and rescued', () => {
    const history = [
      laddered([1, 2, 3], 1.675, 'win'),
      laddered([1, 2], 0.925, 'win'),
      // TP1 only, back to the stop: the -0.5R the bet is against.
      laddered([1], -0.5, 'loss'),
      laddered([1], -0.5, 'loss'),
      // TP1 only, but expired above entry — neither the win nor the loss.
      laddered([1], 0.1, 'win'),
    ];

    const conversion = tp1Conversion(history);

    assert.equal(conversion.reachedTp1, 5);
    assert.equal(conversion.reachedTp2, 2);
    assert.equal(conversion.stalled, 2);
    assert.equal(conversion.rescued, 1, 'flat-or-better is counted apart, not folded in');
    assert.equal(Math.round(conversion.conversionPct!), 40);
  });

  it('derives the threshold from the ladder rather than quoting it', () => {
    /*
     * At 25% on the first rung and 45% on the second, protecting at TP1 banks
     * +0.25R, converting banks +0.925R and stalling costs -0.5R. The break-even
     * conversion is (0.25 + 0.5) / (0.925 + 0.5) — about 53%.
     *
     * Computed rather than hard-coded so a retuned ladder cannot leave a stale
     * number on screen arguing for a rule nobody is running.
     */
    const conversion = tp1Conversion([laddered([1], -0.5, 'loss')]);

    assert.ok(conversion.breakEvenPct > 50 && conversion.breakEvenPct < 56, String(conversion.breakEvenPct));
  });

  it('says when the sample is too small to act on', () => {
    const thin = tp1Conversion([laddered([1, 2], 0.925, 'win')]);
    assert.equal(thin.reliable, false);

    const enough = tp1Conversion(
      Array.from({ length: 20 }, () => laddered([1, 2], 0.925, 'win')),
    );
    assert.equal(enough.reliable, true);
  });
});
