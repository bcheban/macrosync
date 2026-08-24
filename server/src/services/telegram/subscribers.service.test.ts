import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

/*
 * The roster decides who the bot can reach, so every bug in it is invisible from
 * the inside: a subscriber silently dropped, or one silently kept after they
 * blocked the bot, both look like a working system to everyone still receiving.
 */
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = 'owner-1';
process.env.ALERTS_SEND_GAP_MS = '1';
process.env.ALERTS_SEND_RETRIES = '2';
process.env.ALERTS_MAX_PER_RUN = '4';

const { resetMemoryStore } = await import('../store/store.js');
const subs = await import('./subscribers.service.js');
const alerts = await import('./alerts.service.js');
const trades = await import('../trades/trades.service.js');
const webhook = await import('./webhook.service.js');
const prefs = await import('./preferences.service.js');
const admin = await import('../admin/reset.service.js');

/** `chatId -> how Telegram answers for them`. */
let responses: Record<string, { status: number; body: unknown }> = {};
/** Every send, in order: `[chatId, text]`. */
let posted: [string, string][] = [];

const okReply = { status: 200, body: { ok: true, result: {} } };

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url);

    if (target.includes('/sendMessage')) {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { chat_id: string; text: string };
      posted.push([payload.chat_id, payload.text]);
      const reply = responses[payload.chat_id] ?? okReply;
      return {
        ok: reply.status < 400,
        status: reply.status,
        statusText: 'x',
        json: async () => reply.body,
        text: async () => JSON.stringify(reply.body),
      };
    }

    // answerCallbackQuery, and candles for anything the ledger touches.
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }), text: async () => '' };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

