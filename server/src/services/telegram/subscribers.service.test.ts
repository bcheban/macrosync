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
/** Persistent keyboards, in the order they were attached. */
let replyKeyboards: string[][][] = [];

const okReply = { status: 200, body: { ok: true, result: {} } };

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url);

    if (target.includes('/sendMessage')) {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        chat_id: string;
        text: string;
        reply_markup?: { keyboard?: { text: string }[][] };
      };
      posted.push([payload.chat_id, payload.text]);

      const rows = payload.reply_markup?.keyboard;
      if (rows) replyKeyboards.push(rows.map((row) => row.map((button) => button.text)));

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
    // 82 is inside a published band. 70 sits in one the emitter holds back,
    // so every dispatch case here would have tested a call it refuses to send.
    confidence: 82,
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

/** A settled trade at a given confidence. Long from 100, risking 10, target 120. */
const closed = (
  confidence: number,
  outcome: 'win' | 'loss',
  id: string,
  strategy = 'day',
) => ({
  id,
  symbol: 'XUSDT',
  base: 'X',
  strategy,
  side: 'buy',
  entry: 100,
  stopLoss: 90,
  initialStopLoss: 90,
  takeProfit: 120,
  confidence,
  timeframe: '1h',
  openedAt: new Date(Date.now() - 86_400_000).toISOString(),
  closedAt: new Date().toISOString(),
  outcome,
  resultPct: outcome === 'win' ? 20 : -10,
});

