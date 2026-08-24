import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
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

/** `symbol -> [highs, lows]`, newest bar last. */
let script: Record<string, [number[], number[]]> = {};
/** Every candle is stamped as opening after this, so trades see them. */
let candleBase = Date.now();

const realFetch = globalThis.fetch;

before(() => {
  process.env.TELEGRAM_BOT_TOKEN = '';
  globalThis.fetch = (async (url: string | URL) => {
    const symbol = /symbol=([A-Z]+)/.exec(String(url))?.[1] ?? 'BTCUSDT';
    const [highs, lows] = script[symbol] ?? [[100], [100]];
    const rows = highs.map((high, index) => [
      candleBase + index * 60_000,
      '100',
      String(high),
      String(lows[index]),
      '100',
      '1',
      0,
      '1',
    ]);
    return { ok: true, status: 200, statusText: 'OK', json: async () => rows, text: async () => '' };
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
  });

  it('settles a long that tagged its target as a win', async () => {
    script = { ETHUSDT: [[105, 111], [99, 99]] };

    await trades.openTrade(signal('ETH', 'buy', 100, 95, 110));
    const { closed, stats } = await trades.evaluateTrades();

    assert.equal(closed.length, 1);
    assert.equal(closed[0]?.outcome, 'win');
    assert.equal(closed[0]?.resultPct, 10);
    assert.equal(trades.winRate(stats), 100);
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
    script = { AVAXUSDT: [[105, 111], [99, 99]] };

    await trades.openTrade(signal('AVAX', 'buy', 100, 95, 110));
    await trades.evaluateTrades();
    const again = await trades.evaluateTrades();

    assert.equal(again.closed.length, 0);
    assert.equal(again.stats.wins, 1);
  });

  it('reports a win rate over decided trades only', async () => {
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 0, superseded: 0, byStrategy: {}, updatedAt: '' }), 75);
    // Expired and superseded calls must not dilute the denominator.
    assert.equal(trades.winRate({ wins: 3, losses: 1, expired: 9, superseded: 4, byStrategy: {}, updatedAt: '' }), 75);
    assert.equal(trades.winRate({ wins: 0, losses: 0, expired: 5, superseded: 0, byStrategy: {}, updatedAt: '' }), 0);
  });
});
