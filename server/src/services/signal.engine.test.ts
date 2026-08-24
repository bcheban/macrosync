import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
 * Guards the arithmetic that turns a read into levels.
 *
 * The case these exist for was found in production, not in review: a short on a
 * microcap was published with `takeProfit: -0.33`. The stop is a multiple of ATR
 * and the target a multiple of the stop, so on an asset whose ATR approaches its
 * own price the target runs past what a price can be. That call could never
 * reach its target — only its stop or expiry — so it was a trade advertised as
 * winnable that was arithmetically incapable of winning.
 *
 * It stayed hidden while the scan covered eight majors and appeared the moment
 * the radar reached coins that move 50% in a day.
 */

const { getSignals } = await import('./signal.engine.js');

/** Candles are generated, so a case is a volatility profile rather than a fixture. */
let series: number[] = [];

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL) => {
    const target = String(url);

    if (target.includes('/contract/kline/')) {
      const base = Date.now() - series.length * 3_600_000;
      // A bar's range scales with the move, which is what drives ATR.
      const prev = (index: number) => series[index - 1] ?? series[index] ?? 0;
      const spread = (index: number) =>
        Math.abs((series[index] ?? 0) - prev(index)) || (series[index] ?? 0) * 0.001;

      const data = {
        time: series.map((_, index) => Math.floor((base + index * 3_600_000) / 1000)),
        open: series.map((_, index) => prev(index)),
        high: series.map((close, index) => Math.max(close, prev(index)) + spread(index)),
        low: series.map((close, index) => Math.min(close, prev(index)) - spread(index)),
        close: series.slice(),
        vol: series.map(() => 1000),
      };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true, data }),
        text: async () => '',
      };
    }

    // Contract specs, the calendar, and anything else the engine reaches for.
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, data: [] }), text: async () => '' };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

/**
 * A series with a chosen volatility, drifting at a chosen rate.
 *
 * `swing` is what matters: it sets ATR against price, and ATR against price is
 * what decides whether a target can exist at all. A plain compounding decline
 * cannot be used for this — at a volatility high enough to trigger the bug it
 * reaches zero within the window and stops being a price.
 */
const series_ = (bars: number, swing: number, driftPct = 0, start = 100): number[] =>
  Array.from({ length: bars }, (_, index) => start * (1 + driftPct * index) * (1 + swing * Math.sin(index * 2)));

/** Violent enough that a wide-stop strategy cannot express a target. */
const violent = (): number[] => series_(220, 0.3, -0.001);

/** An ordinary market: a real trend at a volatility the levels can hold. */
const calm = (): number[] => series_(220, 0.01, 0.004);

describe('signal levels', () => {
  beforeEach(() => {
    series = [];
  });

  it('never prices a target or a stop below zero', async () => {
    series = violent();

    for (const strategy of ['scalping', 'day', 'swing'] as const) {
      const signals = await getSignals(strategy, ['WILDUSDT']);

      for (const signal of signals) {
        assert.ok(signal.takeProfit > 0, `${strategy} target ${signal.takeProfit} is not a price`);
        assert.ok(signal.stopLoss > 0, `${strategy} stop ${signal.stopLoss} is not a price`);
      }
    }
  });

  it('refuses to call a setup whose target cannot exist', async () => {
    series = violent();

    const [wide] = await getSignals('swing', ['WILDUSDT']);

    /*
     * Swing stops at 2.4x ATR and targets 3R. On this tape that target is more
     * than the asset is worth, so there is no trade — whatever the indicators
     * agree on. A call that can only ever be stopped out is not a call.
     */
    assert.ok(wide);
    assert.equal(wide.verdict, 'wait');
    assert.equal(wide.direction, 'neutral');
  });

  it('still shows prices on a card it refuses to trade', async () => {
    series = violent();

    const [refused] = await getSignals('scalping', ['TIGHTUSDT']);

    /*
     * Refusing the trade is not the end of it: the card still renders a
     * volatility band, and the same wild ATR that made the setup untradable
     * would otherwise print a negative number there instead of in the alert.
     */
    assert.ok(refused);
    assert.ok(refused.takeProfit > 0);
    assert.ok(refused.stopLoss > 0);
    assert.ok(refused.stopLoss < refused.entry && refused.takeProfit > refused.entry);
  });

  it('puts the levels on the correct side of entry', async () => {
    for (const [name, build] of [['CALM', calm], ['WILD', violent]] as const) {
      series = build();

      for (const strategy of ['scalping', 'day', 'swing'] as const) {
        // Candles are cached per symbol, so each tape needs its own ticker —
        // sharing one silently re-ran the first series for the second case.
        const [signal] = await getSignals(strategy, [`${name}${strategy}USDT`]);
        if (!signal || signal.direction === 'neutral') continue;

        if (signal.direction === 'long') {
          assert.ok(signal.takeProfit > signal.entry, 'a long targets a higher price');
          assert.ok(signal.stopLoss < signal.entry, 'a long stops below entry');
        } else {
          assert.ok(signal.takeProfit < signal.entry, 'a short targets a lower price');
          assert.ok(signal.takeProfit > 0, 'a short cannot target a negative price');
          assert.ok(signal.stopLoss > signal.entry, 'a short stops above entry');
        }
      }
    }
  });

  it('still calls an ordinary trend', async () => {
    series = calm();

    const [signal] = await getSignals('day', ['CALMUSDT']);

    // The guard must not have made the engine mute on a normal market.
    assert.ok(signal);
    assert.notEqual(signal.direction, 'neutral');
    assert.ok(signal.riskReward > 0);
  });

  it('draws a sane band on a neutral read of a violent asset', async () => {
    series = series_(220, 0.35);

    const [signal] = await getSignals('day', ['CHOPUSDT']);

    assert.ok(signal);
    // The band is decoration on a card, and must still be made of prices.
    assert.ok(signal.stopLoss > 0, `stop ${signal.stopLoss} is not a price`);
    assert.ok(signal.takeProfit > 0);
  });
});
