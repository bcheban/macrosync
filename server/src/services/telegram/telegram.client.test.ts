import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/**
 * The pacing that lets the book hold thirty trades instead of fifteen.
 *
 * Card edits went straight at the API with no gap and no backoff. One volatile
 * candle progressing a dozen trades rewrites a card per trade per subscriber,
 * back to back — and the moment Telegram answers 429 the edit returned false
 * and the card silently stopped updating, still showing a target as pending
 * after it had filled.
 */
describe('editing a card', () => {
  let calls: { url: string; body: Record<string, unknown> }[];
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    calls = [];
    const { env } = await import('../../config/env.js');
    (env as { telegramBotToken: string }).telegramBotToken ||= 'test-token';
    // A gap long enough to measure without making the suite slow.
    (env as { alertsSendGapMs: number }).alertsSendGapMs = 60;
  });

  const stub = (statuses: number[]) => {
    let call = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const status = statuses[Math.min(call, statuses.length - 1)]!;
      call += 1;
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });

      return new Response(
        JSON.stringify(
          status === 429
            ? { ok: false, description: 'Too Many Requests', parameters: { retry_after: 0 } }
            : { ok: true, result: {} },
        ),
        { status },
      );
    }) as typeof fetch;
  };

  it('leaves a gap between edits to the same chat', async () => {
    stub([200]);
    const { editMessageText } = await import('./telegram.client.js');

    const started = Date.now();
    await editMessageText('100', 1, 'one');
    await editMessageText('100', 2, 'two');
    const elapsed = Date.now() - started;

    assert.equal(calls.length, 2);
    assert.ok(elapsed >= 55, `two edits took ${elapsed}ms, expected a gap between them`);
  });

  it('waits and tries again when Telegram says too many', async () => {
    // Refused once, accepted on the retry.
    stub([429, 200]);
    const { editMessageText } = await import('./telegram.client.js');

    const ok = await editMessageText('200', 5, 'card');

    assert.equal(ok, true, 'the card is rewritten rather than left stale');
    assert.equal(calls.length, 2, 'one retry, not a queue of them');
  });

  it('gives up after one retry rather than hammering', async () => {
    stub([429]);
    const { editMessageText } = await import('./telegram.client.js');

    const ok = await editMessageText('300', 7, 'card');

    assert.equal(ok, false);
    assert.equal(calls.length, 2, 'the next scan is five minutes away and will retry anyway');
  });

  it('treats an unchanged card as success, not failure', async () => {
    /*
     * A card the scan rewrites identically is the normal case: nothing
     * happened to that trade. Telegram calls it an error; it is not one, and
     * counting it as a failure would bury the real ones.
     */
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, description: 'Bad Request: message is not modified' }), {
        status: 400,
      })) as typeof fetch;

    const { editMessageText } = await import('./telegram.client.js');
    assert.equal(await editMessageText('400', 9, 'same'), true);
  });

  it('restores fetch', () => {
    globalThis.fetch = realFetch;
  });
});
