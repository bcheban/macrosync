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

  /**
   * Opens a call under the rules that applied before the ladder existed.
   *
   * Those trades are not hypothetical — dozens were open when this shipped —
   * and they resolve on a single target and a fractional breakeven trigger,
   * because that is what their readers were shown. Stripping the ladder off a
   * freshly opened trade is the cheapest way to hold that path still.
   */
  const openLegacy = async (
    base: string,
    verdict: 'buy' | 'sell',
    entry: number,
    stop: number,
    target: number,
  ) => {
    await trades.openTrade(signal(base, verdict, entry, stop, target));
    const { setJson, storeKey } = await import('../store/store.js');
    const active = await trades.loadActive();
    await setJson(
      storeKey('trades:active'),
      active.map(({ targets, fills, ...rest }) => ({ ...rest, takeProfit: target })),
    );
  };

  it('settles a long that filled every rung as a win', async () => {
    /*
     * Entry 100 risking 5, so the ladder is 105 / 107.5 / 112.5. The first bar
     * books a quarter, the second sweeps the rest. Never dips back to entry, so
     * the stop TP2 moves is never in the way.
     */
    script = { ETHUSDT: [[105, 113], [102, 106]] };

    await trades.openTrade(signal('ETH', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed.length, 1);
    assert.equal(closed[0]?.outcome, 'win');
    // Position-weighted: a quarter at +5%, 45% at +7.5%, 30% at +12.5%.
    assert.equal(closed[0]?.resultPct, 8.38);
    assert.equal(trades.winRate(stats), 100);
  });

  it('lets a trade that only reached TP1 lose, because the stop has not moved', async () => {
    /*
     * The case the whole ladder was reshaped around, and the price of that
     * decision stated as a test.
     *
     * One bar reaches 105 and the trade then falls to its original stop at 95.
     * A quarter was booked at +1R; three quarters ride the stop for -1R each.
     * Net `0.25 - 0.75 = -0.5R`.
     *
     * Under the old rules this was a **win** worth +0.5R: half booked, stop
     * pulled to entry on that same fill. Eighteen of twenty-six winners were
     * exactly this, which is how a 59% win rate carried an edge smaller than
     * the fees. Now it is a loss, and the record says so.
     */
    script = { LADUSDT: [[105, 101], [101, 94]] };

    await trades.openTrade(signal('LAD', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'loss', 'a filled rung is not proof of a win');
    // A quarter of +5%, three quarters of -5%.
    assert.equal(closed[0]?.resultPct, -2.5);
    assert.equal(closed[0]?.fills?.[0]?.reason, 'target');
    assert.equal(closed[0]?.fills?.[1]?.reason, 'stop');
    assert.equal(stats.losses, 1);
    assert.equal(stats.wins, 0);
  });

  it('protects the trade once TP2 fills, and not before', async () => {
    /*
     * The other side of the same rule. The bar sweeps 105 and 107.5, so the
     * stop moves to entry; the trade then comes back through it.
     *
     * Booked: a quarter at +1R and 45% at +1.5R, with the last 30% closing at
     * entry for nothing. `0.25 + 0.675 = +0.925R`.
     */
    script = { LADUSDT: [[108, 101], [101, 99]] };

    await trades.openTrade(signal('LAD', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'win');
    // A quarter of +5%, 45% of +7.5%, and nothing on the remaining 30%.
    assert.equal(closed[0]?.resultPct, 4.63);
    assert.equal(closed[0]?.fills?.length, 3);
    assert.equal(closed[0]?.fills?.[2]?.reason, 'breakeven');
    assert.equal(stats.wins, 1);
  });

  it('redistributes a rung that falls outside the sane band', async () => {
    /*
     * A rung beyond the band is dropped and its share spread over the rest, so
     * the ladder always closes the whole position. Risking 40 against an entry
     * of 100 puts the later rungs at 160 and 200 — past the half-of-entry
     * bound, and past anything a candle inside the horizon is going to print.
     */
    const { buildLadder } = await import('./targets.js');
    const ladder = buildLadder('day', 'buy', 100, 60);

    assert.equal(ladder.length, 1, 'only the 1R rung sits inside the band');
    assert.equal(ladder[0]?.price, 140);
    assert.equal(ladder[0]?.share, 1, 'and it takes the whole position');
  });

  it('moves a pre-ladder stop to entry at the configured threshold', async () => {
    // 75% of the way from 100 to 110 is 107.5; the bar reaches it and stops there.
    script = { BEAUSDT: [[108], [101]] };

    await openLegacy('BEA', 'buy', 100, 95, 110);
    const { closed, movedToBreakeven } = await trades.evaluateTrades();

    assert.equal(closed.length, 0, 'still running');
    assert.equal(movedToBreakeven.length, 1);
    assert.equal(movedToBreakeven[0]?.stopLoss, 100, 'the stop is now entry');
    assert.equal(movedToBreakeven[0]?.initialStopLoss, 95, 'and where it started is kept');
  });

  it('announces the move once, not on every run', async () => {
    script = { BEBUSDT: [[108], [101]] };

    await openLegacy('BEB', 'buy', 100, 95, 110);
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

    await openLegacy('BEC', 'buy', 100, 95, 110);
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

    await openLegacy('BEF', 'buy', 100, 95, 110);
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

      await openLegacy('BEG', 'buy', 100, 95, 110);
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
    // 104 rather than 105: at 105 the first rung fills and this becomes a win.
    const highs = Array.from({ length: 40 }, (_, i) => (i === 5 ? 104 : 101));
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

  it('costs the last rung when one bar both stops and targets', async () => {
    /*
     * Documented rather than avoided. The first bar books TP1 and TP2 and pulls
     * the stop to entry; the second has a low of 99 and a high of 113, so it
     * traded through that stop at some point and also printed the last rung.
     * Intrabar order is unknowable, and a real position would have been closed
     * before the rung filled — so the remainder is taken at the stop.
     *
     * The trade is still a win. Two rungs were booked and no later bar can
     * un-book them; what the rule costs is the tail, not the outcome.
     */
    script = { BEDUSDT: [[108, 113], [99, 99]] };

    await trades.openTrade(signal('BED', 'buy', 100, 95, 110));
    const { closed } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'win');
    // A quarter at +5%, 45% at +7.5%, and the last 30% at entry.
    assert.equal(closed[0]?.resultPct, 4.63);
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
    /*
     * Short from 100 risking 5, so the ladder walks down: 95 / 92.5 / 87.5.
     * The second bar sweeps all three, and the weighting reads identically to
     * the long — which is the point of signing everything by side.
     */
    script = { XRPUSDT: [[101, 99], [95, 87]] };

    await trades.openTrade(signal('XRP', 'sell', 100, 105, 90));
    const { closed } = await trades.evaluateTrades();

    assert.equal(closed[0]?.outcome, 'win');
    // The same weighting as the long: 25% / 45% / 30% at 1R / 1.5R / 2.5R.
    assert.equal(closed[0]?.resultPct, 8.38);
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
    // A clean win: every rung fills, and it never dips back through entry.
    script = { AVAXUSDT: [[105, 113], [102, 106]] };

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

  it('values a record written before the accumulator, and again when a field is added', async () => {
    /*
     * The seed runs on any missing field, not only on a missing `sums`.
     *
     * `roiPct` was added after `sums` had been written once, so records with
     * the older shape passed a presence check and served an undefined number.
     * JSON drops those, so the field vanished from the response instead of
     * failing anywhere loud. Both shapes are pinned here because the next
     * field added will land in exactly the same position.
     */
    const store = await import('../store/store.js');
    const base = {
      wins: 40,
      losses: 79,
      expired: 54,
      superseded: 2,
      voided: 0,
      breakeven: 44,
      byStrategy: { day: { wins: 40, losses: 79 } },
      updatedAt: new Date().toISOString(),
    };

    for (const written of [base, { ...base, sums: { r: -19, settled: 119 } }]) {
      await store.setJson(store.storeKey('trades:stats'), written);
      const { sums } = await trades.loadStats();

      // 40 wins at the 1.5 the engine targets, less 79 losses at one risk unit.
      assert.equal(sums.r, -19);
      // The same record against the 0.75% a day trade calls for.
      assert.equal(sums.roiPct, -14.25);
      assert.equal(sums.settled, 119);
    }
  });

  it('stops opening once the book is full', async () => {
    /*
     * Sixty-three positions were open against forty-four ever settled. Each one
     * carries a full risk unit, so that is sixty-three units of exposure at
     * once — and a correlated market closes them together, which is the only
     * time the number matters.
     *
     * The engine keeps scanning. It simply stops opening, and says why.
     */
    const store = await import('../store/store.js');
    const { env } = await import('../../config/env.js');
    const limit = env.maxOpenTrades;

    await store.setJson(
      store.storeKey('trades:active'),
      Array.from({ length: limit }, (_, i) => ({
        id: `FULL${i}`,
        symbol: `FULL${i}USDT`,
        base: `FULL${i}`,
        strategy: 'day',
        side: 'buy',
        entry: 100,
        stopLoss: 95,
        initialStopLoss: 95,
        takeProfit: 110,
        targets: [{ level: 1, price: 105, share: 1 }],
        fills: [],
        timeframe: '1h',
        openedAt: new Date().toISOString(),
      })),
    );

    const refused = await trades.openTrade(signal('NEWONE', 'buy', 100, 95, 110));
    assert.equal(refused.opened, false);
    assert.equal(refused.reason, 'full');

    /*
     * A reversal is exempt. It replaces a position rather than adding one, so
     * blocking it would leave the account holding a call the engine has already
     * changed its mind about — strictly worse than taking it or not.
     */
    const reversal = await trades.openTrade(signal('FULL0', 'sell', 100, 105, 90));
    assert.equal(reversal.opened, true, 'a reversal replaces rather than adds');
  });

  it('reports a win rate over decided trades only', async () => {
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 0, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 75);
    // Expired and superseded calls must not dilute the denominator.
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 9, superseded: 4, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 75);
    assert.equal(trades.winRate({ wins: 0, losses: 0, expired: 5, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' }), 0);
  });
});
