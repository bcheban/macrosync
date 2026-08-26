import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
 * This module exists to settle an argument with evidence, which makes its own
 * honesty the thing worth testing: a what-if that quietly counts "cannot say"
 * as "did not happen" would justify a parameter change with a number it made up.
 */
process.env.TELEGRAM_BOT_TOKEN = '';

const { resetMemoryStore, setJson, storeKey } = await import('../store/store.js');
const analytics = await import('./analytics.service.js');

/** `symbol -> [highs, lows]`, oldest bar first, one bar per hour. */
let script: Record<string, [number[], number[]]> = {};
/**
 * Where the fabricated tape starts, relative to now.
 *
 * Aligned to a whole second because the exchange stamps candles in seconds: an
 * unaligned start makes every bar open a fraction before its nominal time, which
 * silently shifts which bars count as "after the close".
 */
let tapeStart = Math.floor((Date.now() - 10 * 60 * 60_000) / 1000) * 1000;

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL) => {
    const symbol = /kline\/([A-Z0-9_]+)/.exec(String(url))?.[1]?.replace('_', '') ?? '';
    const [highs, lows] = script[symbol] ?? [[], []];

    const data = {
      time: highs.map((_, index) => Math.floor((tapeStart + index * 3_600_000) / 1000)),
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
      json: async () => ({ success: true, data }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

/** A settled trade, written straight into the history the way the ledger does. */
const trade = (over: Record<string, unknown>) => ({
  id: String(over.base),
  symbol: `${over.base}USDT`,
  base: over.base,
  strategy: 'day',
  side: 'buy',
  entry: 100,
  stopLoss: 95,
  initialStopLoss: 95,
  takeProfit: 110,
  timeframe: '1h',
  openedAt: new Date(tapeStart).toISOString(),
  closedAt: new Date(tapeStart + 3_600_000).toISOString(),
  resultPct: 0,
  ...over,
});

const seed = async (history: unknown[], stats: Record<string, number>) => {
  await setJson(storeKey('trades:history'), history);
  await setJson(storeKey('trades:stats'), {
    wins: 0, losses: 0, expired: 0, superseded: 0, voided: 0, breakeven: 0,
    byStrategy: {}, updatedAt: '', ...stats,
  });
};

describe('analytics', () => {
  beforeEach(() => {
    resetMemoryStore();
    script = {};
    tapeStart = Math.floor((Date.now() - 10 * 60 * 60_000) / 1000) * 1000;
  });

  it('reports both win rates, and they differ by the scratched trades', async () => {
    await seed([], { wins: 6, losses: 11, breakeven: 7 });

    const { rate } = await analytics.buildAnalytics(0.75);

    // 6 / 17 against 6 / 24 — the same numerator over two different questions.
    assert.equal(rate.excludingBreakeven, 35.3);
    assert.equal(rate.includingBreakeven, 25);
    assert.equal(rate.reliable, false, '17 settled trades is not a finding');
  });

  it('replays a scratched trade that went on to reach the target', async () => {
    // Closes at bar 1, then climbs to 111 without ever revisiting 95.
    script = { BEUSDT: [[101, 104, 111], [99, 102, 108]] };
    await seed([trade({ base: 'BE', outcome: 'breakeven' })], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    assert.equal(whatIf.wouldHaveWon, 1);
    assert.equal(whatIf.wouldHaveLost, 0);
    assert.equal(whatIf.cases[0]?.after, 'target');
  });

  it('replays one that went on to hit the original stop', async () => {
    script = { BFUSDT: [[101, 100, 99], [99, 97, 94]] };
    await seed([trade({ base: 'BF', outcome: 'breakeven' })], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    assert.equal(whatIf.wouldHaveLost, 1);
    assert.equal(whatIf.cases[0]?.after, 'stop');
  });

  it('counts the stop when one bar reached both levels', async () => {
    /*
     * Low 94 and high 111 in the same bar, and that bar is strictly after the
     * close — the bar *containing* the close is skipped on purpose, because its
     * extremes include price action from before the scratch.
     */
    script = { BGUSDT: [[101, 101, 111], [99, 99, 94]] };
    await seed([trade({ base: 'BG', outcome: 'breakeven' })], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    /*
     * The flattering reading would be "target". This analysis is used to argue
     * for raising the threshold, so it must not put its thumb on that scale.
     */
    assert.equal(whatIf.cases[0]?.after, 'stop');
  });

  it('stops replaying where the trade would have expired', async () => {
    /*
     * A day trade lives 36 hours. Reaching the target on the fortieth bar is not
     * a win the strategy would have held for, and counting it would credit the
     * record with patience it does not have.
     */
    const highs = Array.from({ length: 45 }, (_, i) => (i >= 40 ? 111 : 101));
    const lows = highs.map(() => 99);
    script = { BHUSDT: [highs, lows] };

    tapeStart = Math.floor((Date.now() - 45 * 60 * 60_000) / 1000) * 1000;
    await seed([trade({ base: 'BH', outcome: 'breakeven' })], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    assert.equal(whatIf.cases[0]?.after, 'neither');
    assert.equal(whatIf.wouldHaveWon, 0);
  });

  it('says "cannot answer" rather than "did not happen"', async () => {
    // No tape at all for this symbol.
    script = {};
    await seed([trade({ base: 'BI', outcome: 'breakeven' })], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    /*
     * The distinction the whole module rests on. Folding `unknown` into
     * `neither` would let a missing candle window argue for a parameter change.
     */
    assert.equal(whatIf.unknown, 1);
    assert.equal(whatIf.neither, 0);
    assert.equal(whatIf.wouldHaveWonPct, null);
  });

  it('refuses to call a coin-flip margin a finding', async () => {
    /*
     * The first real dataset produced 7 target against 5 stop, and a bare
     * `>= 10 samples` rule called that reliable. Seven-to-five is what a fair
     * coin does; a module used to justify a parameter change must not launder
     * it into evidence.
     */
    const cases = [];
    for (let i = 0; i < 7; i += 1) cases.push({ base: `W${i}`, up: true });
    for (let i = 0; i < 5; i += 1) cases.push({ base: `L${i}`, up: false });

    for (const entry of cases) {
      script[`${entry.base}USDT`] = entry.up
        ? [[101, 104, 111], [99, 102, 108]]
        : [[101, 100, 99], [99, 97, 94]];
    }
    await seed(
      cases.map((entry) => trade({ base: entry.base, outcome: 'breakeven' })),
      { wins: 14, losses: 49, breakeven: cases.length },
    );

    const { whatIf } = await analytics.buildAnalytics(0.75);

    assert.equal(whatIf.wouldHaveWon, 7);
    assert.equal(whatIf.wouldHaveLost, 5);
    assert.equal(whatIf.reliable, false, '7-5 is inside one standard error of 50/50');
    assert.match(whatIf.reading, /coin flip/);
  });

  it('calls a margin that clears the noise what it is', async () => {
    const cases = [];
    for (let i = 0; i < 18; i += 1) cases.push({ base: `X${i}`, up: true });
    for (let i = 0; i < 4; i += 1) cases.push({ base: `Y${i}`, up: false });

    for (const entry of cases) {
      script[`${entry.base}USDT`] = entry.up
        ? [[101, 104, 111], [99, 102, 108]]
        : [[101, 100, 99], [99, 97, 94]];
    }
    await seed(
      cases.map((entry) => trade({ base: entry.base, outcome: 'breakeven' })),
      { wins: 10, losses: 10, breakeven: cases.length },
    );

    const { whatIf } = await analytics.buildAnalytics(0.75);

    assert.equal(whatIf.reliable, true, '18-4 is well outside coin-flip range');
    assert.match(whatIf.reading, /worth moving/);
  });

  it('projects the rate the record would show without the scratches', async () => {
    script = { PAUSDT: [[101, 104, 111], [99, 102, 108]] };
    await seed([trade({ base: 'PA', outcome: 'breakeven' })], { wins: 14, losses: 49, breakeven: 1 });

    const { rate, whatIf } = await analytics.buildAnalytics(0.75);

    /*
     * The number that actually answers "would raising the threshold help": one
     * more win over one more decided trade, not the flattering share measured
     * only across trades that resolved.
     */
    assert.equal(rate.excludingBreakeven, 22.2);
    assert.equal(whatIf.projectedRate, 23.4);
  });

  it('correlates confidence with outcome when both classes exist', async () => {
    await seed(
      [
        trade({ base: 'CA', outcome: 'win', confidence: 90 }),
        trade({ base: 'CB', outcome: 'win', confidence: 85 }),
        trade({ base: 'CC', outcome: 'loss', confidence: 65 }),
        trade({ base: 'CD', outcome: 'loss', confidence: 60 }),
      ],
      { wins: 2, losses: 2 },
    );

    const { confidence } = await analytics.buildAnalytics(0.75);

    assert.ok((confidence.r ?? 0) > 0.9, 'a clean split should correlate strongly');
    assert.equal(confidence.meanWinning, 87.5);
    assert.equal(confidence.meanLosing, 62.5);
    // Four trades is not evidence, however clean the split looks.
    assert.equal(confidence.reliable, false);
    assert.match(confidence.reading, /too few to act on/);
  });

  it('excludes trades with no stored score instead of reading them as zero', async () => {
    await seed(
      [
        trade({ base: 'DA', outcome: 'win', confidence: 80 }),
        trade({ base: 'DB', outcome: 'loss', confidence: 70 }),
        // Opened before the field existed.
        trade({ base: 'DC', outcome: 'loss' }),
        trade({ base: 'DD', outcome: 'win' }),
      ],
      { wins: 2, losses: 2 },
    );

    const { confidence } = await analytics.buildAnalytics(0.75);

    assert.equal(confidence.sample, 2);
    assert.equal(confidence.missing, 2);
    /*
     * Defaulting the absent scores to 0 would have produced a large, confident-
     * looking r describing when the field was added rather than how the
     * strategy performs.
     */
    assert.equal(confidence.meanLosing, 70);
  });

  it('declines to correlate when only one outcome has occurred', async () => {
    await seed(
      [trade({ base: 'EA', outcome: 'win', confidence: 80 }), trade({ base: 'EB', outcome: 'win', confidence: 75 })],
      { wins: 2 },
    );

    const { confidence } = await analytics.buildAnalytics(0.75);

    assert.equal(confidence.r, null);
    assert.match(confidence.reading, /Not enough settled trades/);
  });

  it('reads an old record that predates the moving stop', async () => {
    // No `initialStopLoss`, as written before the stop could move.
    const legacy = trade({ base: 'FA', outcome: 'breakeven' }) as Record<string, unknown>;
    delete legacy.initialStopLoss;

    script = { FAUSDT: [[101, 100, 99], [99, 97, 94]] };
    await seed([legacy], { breakeven: 1 });

    const { whatIf } = await analytics.buildAnalytics(0.75);

    // Falls back to the stop it does carry rather than reading `undefined`.
    assert.equal(whatIf.cases[0]?.originalStop, 95);
    assert.equal(whatIf.cases[0]?.after, 'stop');
  });

  it('renders a summary that carries its own sample size', async () => {
    await seed([], { wins: 6, losses: 11, breakeven: 7 });

    const text = analytics.formatAnalytics(await analytics.buildAnalytics(0.75));

    assert.match(text, /75% of the way to target/);
    assert.match(text, /Excluding breakeven/);
    // A rate printed without its caveat invites being read as a finding.
    assert.match(text, /too few to draw a conclusion/);
  });
});