describe('the published record', () => {
  it('marks a confidence bracket that has too few trades to mean anything', async () => {
    /*
     * The dashboard greys a rate under ten settled trades; a chat has no
     * greying, so the bot marks the row instead. Same threshold on both sides,
     * because the two must not disagree about which rows are worth acting on.
     *
     * 80–90 gets twelve trades and 90+ gets two, so one row carries the mark
     * and the other does not — which is the only arrangement that proves the
     * threshold is being read rather than the mark being printed always.
     */
    const store = await import('../store/store.js');
    const history = [
      ...Array.from({ length: 7 }, (_, i) => closed(85, 'win', `w${i}`)),
      ...Array.from({ length: 5 }, (_, i) => closed(85, 'loss', `l${i}`)),
      closed(95, 'win', 'h1'),
      closed(95, 'loss', 'h2'),
      // Under 60: belongs to no bracket and must not appear anywhere.
      closed(40, 'win', 'x1'),
    ];
    await store.setJson(store.storeKey('trades:history'), history);
    await store.setJson(store.storeKey('trades:stats'), {
      wins: 9, losses: 6, expired: 0, superseded: 0, voided: 0, breakeven: 0,
      byStrategy: { day: { wins: 9, losses: 6 } },
      updatedAt: new Date().toISOString(),
    });

    await start(901, 'en');
    posted = [];
    await webhook.handleUpdate({ message: { chat: { id: 901 }, text: '/stats' } });
    const text = posted.map(([, body]) => body).join(' ');

    // Twelve trades: a plain row.
    assert.match(text, /80–90/);
    assert.match(text, /58%/);
    // Two trades: marked, and the note explaining the mark is present.
    assert.match(text, /90\+/);
    assert.match(text, /⚠/);
    assert.match(text, /fewer than 10 settled trades/);
    // The 40-confidence trade belongs to no bracket.
    assert.ok(!/60–70/.test(text), 'an empty bracket should not be printed');

    /*
     * The net result counts it anyway, and that is the point of the assertion.
     *
     * Brackets exclude a trade with no attributable confidence; the total does
     * not, because it happened and its result is part of what the engine did.
     * The two therefore do not sum to each other by design.
     *
     * Risk is 10 on every trade here and every win pays 2R: 9 wins at +2R and
     * 6 losses at -1R is +12R across 15 settled. Nine, not eight — the
     * 40-confidence win is one of them, which is the whole point.
     */
    /*
     * Net leads, gross follows. The headline used to be gross alone, which is
     * the figure somebody traded on while the fees quietly outweighed it.
     */
    assert.match(text, /Net result \+11\.9R/);
    assert.match(text, /\+12\.0R gross/);
    assert.match(text, /over 15 settled trades/);

    /*
     * And the same figure in dollars, at the simulated $100 per trade. Pinned
     * because the multiplier lives in two repositories that do not compile
     * against each other — if one drifts, this is what notices.
     */
    // The dollar figure follows the net, not the gross.
    assert.match(text, /\+\$1,187/);
    // The simulation has to name its assumption and define R in the same
    // breath — that pairing is what stops a first-time reader treating the
    // dollars as an account balance.
    assert.match(text, /exactly \$100 is put at risk/);
    assert.match(text, /1R = that risk/);
  });

  it('counts as settled exactly what it reports as wins and losses', async () => {
    /*
     * The invariant the whole message rests on, pinned on its own.
     *
     * `settled` is not counted; it is wins + losses, from the same source as
     * the two numbers beside it. The header used to say 73 while the line
     * under it read 40W / 79L, because one came from the detailed log and the
     * other from the lifetime counters — both true about different sets of
     * trades, which is why the numbers alone never gave it away.
     *
     * The log here holds fewer trades than the counters, which is the normal
     * state after a few weeks: R can only be computed for trades whose prices
     * survive, so it covers the tail while the rate covers everything.
     */
    const store = await import('../store/store.js');
    await store.setJson(store.storeKey('trades:stats'), {
      wins: 40,
      losses: 79,
      expired: 54,
      superseded: 2,
      voided: 0,
      breakeven: 44,
      byStrategy: { day: { wins: 40, losses: 79 } },
      updatedAt: new Date().toISOString(),
    });
    await store.setJson(store.storeKey('trades:history'), [
      ...Array.from({ length: 3 }, (_, i) => closed(85, 'win', `w${i}`)),
      ...Array.from({ length: 2 }, (_, i) => closed(85, 'loss', `l${i}`)),
      // Neither a win nor a loss, and so in none of the sums.
      ...Array.from({ length: 6 }, (_, i) => ({ ...closed(85, 'win', `b${i}`), outcome: 'breakeven', resultPct: 0 })),
    ]);

    await start(903, 'en');
    posted = [];
    await webhook.handleUpdate({ message: { chat: { id: 903 }, text: '/stats' } });
    const text = posted.map(([, body]) => body).join(' ');

    const [, wins, losses] = text.match(/(\d+)W . (\d+)L/) ?? [];
    const [, settled] = text.match(/(\d+) settled trades/) ?? [];
    assert.equal(Number(settled), Number(wins) + Number(losses), text);
    assert.equal(Number(settled), 119, 'the headline count is the whole record');
    // And the narrower scope is named rather than left to be assumed.
    /*
     * ROI is over the same trades as everything else: -19R at the 0.75% a day
     * trade calls for. Derived from R and the setup's risk rather than from
     * stored prices, which is what lets it reach trades the log has dropped.
     */
    // -14.25% gross becomes a little worse once fees come out.
    assert.match(text, /-14\.25% gross/);
    // And no line on the message counts a different set of trades.
    assert.ok(!/most recent/i.test(text), 'nothing here describes a narrower window');
    /*
     * 40 wins at the 1.5 the engine targets, less 79 losses at one risk unit
     * each. The log holds five of those trades; the figure covers all 119.
     */
    // Gross is the ratio arithmetic; net is what an account would keep.
    assert.match(text, /-19\.0R gross/);
  });

  it('breaks the win rate down by setup, and omits setups with nothing settled', async () => {
    /*
     * The rows have to add up to the header, so the split reads whatever the
     * header reads — the lifetime counters. A reader who totals the setups and
     * lands on a different number is right to distrust both figures.
     *
     * The third row is the case worth pinning: a setup that has settled
     * nothing is left out rather than printed at 0%, because zero of zero is
     * not a win rate and sits in the list inviting comparison against setups
     * that have actually traded.
     */
    const store = await import('../store/store.js');
    await store.setJson(store.storeKey('trades:stats'), {
      wins: 9,
      losses: 5,
      expired: 2,
      superseded: 0,
      voided: 0,
      breakeven: 3,
      byStrategy: {
        scalping: { wins: 7, losses: 1 },
        day: { wins: 2, losses: 4 },
        swing: { wins: 0, losses: 0 },
      },
      updatedAt: new Date().toISOString(),
    });

    await start(900, 'en');
    posted = [];
    await webhook.handleUpdate({ message: { chat: { id: 900 }, text: '/stats' } });

    const text = posted.map(([, body]) => body).join(' ');
    assert.match(text, /Win rate 64%/);
    // The whole and its parts: 9 + 5 settled, split 7/1 and 2/4.
    assert.match(text, /9W . 5L/);
    assert.match(text, /14 settled trades/);
    assert.match(text, /7W . 1L/);
    assert.match(text, /2W . 4L/);
    // Swing settled nothing, so it has no row at all.
    assert.ok(!/Swing/i.test(text.split('By setup')[1] ?? ''));
    // Expired is not a wallet event, and is no longer counted at the reader.
    assert.ok(!/expired/i.test(text), 'no expired counter');
  });
});

