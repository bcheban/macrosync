import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
 * These cover the dispatch path rather than the wording of a message.
 *
 * The bug they exist for: alert state was committed *before* the send, so a
 * message Telegram rejected still started the pair's ninety-minute quiet period.
 * Nothing arrived, nothing retried, and from the outside the bot had simply gone
 * quiet — the single hardest failure in this codebase to notice.
 */
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '424242';
process.env.TELEGRAM_COOLDOWN_MS = '5400000';
process.env.ALERTS_SEND_GAP_MS = '1';
process.env.ALERTS_SEND_RETRIES = '2';
process.env.ALERTS_MAX_PER_RUN = '2';

const { resetMemoryStore } = await import('../store/store.js');
const { deliveryStats } = await import('./telegram.client.js');
const alerts = await import('./alerts.service.js');
const trades = await import('../trades/trades.service.js');

/** How the next Telegram call answers. */
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, result: {} } };
let posted: string[] = [];

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('api.telegram.org')) {
      posted.push(JSON.parse(String(init?.body ?? '{}')).text ?? '');
      return {
        ok: reply.status < 400,
        status: reply.status,
        statusText: 'x',
        json: async () => reply.body,
        text: async () => JSON.stringify(reply.body),
      };
    }
    // Candles, for anything the ledger resolves.
    return { ok: true, status: 200, statusText: 'OK', json: async () => [], text: async () => '' };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

const signal = (base: string, verdict: 'buy' | 'sell' | 'wait', confidence = 70, strategy = 'day') =>
  ({
    id: base,
    symbol: `${base}USDT`,
    base,
    strategy,
    timeframe: '1h',
    direction: verdict === 'sell' ? 'short' : 'long',
    verdict,
    summary: { text: 'reason' },
    confidence,
    status: 'live',
    price: 100,
    entry: 100,
    stopLoss: 95,
    takeProfit: 110,
    riskReward: 2,
    suggestedRiskPct: 1,
    indicators: { rsi: 30, emaFast: 1, emaSlow: 1, macdHistogram: 0, atrPct: 1, volumeRatio: 1 },
    rationale: [],
    source: 'mexc',
    updatedAt: new Date().toISOString(),
  }) as never;

describe('alert dispatch', () => {
  beforeEach(() => {
    resetMemoryStore();
    posted = [];
    reply = { status: 200, body: { ok: true, result: {} } };
  });

  it('sends a confirmed call and records it', async () => {
    const run = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.deepEqual(run, { sent: 1, failed: 0, dropped: 0, deliveries: 1, pruned: 0 });
    assert.equal(posted.length, 1);
    assert.match(posted[0] ?? '', /INJ/);
    // The ledger only ever tracks what the channel was actually told.
    assert.equal((await trades.loadActive()).length, 1);
  });

  it('does not open a trade for a message that never arrived', async () => {
    reply = { status: 400, body: { ok: false, description: 'Bad Request: unsupported tag' } };

    const run = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.equal(run.sent, 0);
    assert.equal(run.failed, 1);
    assert.equal((await trades.loadActive()).length, 0);
  });

  it('retries the pair on the next run when a send failed', async () => {
    reply = { status: 503, body: { ok: false, description: 'upstream' } };
    await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    // The failure must not have started the quiet period.
    reply = { status: 200, body: { ok: true, result: {} } };
    posted = [];
    const second = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.equal(second.sent, 1);
    assert.equal(posted.length, 1);
  });

  it('treats a 200 carrying ok:false as a failure', async () => {
    // The Bot API really does answer this way; the HTTP status alone lies.
    reply = { status: 200, body: { ok: false, description: 'chat not found' } };

    const run = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.equal(run.sent, 0);
    assert.equal(run.failed, 1);
    assert.equal((await trades.loadActive()).length, 0);
  });

  it('stops retrying a call that can never be delivered', async () => {
    // A block is permanent in a way `chat not found` is not — that one also
    // covers a subscriber who has yet to press Start on a freshly issued bot.
    reply = { status: 403, body: { ok: false, description: 'Forbidden: bot was blocked by the user' } };

    // Permanent rejections give up on the first run rather than every run forever.
    await alerts.notifySignals([signal('INJ', 'buy')], undefined);
    posted = [];
    const second = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.equal(second.sent, 0);
    assert.equal(second.failed, 0);
    assert.equal(posted.length, 0);
  });

  it('holds the quiet period after a call that did arrive', async () => {
    await alerts.notifySignals([signal('INJ', 'buy')], undefined);
    posted = [];
    const second = await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    assert.equal(second.sent, 0);
    assert.equal(posted.length, 0);
  });

  it('sends the highest-conviction calls when the run is capped', async () => {
    const run = await alerts.notifySignals(
      [signal('AAA', 'buy', 64), signal('BBB', 'buy', 91), signal('CCC', 'buy', 78)],
      undefined,
    );

    assert.equal(run.sent, 2);
    // Reported, not swallowed: a cap that hides what it dropped is a lie.
    assert.equal(run.dropped, 1);
    assert.match(posted[0] ?? '', /BBB/);
    assert.match(posted[1] ?? '', /CCC/);
  });

  it('spends one budget across every strategy in the run', async () => {
    /*
     * The cap is a per-run budget, not a per-strategy one. Alerting once per
     * strategy tripled it, and let a marginal call go out ahead of a far
     * stronger one because each strategy ranked its own in isolation.
     */
    const run = await alerts.notifySignals(
      [
        signal('AAA', 'buy', 66, 'day'),
        signal('BBB', 'buy', 95, 'swing'),
        signal('CCC', 'buy', 71, 'day'),
      ],
      undefined,
    );

    assert.equal(run.sent, 2);
    assert.equal(run.dropped, 1);
    // Conviction decides, whichever strategy produced it.
    assert.match(posted[0] ?? '', /BBB/);
    assert.match(posted[1] ?? '', /CCC/);
  });

  it('never publishes a scalp, however convinced it is', async () => {
    /*
     * Scalping lost money in every level geometry measured, on both halves of
     * the board. It still renders on the dashboard; what must not happen is it
     * reaching a subscriber or opening a trade against the record — so the
     * strongest possible scalp is the case worth pinning.
     */
    const run = await alerts.notifySignals(
      [signal('AAA', 'buy', 99, 'scalping'), signal('BBB', 'buy', 70, 'day')],
      undefined,
    );

    assert.equal(run.sent, 1);
    assert.equal(run.dropped, 0);
    assert.match(posted[0] ?? '', /BBB/);
    assert.ok(!posted.some((text) => text.includes('AAA')));
  });

  it('retries a rate-limited send rather than dropping the call', async () => {
    let first = true;
    const stub = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('api.telegram.org') && first) {
        first = false;
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => ({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 0 } }),
          text: async () => '',
        };
      }
      return stub(url, init);
    }) as unknown as typeof fetch;

    const run = await alerts.notifySignals([signal('INJ', 'buy')], undefined);
    globalThis.fetch = stub;

    assert.equal(run.sent, 1);
  });

  it('keeps delivery counters where a later invocation can read them', async () => {
    await alerts.notifySignals([signal('INJ', 'buy')], undefined);
    reply = { status: 500, body: { ok: false, description: 'boom' } };
    await alerts.notifySignals([signal('SOL', 'buy')], undefined);

    const stats = await deliveryStats();
    assert.equal(stats.delivered, 1);
    assert.equal(stats.failed, 1);
    // The reason a message did not arrive survives the invocation that lost it.
    assert.match(stats.lastError ?? '', /boom/);
  });
});
