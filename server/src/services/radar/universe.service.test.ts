import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
 * The radar decides what the bot can ever see. A bug that quietly narrows it —
 * a cursor that never advances, a filter that drops half the exchange — looks
 * exactly like a quiet market from the outside, which is why it is tested.
 */
process.env.RADAR_UNIVERSE_SIZE = '5';
process.env.RADAR_BATCH_SIZE = '2';
process.env.RADAR_MIN_VOLUME_USD = '1000';
process.env.RADAR_ALWAYS_INCLUDE = 'BTCUSDT';
process.env.RADAR_UNIVERSE_TTL_MS = '3600000';

const { cache } = await import('../../utils/cache.js');
const { resetMemoryStore } = await import('../store/store.js');
const radar = await import('./universe.service.js');

/** `symbol -> 24h quote volume`, as the exchange-wide ticker feed reports it. */
let feed: Record<string, number> = {};
/** Symbols the feed should quote as sitting flat on a dollar. */
let pegged = new Set<string>();
/** Symbols the exchange lists and prices but refuses through the API. */
let untradable = new Set<string>();
/** Simulates MEXC reshaping `/contract/detail` and dropping the margin fields. */
let partialSpecs = false;
let feedCalls = 0;

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL) => {
    // Contract specs: every symbol tradable, so `state` never narrows a case.
    if (String(url).includes('/contract/detail')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          data: Object.keys(feed).map((symbol) => ({
            symbol: symbol.replace(/USDT$/, '_USDT'),
            maxLeverage: 50,
            maintenanceMarginRate: 0.005,
            contractSize: 1,
            state: 0,
            // The full shape, so the tradability filter is actually exercised.
            ...(partialSpecs
              ? {}
              : { quoteCoin: 'USDT', settleCoin: 'USDT', futureType: 1 }),
            apiAllowed: !untradable.has(symbol),
          })),
        }),
        text: async () => '',
      };
    }

    feedCalls += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        success: true,
        data: Object.entries(feed).map(([symbol, amount24]) => ({
          // The feed quotes perpetuals; the radar stores the internal form.
          symbol: symbol.replace(/USDT$/, '_USDT'),
          // A price well away from a dollar, so nothing reads as a peg by default.
          lastPrice: 42,
          riseFallRate: 0,
          high24Price: 45,
          lower24Price: 39,
          amount24,
          volume24: amount24,
          ...(pegged.has(symbol) ? { lastPrice: 1.0002, high24Price: 1.0009, lower24Price: 0.9995 } : {}),
        })),
      }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

