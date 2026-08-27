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
process.env.PUBLIC_BASE_URL = 'https://terminal.test/';

const { resetMemoryStore } = await import('../store/store.js');
const { deliveryStats } = await import('./telegram.client.js');
const alerts = await import('./alerts.service.js');
const trades = await import('../trades/trades.service.js');

/** How the next Telegram call answers. */
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, result: {} } };
let posted: string[] = [];
/** The inline keyboard attached to each send, in the same order. */
let markups: { text: string; url?: string; callback_data?: string }[][][] = [];

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('api.telegram.org')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      posted.push(body.text ?? '');
      if (body.reply_markup?.inline_keyboard) markups.push(body.reply_markup.inline_keyboard);
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
    markups = [];
    reply = { status: 200, body: { ok: true, result: {} } };
  });

  it('puts the exchange and the terminal under a call, on separate rows', async () => {
    /*
     * Both are destinations, and a reader skimming an alert should not have to
     * pick the right one of two adjacent blue buttons — hence one per row. The
     * terminal link carries the reader's language, so it lands on the same
     * indexable URL the site advertises to search rather than on a page that
     * switches language under them.
     */
    await alerts.notifySignals([signal('INJ', 'buy')], undefined);

    const rows = markups[0] ?? [];
    const links = rows.flat().filter((button) => button.url);

    assert.equal(links.length, 2);
    assert.match(links[0]?.url ?? '', /mexc\.com/);

    /*
     * The terminal link is a deep link: the asset the alert is about, so the
     * reader lands on its chart rather than on the board. Parsed rather than
     * string-matched, because the thing worth pinning is that both parameters
     * survive together — hand-built query strings are where one silently
     * replaces the other.
     */
    const terminal = new URL(links[1]?.url ?? '');
    assert.equal(terminal.origin, 'https://terminal.test');
    assert.equal(terminal.pathname, '/');
    assert.equal(terminal.searchParams.get('symbol'), 'INJUSDT');
    // The owner's default locale is English, which stays the bare URL.
    assert.equal(terminal.searchParams.get('lang'), null);

    // Separate rows, and the trailing slash of PUBLIC_BASE_URL is normalised off.
    assert.ok(rows[0]?.length === 1 && rows[1]?.length === 1);
    assert.ok(!(links[1]?.url ?? '').includes('//?'));
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
     * strategy tripled it, and let a marginal scalp go out ahead of a far
     * stronger swing because each strategy ranked its calls in isolation.
     */
    const run = await alerts.notifySignals(
      [
        signal('AAA', 'buy', 66, 'scalping'),
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
