import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resetMemoryStore } from '../store/store.js';
import { announceFills, rememberCards } from './signal-cards.js';
import type { ActiveTrade } from '../trades/trades.service.js';
import type { Fill } from '../trades/targets.js';

/**
 * The ping is the one part of this system that cannot be taken back.
 *
 * An edit that runs twice leaves the card correct; a reply that runs twice
 * tells the roster a second time that TP1 hit, and the only fix is an apology.
 * So the interesting cases are all about repetition: the same run retried, a
 * later rung filling, a level already announced arriving again.
 */

const trade = (): ActiveTrade =>
  ({
    id: 'LABUSDT:day:1',
    symbol: 'LABUSDT',
    base: 'LAB',
    strategy: 'day',
    side: 'buy',
    entry: 100,
    stopLoss: 95,
    initialStopLoss: 95,
    takeProfit: 112.5,
    targets: [
      { level: 1, price: 105, share: 0.5 },
      { level: 2, price: 107.5, share: 0.3 },
      { level: 3, price: 112.5, share: 0.2 },
    ],
    fills: [],
    timeframe: '1h',
    openedAt: new Date().toISOString(),
  }) as ActiveTrade;

const fill = (level: number): Fill => ({
  level,
  price: 100 + level,
  share: 0.1,
  at: new Date().toISOString(),
  reason: 'target',
});

describe('the take-profit ping', () => {
  let posted: { chatId: string; text: string; replyTo?: number }[];
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    resetMemoryStore();
    posted = [];

    const { env } = await import('../../config/env.js');
    (env as { telegramBotToken: string }).telegramBotToken ||= 'test-token';

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (String(url).includes('sendMessage')) {
        posted.push({
          chatId: String(body.chat_id),
          text: String(body.text),
          replyTo: body.reply_parameters?.message_id,
        });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as typeof fetch;
  });

  const seed = async () => {
    await rememberCards('LABUSDT:day:1', [
      { chatId: '100', messageId: 555, html: '<b>card</b>', locale: 'en' },
      { chatId: '200', messageId: 777, html: '<b>card</b>', locale: 'en' },
    ]);
  };

  it('replies under the call each reader received, not to a channel', async () => {
    await seed();
    await announceFills(trade(), [fill(1)]);

    assert.equal(posted.length, 2, 'one per recipient');
    // Each reader's own copy has its own message id; replying to the wrong one
    // threads the note under somebody else's chat history.
    assert.deepEqual(
      posted.map((message) => [message.chatId, message.replyTo]),
      [['100', 555], ['200', 777]],
    );
    assert.match(posted[0]!.text, /\$LAB/);
    assert.match(posted[0]!.text, /TP1/);
    assert.match(posted[0]!.text, /50%/);
    assert.match(posted[0]!.text, /breakeven/i, 'the first rung is when the stop moves');
  });

  it('sends nothing the second time the same level arrives', async () => {
    await seed();
    await announceFills(trade(), [fill(1)]);
    posted = [];

    // The same run retried — a redeploy mid-scan, or a resolver that re-ran.
    const sent = await announceFills(trade(), [fill(1)]);

    assert.equal(sent, 0);
    assert.equal(posted.length, 0, 'a duplicate ping cannot be taken back');
  });

  it('announces a later rung, and only the part it booked', async () => {
    await seed();
    await announceFills(trade(), [fill(1)]);
    posted = [];

    await announceFills(trade(), [fill(2)]);

    assert.equal(posted.length, 2);
    assert.match(posted[0]!.text, /TP2/);
    /*
     * 30, not 80. The share named is what these rungs booked, not everything
     * booked so far — "secured 80%" after a ping that said 50% reads as 130%
     * of a position.
     */
    assert.match(posted[0]!.text, /30%/);
    assert.doesNotMatch(posted[0]!.text, /breakeven/i, 'the stop moved one rung ago');
  });

  it('folds rungs swept by one candle into a single ping', async () => {
    await seed();

    /*
     * Two rungs, one bar. A reader experiences that as one event, and two
     * notifications a second apart are the spam this design exists to avoid —
     * while each level still appears in exactly one reply, ever.
     */
    await announceFills(trade(), [fill(1), fill(2)]);

    assert.equal(posted.length, 2, 'two recipients, one message each');
    assert.match(posted[0]!.text, /TP1 \+ TP2/);
    assert.match(posted[0]!.text, /80%/);
  });

  it('stays quiet for a trade nobody was told about', async () => {
    // No cards: the alert never went out, so there is nothing to reply to.
    const sent = await announceFills(trade(), [fill(1)]);

    assert.equal(sent, 0);
    assert.equal(posted.length, 0);
  });

  it('ignores fills that are not targets', async () => {
    await seed();
    const stopped: Fill = { level: 0, price: 100, share: 0.5, at: '', reason: 'breakeven' };

    const sent = await announceFills(trade(), [stopped]);

    assert.equal(sent, 0, 'a stop is not a take profit');
  });

  it('reads the shape that shipped before announcements existed', async () => {
    /*
     * The first release stored a bare array of cards. Those keys are live, and
     * a trade whose document failed to load would lose both its edits and its
     * pings — so the older shape is read rather than discarded.
     */
    const { setJson, storeKey } = await import('../store/store.js');
    await setJson(storeKey('trades:cards:LABUSDT:day:1'), [
      { chatId: '100', messageId: 555, html: '<b>card</b>', locale: 'en' },
    ]);

    const sent = await announceFills(trade(), [fill(1)]);

    assert.equal(sent, 1);
    assert.equal(posted[0]?.replyTo, 555);
  });

  it('restores fetch', () => {
    globalThis.fetch = realFetch;
  });
});