const signal = (base: string, verdict: 'buy' | 'sell' = 'buy', strategy = 'day') =>
  ({
    id: base,
    symbol: `${base}USDT`,
    base,
    strategy,
    timeframe: '1h',
    direction: 'long',
    verdict,
    summary: { text: 'reason' },
    confidence: 70,
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

const recipients = () => posted.map(([chatId]) => chatId);

describe('subscriber roster', () => {
  beforeEach(() => {
    resetMemoryStore();
    responses = {};
    posted = [];
  });

  it('seeds the owner so a fresh deploy still alerts somebody', async () => {
    assert.deepEqual(await subs.listSubscribers(), ['owner-1']);
  });

  it('lets the owner leave and stay gone', async () => {
    await subs.listSubscribers(); // seeds
    await subs.unsubscribe('owner-1');

    /*
     * The owner used to be merged in on every read, which made them the one
     * recipient who could never be removed — so blocking the bot meant every
     * run retried them forever.
     */
    assert.deepEqual(await subs.listSubscribers(), []);
  });

  it('adds a chat on /start without duplicating it', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, from: { first_name: 'Ada' }, text: '/start' } });
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });

    const roster = await subs.listSubscribers();
    assert.equal(roster.filter((id) => id === '500').length, 1);
    // The welcome goes to the chat that asked, both times.
    assert.deepEqual(recipients(), ['500', '500']);
  });

  it('removes a chat on /stop', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/stop' } });

    assert.ok(!(await subs.listSubscribers()).includes('500'));
  });

  it('ignores a message it has no command for', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: 'what do you think of ETH' } });

    // Answering every stray message is how a bot gets muted.
    assert.equal(posted.length, 0);
  });

  it('reaches every subscriber with one call', async () => {
    for (const id of [500, 501, 502]) {
      await webhook.handleUpdate({ message: { chat: { id }, text: '/start' } });
    }
    posted = [];

    const run = await alerts.notifySignals([signal('INJ')], undefined);

    assert.equal(run.sent, 1);
    assert.equal(run.deliveries, 4); // three, plus the seeded owner
    assert.deepEqual(recipients().sort(), ['500', '501', '502', 'owner-1']);
  });

  it('drops a subscriber who blocked the bot and keeps going for the rest', async () => {
    for (const id of [500, 501]) {
      await webhook.handleUpdate({ message: { chat: { id }, text: '/start' } });
    }
    posted = [];
    responses['501'] = { status: 403, body: { ok: false, description: 'Forbidden: bot was blocked by the user' } };

    const run = await alerts.notifySignals([signal('INJ')], undefined);

    // The block costs that one recipient, nobody else.
    assert.equal(run.pruned, 1);
    assert.equal(run.deliveries, 2);
    assert.equal(run.sent, 1);
    assert.ok(!(await subs.listSubscribers()).includes('501'));
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('skips a muted subscriber without dropping them', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    await subs.mute('500', 2 * 60 * 60_000);
    posted = [];

    await alerts.notifySignals([signal('INJ')], undefined);

    assert.ok(!recipients().includes('500'));
    // Muted, not gone: still on the roster for when it lifts.
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('mutes from a button press and reports how long for', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });

    await webhook.handleUpdate({
      callback_query: { id: 'cb-1', data: 'mute:2', message: { chat: { id: 500 } } },
    });

    const until = await subs.mutedUntil('500');
    assert.ok(until);
    const hours = (Date.parse(until) - Date.now()) / 3_600_000;
    assert.ok(hours > 1.9 && hours <= 2.01, `expected ~2h, got ${hours}`);
  });

  it('lifts a mute when the same chat starts again', async () => {
    await subs.mute('500', 2 * 60 * 60_000);
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });

    assert.equal(await subs.mutedUntil('500'), null);
  });

  it('answers the stats button in the chat that pressed it', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    posted = [];

    await webhook.handleUpdate({
      callback_query: { id: 'cb-2', data: 'stats', message: { chat: { id: 500 } } },
    });

    assert.equal(posted.length, 1);
    assert.equal(posted[0]?.[0], '500');
    assert.match(posted[0]?.[1] ?? '', /trades on the record|Win rate|still open/);
  });

  it('defaults a new subscriber to every strategy', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });

    /*
     * A chat that has never opened /settings has no stored record, and reading
     * that as "wants nothing" would silence them permanently. The default has
     * to be the permissive one.
     */
    assert.deepEqual(await prefs.getPrefs('500'), { scalping: true, day: true, swing: true });
  });

  it('skips a strategy the recipient turned off, and only that one', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    await prefs.togglePref('500', 'scalping');
    posted = [];

    await alerts.notifySignals([signal('INJ', 'buy', 'scalping')], undefined);
    assert.ok(!recipients().includes('500'), 'scalping was turned off');

    posted = [];
    await alerts.notifySignals([signal('SOL', 'buy', 'swing')], undefined);
    assert.ok(recipients().includes('500'), 'swing was left on');
  });

  it('toggles a strategy from the settings keyboard', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/settings' } });
    const panel = posted.at(-1)?.[1] ?? '';
    assert.match(panel, /Which calls do you want/);

    await webhook.handleUpdate({
      callback_query: { id: 'cb', data: 'pref:swing', message: { message_id: 7, chat: { id: 500 } } },
    });

    assert.equal((await prefs.getPrefs('500')).swing, false);
    assert.equal((await prefs.getPrefs('500')).day, true, 'one tap must move one strategy');
  });

  it('lets somebody turn everything off without unsubscribing', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    for (const strategy of ['scalping', 'day', 'swing'] as const) await prefs.togglePref('500', strategy);

    posted = [];
    await alerts.notifySignals([signal('INJ', 'buy', 'day')], undefined);

    assert.ok(!recipients().includes('500'));
    // Quiet until further notice is a coherent thing to want; gone is not.
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('still tells them how a call ended, whatever they have since turned off', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    for (const strategy of ['scalping', 'day', 'swing'] as const) await prefs.togglePref('500', strategy);
    posted = [];

    const closed = [
      {
        id: 'x', symbol: 'INJUSDT', base: 'INJ', strategy: 'day', side: 'buy',
        entry: 100, stopLoss: 95, takeProfit: 110, timeframe: '1h',
        openedAt: new Date().toISOString(), closedAt: new Date().toISOString(),
        outcome: 'win', resultPct: 10,
      },
    ] as never;

    await alerts.notifyClosed(closed, { wins: 1, losses: 0, expired: 0, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '' });

    // Being told how a call *ended* is not subscribing to new ones of that kind.
    assert.ok(recipients().includes('500'));
  });

  it('clears the ledger without touching the roster', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    await alerts.notifySignals([signal('INJ')], undefined);
    assert.ok((await trades.loadActive()).length > 0);

    const result = await admin.resetStore('ledger');

    assert.ok(result.deleted > 0);
    assert.equal((await trades.loadActive()).length, 0);
    assert.equal((await trades.loadStats()).wins, 0);
    // Wiping the ledger is recoverable in minutes; wiping the roster is not.
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('clears the roster too when asked explicitly', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });
    await prefs.togglePref('500', 'swing');

    await admin.resetStore('all');

    /*
     * Everyone is gone except the owner, who is re-seeded — a full reset returns
     * the deployment to the state of a fresh deploy, and a fresh deploy seeds
     * its operator so the next alert does not go nowhere.
     */
    assert.deepEqual(await subs.listSubscribers(), ['owner-1']);
    assert.ok(!(await subs.listSubscribers()).includes('500'));
    // Preferences go with the subscriber, so a re-start begins clean.
    assert.deepEqual(await prefs.getPrefs('500'), { scalping: true, day: true, swing: true });
  });

  it('publishes the call even when every subscriber is muted', async () => {
    await subs.listSubscribers(); // seeds the owner
    await subs.mute('owner-1', 60_000);

    const run = await alerts.notifySignals([signal('INJ')], undefined);

    /*
     * Nobody was told, and that is fine — but the ledger still opens the trade.
     * Letting a muted phone stop the record would leave the win rate with holes
     * wherever the only subscriber wanted an evening off.
     */
    assert.equal(run.deliveries, 0);
    assert.equal(run.failed, 0);
    const { loadActive } = await import('../trades/trades.service.js');
    assert.equal((await loadActive()).length, 1);
  });
});
