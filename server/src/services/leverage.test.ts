import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { maxSafeLeverage } from './signal.engine.js';

/*
 * Leverage is the one number here that can cost somebody their whole position
 * rather than a trade. If it reads too high, the liquidation price sits inside
 * the stop and the exchange closes the position before the plan does — so every
 * rounding and every default in this calculation has to lean the same way.
 */

/** BTC-like: a deep contract with a very low maintenance requirement. */
const DEEP = { maxLeverage: 500, maintenanceMarginRate: 0.001 };
/** A thin altcoin perp, where the maintenance rate dominates. */
const THIN = { maxLeverage: 20, maintenanceMarginRate: 0.02 };

describe('max safe leverage', () => {
  it('keeps liquidation further out than the stop', () => {
    // 2% stop on a deep contract.
    const leverage = maxSafeLeverage(100, 98, DEEP);

    // Liquidation distance at this leverage, as a fraction of entry.
    const liquidation = 1 / leverage - DEEP.maintenanceMarginRate;
    const stop = 0.02;

    assert.ok(liquidation > stop, `liquidation ${liquidation} must clear the stop ${stop}`);
    // And with room to spare, not merely by a hair.
    assert.ok(liquidation >= stop * 1.5, 'the buffer must actually be applied');
  });

  it('reads the same for a short as for a long', () => {
    // Stop 2% above entry instead of below — the distance is what matters.
    assert.equal(maxSafeLeverage(100, 102, DEEP), maxSafeLeverage(100, 98, DEEP));
  });

  it('offers less on a contract with a high maintenance rate', () => {
    const deep = maxSafeLeverage(100, 98, DEEP);
    const thin = maxSafeLeverage(100, 98, THIN);

    /*
     * The whole reason the rate is fetched rather than assumed. At a 2% stop the
     * naive answer is 50x on both; the maintenance requirement alone takes the
     * thin contract to a fraction of that.
     */
    assert.ok(thin < deep, `thin ${thin} must be below deep ${deep}`);
  });

  it('never exceeds what the contract itself permits', () => {
    // A very tight stop would allow enormous leverage arithmetically.
    const leverage = maxSafeLeverage(100, 99.99, { maxLeverage: 5, maintenanceMarginRate: 0.001 });
    assert.ok(leverage <= 5, `${leverage} exceeds the contract limit`);
  });

  it('caps well below the arithmetic even where the contract allows more', () => {
    const leverage = maxSafeLeverage(100, 99.99, DEEP);

    /*
     * A 0.01% stop lets the formula return several hundred, and the contract
     * permits 500x. "Safe" describes the liquidation distance, not the size.
     */
    assert.ok(leverage <= 50, `${leverage} is not a number to put in front of anyone`);
  });

  it('leaves the stop distance visible rather than always answering the cap', () => {
    const tight = maxSafeLeverage(100, 99, DEEP); // 1% stop
    const wide = maxSafeLeverage(100, 95, DEEP); // 5% stop

    // A ceiling that hides the input it is meant to reflect is not a reading.
    assert.ok(tight > wide, `${tight} should exceed ${wide}`);
  });

  it('falls back pessimistically when the contract is unknown', () => {
    const known = maxSafeLeverage(100, 98, DEEP);
    const unknown = maxSafeLeverage(100, 98, undefined);

    // A missing spec must not read as a *permissive* one.
    assert.ok(unknown < known, `unknown ${unknown} must not beat known ${known}`);
    assert.ok(unknown >= 1);
  });

  it('rounds down, never up', () => {
    // Construct a case whose exact answer is fractional.
    const exact = 1 / (1.5 * 0.037 + 0.001);
    const leverage = maxSafeLeverage(100, 96.3, DEEP);

    assert.ok(!Number.isInteger(exact), 'the fixture should be fractional');
    assert.equal(leverage, Math.floor(exact));
  });

  it('never returns zero or a negative for a real trade', () => {
    // A stop so wide that the arithmetic wants less than 1x.
    assert.equal(maxSafeLeverage(100, 20, THIN), 1);
  });

  it('returns nothing for levels that are not a trade', () => {
    assert.equal(maxSafeLeverage(100, 100, DEEP), 0, 'a stop at entry is not a trade');
    assert.equal(maxSafeLeverage(0, 98, DEEP), 0);
    assert.equal(maxSafeLeverage(100, 0, DEEP), 0);
  });

  it('matches the worked example', () => {
    /*
     * The 2%-stop case, spelled out: 1 / (1.5 * 0.02 + 0.001) = 32.25 -> 32x.
     * The naive answer everyone quotes is 50x, which is exactly the number that
     * puts liquidation on top of the stop.
     */
    assert.equal(maxSafeLeverage(100, 98, DEEP), 32);
  });
});