describe('subscriber roster', () => {
  beforeEach(() => {
    resetMemoryStore();
    responses = {};
    posted = [];
    replyKeyboards = [];
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

  it('shows a newcomer the primary commands, and keeps the rest for /help', async () => {
    await start(500);
    const welcome = posted.map(([, text]) => text).find((text) => text.includes('Ayanox')) ?? '';

    /*
     * A stranger opening the bot cold cannot tap a command they have not been
     * shown, and "send /help" is a worse first instruction than the help
     * itself. So the primary commands are on the first screen.
     *
     * What stays out is the rest: an onboarding message that ends with how to
     * leave has spent its last line badly, and /stats_deep answers a question
     * nobody has yet.
     */
    for (const command of ['/settings', '/balance', '/stats', '/watching']) {
      assert.ok(welcome.includes(command), `welcome is missing ${command}`);
    }
    assert.ok(!welcome.includes('/stop'), 'how to leave does not belong on the first screen');
    assert.ok(!welcome.includes('/stats_deep'), '/stats_deep answers a question nobody has yet');

    posted = [];
    await webhook.handleUpdate({ message: { chat: { id: 500 }, text: '/help' } });
    const help = posted.at(-1)?.[1] ?? '';

    // /help is the complete list, including the two the welcome withholds.
    for (const command of ['/settings', '/balance', '/calc', '/guide', '/watching', '/mute', '/stop', '/stats_deep']) {
      assert.ok(help.includes(command), `help is missing ${command}`);
    }
  });

  it('answers a hub button in any language, not just the current one', async () => {
    await start(500, 'uk');
    posted = [];

    /*
     * A reply keyboard stays on screen until a message replaces it, so somebody
     * who has just switched language is still looking at the old labels. A press
     * that did nothing would read as a broken bot rather than as stale markup.
     */
    const { dict } = await import('./i18n/index.js');
    for (const locale of ['en', 'uk', 'de'] as const) {
      posted = [];
      await webhook.handleUpdate({ message: { chat: { id: 500 }, text: dict(locale).hubGuide } });
      assert.match(posted.at(-1)?.[1] ?? '', /Довідник|Guide|Leitfaden/, `${locale} label went unanswered`);
    }
  });

  it('sends the hub in the language the reader picked', async () => {
    await start(500, 'de');
    const withHub = replyKeyboards.at(-1);

    assert.ok(withHub, 'onboarding must leave a hub on screen');
    assert.deepEqual(withHub.flat(), ['📊 Statistik', '⚙️ Einstellungen', '🧮 Rechner', '📖 Leitfaden']);
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
