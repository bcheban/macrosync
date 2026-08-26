import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { cache } from '../../utils/cache.js';
import { resetMemoryStore } from '../store/store.js';
import * as trades from './trades.service.js';

/**
 * The trade ledger decides what the published win rate says, so it is the one
 * part of this codebase where a quiet bug would be actively misleading rather
 * than merely broken. These run against a scripted exchange: `getKlines` reaches
 * the network through `fetch`, so stubbing that gives full control of the
 * candles a trade is resolved against.
 *
 * Uses `node:test` — no dependency, and `tsx --test` runs it directly.
 */

/**
 * `symbol -> [highs, lows]`, newest bar last.
 *
 * Every case needs its own ticker: candles are cached per symbol and interval,
 * and `resetMemoryStore` clears the store rather than that cache — so two cases
 * sharing a symbol silently replay the first one's tape.
 */
let script: Record<string, [number[], number[]]> = {};
/** Every candle is stamped as opening after this, so trades see them. */
let candleBase = Date.now();

const realFetch = globalThis.fetch;

before(() => {
  process.env.TELEGRAM_BOT_TOKEN = '';
  globalThis.fetch = (async (url: string | URL) => {
    // Contract klines: `/contract/kline/BTC_USDT`, columnar, seconds, enveloped.
    const symbol = /kline\/([A-Z0-9_]+)/.exec(String(url))?.[1]?.replace('_', '') ?? 'BTCUSDT';
    const [highs, lows] = script[symbol] ?? [[100], [100]];

    const data = {
      time: highs.map((_, index) => Math.floor((candleBase + index * 60_000) / 1000)),
      open: highs.map(() => 100),
      high: highs.slice(),
      low: lows.slice(),
      close: highs.map(() => 100),
      vol: highs.map(() => 1),
    };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, code: 0, data }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

const signal = (base: string, verdict: 'buy' | 'sell', entry: number, stop: number, target: number) =>
  ({
    id: base,
    symbol: `${base}USDT`,
    base,
    strategy: 'day',
    timeframe: '1h',
    direction: verdict === 'buy' ? 'long' : 'short',
    verdict,
    summary: { text: 'reason' },
    confidence: 70,
    status: 'live',
    price: entry,
    entry,
    stopLoss: stop,
    takeProfit: target,
    riskReward: 2,
    suggestedRiskPct: 1,
    indicators: { rsi: 30, emaFast: 1, emaSlow: 1, macdHistogram: 0, atrPct: 1, volumeRatio: 1 },
    rationale: [],
    source: 'mexc',
    updatedAt: new Date().toISOString(),
  }) as never;

describe('trade ledger', () => {
  beforeEach(() => {
    script = {};
    // Candles open a minute *after* the trade does, so they are in scope.
    candleBase = Date.now() + 60_000;
    /*
     * Importing the module under a unique query string is not enough to isolate
     * these: the store it imports resolves to the same URL either way, so the
     * ledger would carry over. Clearing the backend is what actually isolates.
     */
    resetMemoryStore();
    // Candles and specs are cached by key, and the store reset does not touch them.
    cache.clear();
  });

  it('settles a long that tagged its target as a win', async () => {
    // Never dips back to entry, so the moved stop is never in the way.
    script = { ETHUSDT: [[105, 111], [102, 106]] };

    await trades.openTrade(signal('ETH', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed.length, 1);
    assert.equal(closed[0]?.outcome, 'win');
    assert.equal(closed[0]?.resultPct, 10);
    assert.equal(trades.winRate(stats), 100);
  });

  it('moves the stop to entry at the configured threshold', async () => {
    // 75% of the way from 100 to 110 is 107.5; the bar reaches it and stops there.
    script = { BEAUSDT: [[108], [101]] };

    await trades.openTrade(signal('BEA', 'buy', 100, 95, 110));
    const { closed, movedToBreakeven } = await trades.evaluateTrades();

    assert.equal(closed.length, 0, 'still running');
    assert.equal(movedToBreakeven.length, 1);
    assert.equal(movedToBreakeven[0]?.stopLoss, 100, 'the stop is now entry');
    assert.equal(movedToBreakeven[0]?.initialStopLoss, 95, 'and where it started is kept');
  });

  it('announces the move once, not on every run', async () => {
    script = { BEBUSDT: [[108], [101]] };

    await trades.openTrade(signal('BEB', 'buy', 100, 95, 110));
    await trades.evaluateTrades();
    const again = await trades.evaluateTrades();

    // The moved stop has to survive the run, or this repeats forever.
    assert.equal(again.movedToBreakeven.length, 0);
    /*
     * And the trade has to survive it. A stop at entry once read as malformed —
     * the "is this a real trade" check wanted the stop strictly below entry —
     * so every protected trade was voided on the run after it was protected.
     */
    assert.equal(again.closed.length, 0);
    assert.equal((await trades.loadActive())[0]?.stopLoss, 100);
  });

  it('scratches rather than losing once the stop has moved', async () => {
    // Reaches 108, then trades back through entry.
    script = { BECUSDT: [[108, 101], [101, 99]] };

    await trades.openTrade(signal('BEC', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'breakeven');
    assert.equal(closed[0]?.resultPct, 0, 'nothing was lost');
    /*
     * And it is kept out of the rate. Before this rule the same tape was a
     * loss, so counting it as one would double-punish and counting it as a win
     * would flatter — which is why it is neither, and reported on its own.
     */
    assert.equal(stats.wins + stats.losses, 0);
    assert.equal(stats.breakeven, 1);
  });

  it('leaves a trade alone below the threshold', async () => {
    /*
     * The change this file exists to pin down. At 50% a bar topping out at 106
     * moved the stop to entry, and the next wick back through it scratched a
     * trade that was still working; at 75% the same bar does nothing.
     */
    script = { BEFUSDT: [[106, 101], [101, 99]] };

    await trades.openTrade(signal('BEF', 'buy', 100, 95, 110));
    const { closed, movedToBreakeven } = await trades.evaluateTrades();

    assert.equal(movedToBreakeven.length, 0, 'below the trigger');
    assert.equal(closed.length, 0, 'and so the dip back to 99 costs nothing');
  });

  it('reads the threshold from configuration, not a constant', async () => {
    /*
     * `env` is `as const`, which is a type-level guarantee rather than a frozen
     * object — the cast is what lets one case move the dial without a second
     * process. If this ever starts throwing, `env` has been frozen and the
     * resolution loop should take the threshold as an argument instead.
     */
    const { env } = await import('../../config/env.js');
    const mutable = env as { breakevenThreshold: number };
    const original = mutable.breakevenThreshold;

    try {
      // A trade that does not trigger at 0.75 must trigger at 0.5.
      mutable.breakevenThreshold = 0.5;
      script = { BEGUSDT: [[106], [101]] };

      await trades.openTrade(signal('BEG', 'buy', 100, 95, 110));
      const { movedToBreakeven } = await trades.evaluateTrades();

      assert.equal(movedToBreakeven.length, 1, 'the threshold is read at call time');
    } finally {
      mutable.breakevenThreshold = original;
    }
  });

  it('closes a trade that has gone nowhere for half its horizon', async () => {
    /*
     * A day trade lives 36 hours, so the check bites after 18. Forty bars that
     * barely move means the call is holding a slot it is not using.
     */
    const highs = Array.from({ length: 40 }, () => 101);
    script = { STAUSDT: [highs, highs.map(() => 99)] };

    await trades.openTrade(signal('STA', 'buy', 100, 95, 110));
    const active = await trades.loadActive();
    const aged = active.map((t) => ({ ...t, openedAt: new Date(Date.now() - 20 * 60 * 60_000).toISOString() }));
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(storeKey('trades:active'), aged);

    const { closed } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'expired');
    // Expired stays out of the rate, so an early close cannot flatter it.
    assert.equal((await trades.loadStats()).wins + (await trades.loadStats()).losses, 0);
  });

  it('spares a trade that travelled, even if it came back', async () => {
    /*
     * Progress is the best the trade ever managed, not where it sits now. One
     * that ran 40% of the way and returned is a trade that was working and
     * stopped — a different thing from one that never moved.
     */
    const highs = Array.from({ length: 40 }, (_, i) => (i === 5 ? 105 : 101));
    script = { STBUSDT: [highs, highs.map(() => 99)] };

    await trades.openTrade(signal('STB', 'buy', 100, 95, 110));
    const active = await trades.loadActive();
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(
      storeKey('trades:active'),
      active.map((t) => ({ ...t, openedAt: new Date(Date.now() - 20 * 60 * 60_000).toISOString() })),
    );

    const { closed } = await trades.evaluateTrades();

    assert.equal(closed.length, 0, '50% of the way at its best is not stagnant');
  });

  it('never calls a protected trade stagnant', async () => {
    /*
     * Past 75% by definition, so the progress test cannot apply to it. Lows stay
     * above entry throughout — a dip to 99 would fill the moved stop and close
     * this as a scratch before the stagnation check ever ran.
     */
    const highs = Array.from({ length: 40 }, (_, i) => (i === 2 ? 108 : 101));
    script = { STCUSDT: [highs, highs.map(() => 101)] };

    await trades.openTrade(signal('STC', 'buy', 100, 95, 110));
    const active = await trades.loadActive();
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(
      storeKey('trades:active'),
      active.map((t) => ({ ...t, openedAt: new Date(Date.now() - 20 * 60 * 60_000).toISOString() })),
    );

    const { closed } = await trades.evaluateTrades();
    assert.equal(closed.length, 0);
  });

  it('costs a win when one bar both scratches and targets', async () => {
    /*
     * Documented rather than avoided. The second bar has a low of 99 and a high
     * of 111: with the stop already at 100 the price traded through it at some
     * point, and intrabar order is unknowable. A real position with a stop at
     * entry would have been closed before the target printed, so this reads as
     * the scratch — the same "flatters least" rule the levels have always used.
     */
    script = { BEDUSDT: [[108, 111], [99, 99]] };

    await trades.openTrade(signal('BED', 'buy', 100, 95, 110));
    const { closed } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'breakeven');
  });

  it('reads the threshold in the trade direction for a short', async () => {
    // Short from 100 to 90: 75% of the way down is 92.5.
    script = { BEEUSDT: [[99], [92]] };

    await trades.openTrade(signal('BEE', 'sell', 100, 105, 90));
    const { movedToBreakeven } = await trades.evaluateTrades();

    assert.equal(movedToBreakeven.length, 1);
    assert.equal(movedToBreakeven[0]?.stopLoss, 100);
  });

  it('settles a long that tagged its stop as a loss', async () => {
    script = { SOLUSDT: [[101, 102], [96, 94]] };

    await trades.openTrade(signal('SOL', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'loss');
    assert.equal(closed[0]?.resultPct, -5);
    assert.equal(trades.winRate(stats), 0);
  });

  it('reads a short in the opposite direction', async () => {
    // Short from 100: target 90 below, stop 105 above. Price falls to 89.
    script = { XRPUSDT: [[101, 99], [95, 89]] };

    await trades.openTrade(signal('XRP', 'sell', 100, 105, 90));
    const { closed } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'win');
    assert.equal(closed[0]?.resultPct, 10);
  });

  it('counts the stop when one bar touched both levels', async () => {
    script = { DOGEUSDT: [[111], [94]] };

    await trades.openTrade(signal('DOGE', 'buy', 100, 95, 110));
    const { closed } = await trades.evaluateTrades();

    // Intrabar order is unknowable; the reading that flatters least wins.
    assert.equal(closed[0]?.outcome, 'loss');
  });

  it('ignores a level touched before the trade opened', async () => {
    script = { LINKUSDT: [[111], [94]] };
    // The bar opened an hour before the call, so it says nothing about it.
    candleBase = Date.now() - 60 * 60_000;

    await trades.openTrade(signal('LINK', 'buy', 100, 95, 110));
    const { closed, open } = await trades.evaluateTrades();

    assert.equal(closed.length, 0);
    assert.equal(open, 1);
  });

  it('leaves a trade open while neither level is reached', async () => {
    script = { BTCUSDT: [[101, 101], [99, 99]] };

    await trades.openTrade(signal('BTC', 'buy', 100, 95, 110));
    const { closed, open } = await trades.evaluateTrades();

    assert.equal(closed.length, 0);
    assert.equal(open, 1);
  });

  it('expires a trade that outlived its horizon without counting it', async () => {
    script = { ATOMUSDT: [[101], [99]] };

    await trades.openTrade(signal('ATOM', 'buy', 100, 95, 110));
    // Two days on a day-trade horizon (36h) is well past.
    const { closed, stats, open } = await trades.evaluateTrades(Date.now() + 48 * 60 * 60_000);

    assert.equal(closed[0]?.outcome, 'expired');
    assert.equal(open, 0);
    assert.equal(stats.expired, 1);
    // An unresolved call is neither a win nor a loss.
    assert.equal(stats.wins + stats.losses, 0);
  });

  it('supersedes the standing trade when the call reverses', async () => {
    script = { ADAUSDT: [[101], [99]] };

    await trades.openTrade(signal('ADA', 'buy', 100, 95, 110));
    const result = await trades.openTrade(signal('ADA', 'sell', 100, 105, 90));

    assert.equal(result.opened, true);
    assert.equal(result.superseded?.outcome, 'superseded');

    // Exactly one trade on the pair, and it is the new direction.
    const active = await trades.loadActive();
    assert.equal(active.length, 1);
    assert.equal(active[0]?.side, 'sell');

    // A superseded call moves neither side of the win rate.
    const stats = await trades.loadStats();
    assert.equal(stats.superseded, 1);
    assert.equal(stats.wins + stats.losses, 0);
  });

  it('ignores the same call arriving twice', async () => {
    const first = await trades.openTrade(signal('BNB', 'buy', 100, 95, 110));
    const second = await trades.openTrade(signal('BNB', 'buy', 100, 95, 110));

    assert.equal(first.opened, true);
    assert.equal(second.opened, false);
    assert.equal((await trades.loadActive()).length, 1);
  });

  it('does not settle the same trade twice', async () => {
    // A clean win: never dips back through entry once the stop has moved.
    script = { AVAXUSDT: [[105, 111], [102, 106]] };

    await trades.openTrade(signal('AVAX', 'buy', 100, 95, 110));
    await trades.evaluateTrades();
    const again = await trades.evaluateTrades();

    assert.equal(again.closed.length, 0);
    assert.equal(again.stats.wins, 1);
  });

  it('voids a call whose target is not a price', async () => {
    script = { WILDUSDT: [[120], [80]] };

    /*
     * A short with a target below zero. The engine cannot produce these any
     * more, but ones already in the ledger could still be stopped out — they
     * could lose and could never win, which is the one shape that genuinely
     * poisons a win rate.
     */
    await trades.openTrade(signal('WILD', 'sell', 100, 130, -25));
    // Refused at the door, so nothing to settle.
    assert.equal((await trades.loadActive()).length, 0);
  });

  it('voids an unresolvable trade already on the books', async () => {
    script = { OLDUSDT: [[300], [50]] };

    // Written straight to the store, as a deploy before the guard would have.
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(storeKey('trades:active'), [
      {
        id: 'OLDUSDT:day:1',
        symbol: 'OLDUSDT',
        base: 'OLD',
        strategy: 'day',
        side: 'sell',
        entry: 100,
        stopLoss: 130,
        takeProfit: -25,
        timeframe: '1h',
        openedAt: new Date().toISOString(),
      },
    ]);

    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'voided');
    // The stop was reachable — left alone it would have been recorded a loss.
    assert.equal(stats.losses, 0);
    assert.equal(stats.voided, 1);
  });

  it('reports a win rate over decided trades only', async () => {
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 0, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 75);
    // Expired and superseded calls must not dilute the denominator.
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 9, superseded: 4, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 75);
    assert.equal(trades.winRate({ wins: 0, losses: 0, expired: 5, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 0);
  });
});