describe('radar universe', () => {
  beforeEach(() => {
    feedCalls = 0;
    pegged = new Set();
    untradable = new Set();
    partialSpecs = false;
    resetMemoryStore();
    // Candles and specs are cached by key, and the store reset does not touch them.
    cache.clear();
    feed = {
      BTCUSDT: 900_000_000,
      ETHUSDT: 500_000_000,
      INJUSDT: 4_000_000,
      SOLUSDT: 300_000_000,
      XRPUSDT: 100_000_000,
      DEADUSDT: 12, // below the floor
      BTC3LUSDT: 999_000_000, // leveraged token
      USDCUSDT: 999_000_000, // stablecoin quoted in a stablecoin
      ETHBTC: 999_000_000, // not a USDT pair
    };
  });

  it('keeps only pairs a signal can be formed on', () => {
    assert.equal(radar.isTradablePair('INJUSDT'), true);
    assert.equal(radar.isTradablePair('BTC3LUSDT'), false);
    assert.equal(radar.isTradablePair('ETHUP USDT'.replace(' ', '')), false);
    assert.equal(radar.isTradablePair('USDCUSDT'), false);
    assert.equal(radar.isTradablePair('ETHBTC'), false);
  });

  it('ranks the exchange by turnover and drops illiquid pairs', async () => {
    const { symbols } = await radar.buildUniverse();

    assert.deepEqual(symbols, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'INJUSDT']);
    // An altcoin well down the board is still covered — that is the whole point.
    assert.ok(symbols.includes('INJUSDT'));
    assert.ok(!symbols.includes('DEADUSDT'));
  });

  it('drops a contract the exchange will not trade through the API', async () => {
    /*
     * Twenty-five USDT perpetuals carry `apiAllowed: false` on the live board,
     * and every one is in the public ticker feed — so nothing upstream of this
     * can tell them apart from a contract somebody could act on. This is what
     * "symbol not found" looked like from the outside.
     */
    feed = { BTCUSDT: 900_000_000, GHOSTUSDT: 800_000_000, ETHUSDT: 700_000_000 };
    untradable.add('GHOSTUSDT');

    const { symbols } = await radar.buildUniverse();

    assert.ok(!symbols.includes('GHOSTUSDT'), 'priced, ranked, and untradable');
    assert.deepEqual(symbols, ['BTCUSDT', 'ETHUSDT']);
  });

  it('keeps the board when the spec response drops its fields', async () => {
    /*
     * The asymmetry that matters: over-filtering empties the board and reads as
     * a quiet market with no setups, which is indistinguishable from working.
     * Only a value that contradicts disqualifies — absence never does.
     */
    feed = { BTCUSDT: 900_000_000, ETHUSDT: 700_000_000 };
    partialSpecs = true;

    const { symbols } = await radar.buildUniverse();

    assert.deepEqual(symbols, ['BTCUSDT', 'ETHUSDT']);
  });

  it('drops a dollar token that no list of names would catch', async () => {
    feed = { BTCUSDT: 900_000_000, ETHUSDT: 500_000_000, USDGOUSDT: 400_000_000 };
    pegged.add('USDGOUSDT');

    const { symbols } = await radar.buildUniverse();

    // Turnover says it belongs; its own tape says it never moves.
    assert.ok(!symbols.includes('USDGOUSDT'));
    assert.ok(symbols.includes('ETHUSDT'));
  });

  it('always covers the dashboard pairs even below the volume floor', async () => {
    feed = { BTCUSDT: 5, ETHUSDT: 900_000_000 };
    const { symbols } = await radar.buildUniverse();

    assert.ok(symbols.includes('BTCUSDT'));
  });

  it('sweeps the whole board across consecutive runs without repeating', async () => {
    const seen: string[] = [];
    // Five pairs, two per run: three runs cover the board.
    for (let run = 0; run < 3; run += 1) seen.push(...(await radar.nextBatch()).symbols);

    const universe = (await radar.getUniverse()).symbols;
    assert.equal(new Set(seen.slice(0, universe.length)).size, universe.length);
  });

  it('wraps the cursor round the end of the list', async () => {
    const first = await radar.nextBatch();
    await radar.nextBatch();
    const third = await radar.nextBatch(); // offset 4, wraps to index 0

    assert.equal(first.offset, 0);
    assert.equal(third.offset, 4);
    assert.equal(third.symbols.length, 2);
    assert.equal(third.symbols[1], first.symbols[0]);
  });

  it('reuses the cached ranking rather than reshuffling mid-rotation', async () => {
    await radar.nextBatch();
    const before = feedCalls;
    await radar.nextBatch();

    // A rebuild between runs would re-order the list under the cursor.
    assert.equal(feedCalls, before);
  });

  it('rebuilds rather than reusing a ranking from another market', async () => {
    /*
     * The spot-to-perpetuals migration handed the futures scanner a cached list
     * of spot pairs, half of which have no contract. TTL cannot catch that: the
     * record was not stale, it was about a different exchange.
     */
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(storeKey('radar:universe'), {
      symbols: ['GONEUSDT', 'ALSOGONEUSDT'],
      builtAt: Date.now(),
      considered: 2,
    });

    const { symbols } = await radar.getUniverse();

    assert.ok(!symbols.includes('GONEUSDT'), 'a ranking from the old market must not be reused');
    assert.ok(symbols.includes('BTCUSDT'));
  });

  it('reports how many runs a full sweep takes', async () => {
    const batch = await radar.nextBatch();
    assert.equal(batch.universeSize, 5);
    assert.equal(batch.runsPerSweep, 3);
  });

  /*
   * Last on purpose. Failing the upstream trips the market service's circuit
   * breaker, which then refuses calls for its cooldown — real behaviour, and it
   * would starve any test that ran after this one.
   */
  it('falls back to the pinned pairs when the exchange listing cannot be read', async () => {
    globalThis.fetch = (async () => {
      throw new Error('upstream down');
    }) as unknown as typeof fetch;

    const { symbols } = await radar.getUniverse();

    // Degraded, but still scanning something.
    assert.deepEqual(symbols, ['BTCUSDT']);
  });
});
