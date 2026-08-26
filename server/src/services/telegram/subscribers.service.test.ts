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

    /*
     * An in-place edit is a message the reader sees, so it belongs in `posted`
     * alongside sends — the sub-menus never send anything, and a stub that
     * ignored edits would report an empty screen for a working panel.
     */
    if (target.includes('/editMessageText')) {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { chat_id: string; text: string };
      posted.push([payload.chat_id, payload.text]);
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }), text: async () => '' };
    }

    // answerCallbackQuery, and candles for anything the ledger touches.
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }), text: async () => '' };
  }) as unknown as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

/**
 * Walks a chat through the whole of onboarding.
 *
 * Three steps now, not one: subscribe, pick a language, pick a strategy. A new
 * subscriber starts opted out of everything, so a test that stops after the
 * language question has a chat that correctly receives nothing.
 */
const start = async (id: number, locale = 'en', strategy: string | null = 'day') => {
  await webhook.handleUpdate({ message: { chat: { id }, from: { first_name: 'Ada' }, text: '/start' } });
  await webhook.handleUpdate({
    callback_query: { id: `lang-${id}`, data: `lang:${locale}`, message: { message_id: 1, chat: { id } } },
  });
  if (strategy) {
    await webhook.handleUpdate({
      callback_query: { id: `pref-${id}`, data: `pref:${strategy}`, message: { message_id: 1, chat: { id } } },
    });
  }
};

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
    await start(500);
    await start(500);

    const roster = await subs.listSubscribers();
    assert.equal(roster.filter((id) => id === '500').length, 1);
    /*
     * Everything the chat saw, in order: the language question, the welcome that
     * follows answering it, the strategy panel redrawn by the onboarding tap,
     * and the welcome for the second /start — which skips the question, because
     * re-asking would read as the bot forgetting.
     */
    // Everything went to the one chat, and the roster holds it once.
    assert.ok(recipients().length > 0);
    assert.ok(recipients().every((id) => id === '500'));
  });

  it('removes a chat on /stop', async () => {
    await start(500);
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
      await start(id);
    }
    posted = [];

    const run = await alerts.notifySignals([signal('INJ')], undefined);

    assert.equal(run.sent, 1);
    assert.equal(run.deliveries, 4); // three, plus the seeded owner
    assert.deepEqual(recipients().sort(), ['500', '501', '502', 'owner-1']);
  });

  it('drops a subscriber who blocked the bot and keeps going for the rest', async () => {
    for (const id of [500, 501]) {
      await start(id);
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
    await start(500);
    await subs.mute('500', 2 * 60 * 60_000);
    posted = [];

    await alerts.notifySignals([signal('INJ')], undefined);

    assert.ok(!recipients().includes('500'));
    // Muted, not gone: still on the roster for when it lifts.
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('mutes from a button press and reports how long for', async () => {
    await start(500);

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
    await start(500);

    assert.equal(await subs.mutedUntil('500'), null);
  });

  it('answers the stats button in the chat that pressed it', async () => {
    await start(500);
    posted = [];

    await webhook.handleUpdate({
      callback_query: { id: 'cb-2', data: 'stats', message: { chat: { id: 500 } } },
    });

    assert.equal(posted.length, 1);
    assert.equal(posted[0]?.[0], '500');
    assert.match(posted[0]?.[1] ?? '', /trades on the record|Win rate|still open/);
  });

  it('starts a brand-new subscriber opted out of everything', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 700 }, text: '/start' } });
    await webhook.handleUpdate({
      callback_query: { id: 'l', data: 'lang:en', message: { message_id: 1, chat: { id: 700 } } },
    });

    const loaded = await prefs.getPrefs('700');
    assert.deepEqual(loaded.strategies, { scalping: false, day: false, swing: false });
    assert.equal(loaded.configured, false);

    posted = [];
    await alerts.notifySignals([signal('INJ')], undefined);
    assert.ok(!recipients().includes('700'), 'nothing chosen, nothing sent');
  });

  it('leaves a subscriber with no preferences row receiving everything', async () => {
    /*
     * The regression this guards. Most subscribers joined before /settings
     * existed and have no row at all; reading that absence as "wants nothing"
     * would silently unsubscribe people who have been getting calls for weeks.
     * Two of the three production subscribers look exactly like this.
     */
    await subs.subscribe('800', {});
    assert.deepEqual((await prefs.getPrefs('800')).strategies, { scalping: true, day: true, swing: true });

    posted = [];
    await alerts.notifySignals([signal('INJ')], undefined);
    assert.ok(recipients().includes('800'));
  });

  it('does not opt out a returning subscriber who sends /start again', async () => {
    await subs.subscribe('800', {});
    // Already on the roster, so onboarding must not reset their preferences.
    await webhook.handleUpdate({ message: { chat: { id: 800 }, text: '/start' } });

    assert.deepEqual((await prefs.getPrefs('800')).strategies, { scalping: true, day: true, swing: true });
  });

  it('welcomes with the same glossary /help answers with', async () => {
    await start(500);
    // The welcome is the message carrying the glossary, not the last one sent —
    // onboarding ends on the strategy panel.
    const welcome = posted.map(([, text]) => text).find((text) => text.includes('/stats')) ?? '';

    posted = [];
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/help' } });
    const help = posted.at(-1)?.[1] ?? '';

    /*
     * Both are built from one list, so the blue Menu button, the welcome and
     * /help cannot end up describing different bots.
     */
    for (const command of ['/settings', '/balance', '/stats', '/help', '/mute', '/stop']) {
      assert.ok(welcome.includes(command), `welcome is missing ${command}`);
      assert.ok(help.includes(command), `help is missing ${command}`);
    }
  });

  it('publishes a menu Telegram will accept', () => {
    for (const entry of webhook.menuCommands()) {
      assert.match(entry.command, /^[a-z0-9_]{1,32}$/, `${entry.command} is not a valid command name`);
      assert.ok(entry.description.length > 0 && entry.description.length <= 256);
      // The Menu button shows one line; a newline in it renders as a break.
      assert.ok(!entry.description.includes(String.fromCharCode(10)));
    }
  });

  it('answers an empty /balance with the shape it wants', async () => {
    await start(500);
    posted = [];

    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/balance' } });
    const reply = posted.at(-1)?.[1] ?? '';

    assert.match(reply, /Invalid format/);
    // The example matters more than the complaint.
    assert.match(reply, /balance 1000 1/);
    assert.match(reply, /balance 0 0/);
  });

  it('asks a new subscriber for a language before anything else', async () => {
    await webhook.handleUpdate({
      message: { chat: { id: 600 }, from: { first_name: 'Ada', language_code: 'de-DE' }, text: '/start' },
    });

    // Asked in the language their phone suggests, so the one message they
    // cannot yet have configured is still likely readable.
    assert.match(posted.at(-1)?.[1] ?? '', /Sprache wählen/);
    assert.equal(posted.length, 1, 'the welcome waits for an answer');
  });

  it('does not ask again once answered', async () => {
    await start(500, 'uk');
    posted = [];

    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/start' } });

    assert.equal(posted.length, 1);
    assert.ok(!/Обери мову/.test(posted[0]?.[1] ?? ''), 'the question must not repeat');
  });

  it('sends every later message in the language they picked', async () => {
    await start(500, 'de');
    posted = [];

    await alerts.notifySignals([signal('INJ')], undefined);
    const alert = posted.find(([id]) => id === '500')?.[1] ?? '';

    assert.match(alert, /Einstieg/, 'entry label is German');
    assert.match(alert, /Max\. sicherer Hebel/);
    // And nobody else's language changed.
    const owner = posted.find(([id]) => id === 'owner-1')?.[1] ?? '';
    assert.match(owner, /Entry/);
  });

  it('renders the same call in three languages at once', async () => {
    await start(500, 'uk');
    await start(501, 'de');
    await start(502, 'en');
    posted = [];

    await alerts.notifySignals([signal('SOL')], undefined);

    const of = (id: string) => posted.find(([chat]) => chat === id)?.[1] ?? '';
    assert.match(of('500'), /Вхід/);
    assert.match(of('501'), /Einstieg/);
    assert.match(of('502'), /Entry/);
  });

  it('skips a notification kind the recipient turned off', async () => {
    await start(500);
    await prefs.toggleChannel('500', 'signals');
    posted = [];

    await alerts.notifySignals([signal('INJ')], undefined);
    assert.ok(!recipients().includes('500'), 'new signals were turned off');

    // But results still reach them, because that filter is separate.
    posted = [];
    const closed = [
      {
        id: 'x', symbol: 'INJUSDT', base: 'INJ', strategy: 'day', side: 'buy',
        entry: 100, stopLoss: 95, initialStopLoss: 95, takeProfit: 110, timeframe: '1h',
        openedAt: new Date().toISOString(), closedAt: new Date().toISOString(),
        outcome: 'win', resultPct: 10,
      },
    ] as never;
    await alerts.notifyClosed(closed, {
      wins: 1, losses: 0, expired: 0, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '',
    });
    assert.ok(recipients().includes('500'));
  });

  it('withholds results from somebody who switched them off', async () => {
    await start(500);
    await prefs.toggleChannel('500', 'results');
    posted = [];

    const closed = [
      {
        id: 'y', symbol: 'SOLUSDT', base: 'SOL', strategy: 'day', side: 'buy',
        entry: 100, stopLoss: 95, initialStopLoss: 95, takeProfit: 110, timeframe: '1h',
        openedAt: new Date().toISOString(), closedAt: new Date().toISOString(),
        outcome: 'loss', resultPct: -5,
      },
    ] as never;

    await alerts.notifyClosed(closed, {
      wins: 0, losses: 1, expired: 0, superseded: 0, voided: 0, breakeven: 0, byStrategy: {}, updatedAt: '',
    });

    // Their explicit choice, and the panel warns what it costs them.
    assert.ok(!recipients().includes('500'));
  });

  it('warns about the one combination nobody picks on purpose', async () => {
    await start(500);
    await prefs.toggleChannel('500', 'results');
    posted = [];

    /*
     * The warning lives in the notifications sub-menu now, which is where the
     * switch that causes it is — a caution on the root screen would be about a
     * setting the reader cannot see.
     */
    await webhook.handleUpdate({
      callback_query: { id: 'c', data: 'settings:channels', message: { message_id: 4, chat: { id: 500 } } },
    });
    const panel = posted.at(-1)?.[1] ?? '';

    // Told to enter, never told it ended.
    assert.match(panel, /never told/);
  });

  it('keeps a preference set before the record changed shape', async () => {
    const { setJson, storeKey } = await import('../store/store.js');
    // The flat shape, as written by the version that only had strategies.
    await setJson(storeKey('telegram:prefs:900'), { scalping: true, day: false, swing: true });

    const loaded = await prefs.getPrefs('900');

    /*
     * A subscriber who turned day trading off must not have it turned back on
     * by a deployment. Silently restoring a preference somebody set is worse
     * than never having offered the setting.
     */
    assert.equal(loaded.strategies.day, false);
    assert.equal(loaded.strategies.scalping, true);
    // And the new fields arrive at their permissive defaults.
    assert.deepEqual(loaded.channels, { signals: true, updates: true, results: true });
    assert.equal(loaded.locale, 'en');
  });

  it('leaves a new subscriber with exactly what they picked', async () => {
    await start(500, 'en', 'day');

    // Opt-in: nothing is on until a tap turns it on, and only that one.
    assert.deepEqual((await prefs.getPrefs('500')).strategies, { scalping: false, day: true, swing: false });
    assert.equal((await prefs.getPrefs('500')).configured, true);
  });

  it('sends only the strategies the recipient turned on', async () => {
    // Onboarded on day trading, then adds swing. Scalping is never turned on.
    await start(500, 'en', 'day');
    await prefs.toggleStrategy('500', 'swing');
    posted = [];

    await alerts.notifySignals([signal('INJ', 'buy', 'scalping')], undefined);
    assert.ok(!recipients().includes('500'), 'scalping was never turned on');

    posted = [];
    await alerts.notifySignals([signal('SOL', 'buy', 'swing')], undefined);
    assert.ok(recipients().includes('500'), 'swing was turned on');
  });

  it('toggles a strategy from the settings keyboard', async () => {
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/settings' } });
    const panel = posted.at(-1)?.[1] ?? '';
    assert.match(panel, /Settings/);

    await webhook.handleUpdate({
      callback_query: { id: 'cb', data: 'pref:swing', message: { message_id: 7, chat: { id: 500 } } },
    });

    assert.equal((await prefs.getPrefs('500')).strategies.swing, false);
    assert.equal((await prefs.getPrefs('500')).strategies.day, true, 'one tap must move one strategy');
  });

  it('lets somebody turn everything off without unsubscribing', async () => {
    await start(500);
    // 'day' is already on from onboarding; turn the other two on, then all off.
    for (const strategy of ['scalping', 'swing'] as const) await prefs.toggleStrategy('500', strategy);
    for (const strategy of ['scalping', 'day', 'swing'] as const) await prefs.toggleStrategy('500', strategy);

    posted = [];
    await alerts.notifySignals([signal('INJ', 'buy', 'day')], undefined);

    assert.ok(!recipients().includes('500'));
    // Quiet until further notice is a coherent thing to want; gone is not.
    assert.ok((await subs.listSubscribers()).includes('500'));
  });

  it('still tells them how a call ended, whatever they have since turned off', async () => {
    await start(500);
    // 'day' is already on from onboarding; turn the other two on, then all off.
    for (const strategy of ['scalping', 'swing'] as const) await prefs.toggleStrategy('500', strategy);
    for (const strategy of ['scalping', 'day', 'swing'] as const) await prefs.toggleStrategy('500', strategy);
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
    await start(500);
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
    await start(500);
    await prefs.toggleStrategy('500', 'swing');

    await admin.resetStore('all');

    /*
     * Everyone is gone except the owner, who is re-seeded — a full reset returns
     * the deployment to the state of a fresh deploy, and a fresh deploy seeds
     * its operator so the next alert does not go nowhere.
     */
    assert.deepEqual(await subs.listSubscribers(), ['owner-1']);
    assert.ok(!(await subs.listSubscribers()).includes('500'));
    // Preferences go with the subscriber, so a re-start begins clean.
    assert.deepEqual((await prefs.getPrefs('500')).strategies, { scalping: true, day: true, swing: true });
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
