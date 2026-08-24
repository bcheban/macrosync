import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseBalanceCommand, planPosition, type Account } from './sizing.service.js';

/*
 * Sizing is arithmetic somebody will act on with money, under time pressure,
 * from a phone. A wrong figure here is not a wrong reading — it is a position
 * several times the intended size, which is why the identity it rests on is
 * asserted directly rather than through the output format.
 */

const account = (balance: number, riskPct: number): Account =>
  ({ balance, riskPct, updatedAt: '' });

const signal = (entry: number, stopLoss: number, maxSafeLeverage: number) =>
  ({ entry, stopLoss, maxSafeLeverage }) as never;

describe('position sizing', () => {
  it('sizes so the stop costs exactly the intended risk', () => {
    // $1,000 at 1% = $10 at risk. A 2% stop means a $500 position.
    const plan = planPosition(account(1000, 1), signal(100, 98, 30));

    assert.ok(plan);
    assert.equal(plan.riskAmount, 10);
    assert.equal(plan.notional, 500);

    // The identity the whole calculation rests on, checked directly.
    const lossIfStopped = plan.notional * (Math.abs(100 - 98) / 100);
    assert.equal(lossIfStopped, plan.riskAmount);
  });

  it('reads a short the same way', () => {
    // Stop 2% above entry instead of below: the distance is what matters.
    const long = planPosition(account(1000, 1), signal(100, 98, 30));
    const short = planPosition(account(1000, 1), signal(100, 102, 30));

    assert.equal(short?.notional, long?.notional);
  });

  it('leaves leverage out of the size and in the collateral', () => {
    const low = planPosition(account(1000, 1), signal(100, 98, 5));
    const high = planPosition(account(1000, 1), signal(100, 98, 25));

    /*
     * The position is identical; only the collateral differs. This is the point
     * people get wrong — leverage cannot make a trade safer, it only decides how
     * much of the account is tied up holding the same risk.
     */
    assert.equal(low?.notional, high?.notional);
    assert.equal(low?.margin, 100);
    assert.equal(high?.margin, 20);
  });

  it('needs a bigger position for a tighter stop', () => {
    const tight = planPosition(account(1000, 1), signal(100, 99, 30));
    const wide = planPosition(account(1000, 1), signal(100, 95, 30));

    assert.ok((tight?.notional ?? 0) > (wide?.notional ?? 0));
    // But both lose the same if stopped, which is the entire idea.
    assert.equal(tight?.riskAmount, wide?.riskAmount);
  });

  it('caps a position the account cannot fund, and says so', () => {
    // 10% risk on a 0.5% stop wants a 20x-balance position.
    const plan = planPosition(account(1000, 10), signal(100, 99.5, 2));

    assert.ok(plan);
    assert.equal(plan.capped, true);
    assert.ok(plan.margin <= 1000, 'margin cannot exceed the balance');
  });

  it('declines to size a call with no usable levels', () => {
    assert.equal(planPosition(account(1000, 1), signal(100, 100, 10)), null, 'stop at entry');
    assert.equal(planPosition(account(1000, 1), signal(100, 98, 0)), null, 'no leverage figure');
  });

  it('reads the command as people type it', () => {
    assert.deepEqual(parseBalanceCommand('/balance 1000 1'), { balance: 1000, riskPct: 1 });
    // Risk defaults to the figure the alerts already suggest.
    assert.deepEqual(parseBalanceCommand('/balance 500'), { balance: 500, riskPct: 1 });
    // People type what they see on their exchange.
    assert.deepEqual(parseBalanceCommand('/balance $2000 2%'), { balance: 2000, riskPct: 2 });
    // Decimal comma, as most of Europe writes it.
    assert.deepEqual(parseBalanceCommand('/balance 1500,50 0,5'), { balance: 1500.5, riskPct: 0.5 });
  });

  it('tells a thousands separator from a decimal comma', () => {
    /*
     * `$2,500` read as 2.5 is not a rounding error — it is a position a
     * thousandth of the intended size, saved without complaint.
     */
    assert.deepEqual(parseBalanceCommand('/balance $2,500 1.5'), { balance: 2500, riskPct: 1.5 });
    assert.deepEqual(parseBalanceCommand('/balance 1,234,567'), { balance: 1234567, riskPct: 1 });
    // Groups of three say separator; anything else says decimal mark.
    assert.deepEqual(parseBalanceCommand('/balance 2,5'), { balance: 2.5, riskPct: 1 });
    assert.deepEqual(parseBalanceCommand('/balance 1,50'), { balance: 1.5, riskPct: 1 });
    // A dot settles it outright.
    assert.deepEqual(parseBalanceCommand('/balance 2,500.75'), { balance: 2500.75, riskPct: 1 });
  });

  it('reads the ways somebody clears it', () => {
    /*
     * `0 0` is the obvious thing to type and used to be rejected as an invalid
     * number — the reader would see "invalid format" for doing exactly what the
     * help told them.
     */
    assert.deepEqual(parseBalanceCommand('/balance 0 0'), { reset: true });
    assert.deepEqual(parseBalanceCommand('/balance 0'), { reset: true });
    assert.deepEqual(parseBalanceCommand('/balance off'), { reset: true });
    assert.deepEqual(parseBalanceCommand('/balance reset'), { reset: true });
  });

  it('refuses input it cannot size from', () => {
    assert.deepEqual(parseBalanceCommand('/balance'), { error: 'usage' });
    assert.deepEqual(parseBalanceCommand('/balance abc'), { error: 'balance' });
    assert.deepEqual(parseBalanceCommand('/balance -100'), { error: 'balance' });
    assert.deepEqual(parseBalanceCommand('/balance 1000 0'), { error: 'risk' });
  });

  it('refuses a risk nobody should be sized into', () => {
    // Not a validation nicety: 50% on one trade is a typo or a bad day.
    assert.deepEqual(parseBalanceCommand('/balance 1000 50'), { error: 'risk-large' });
  });
});
