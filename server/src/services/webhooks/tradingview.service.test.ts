import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resetMemoryStore } from '../store/store.js';
import { authorise, claimAlert, normaliseSymbol, parseAlert } from './tradingview.service.js';

/**
 * The webhook opens real positions on one POST from a third party that cannot
 * be asked to change how it calls. So the cases that matter are the ones where
 * something arrives slightly wrong: the wrong ticker shape, a stop on the wrong
 * side, the same alert twice.
 */

const SECRET = 'a-long-shared-secret-value';

/** `env` is `as const` for types, not frozen — a case can set the secret. */
async function withSecret<T>(value: string, run: () => Promise<T> | T): Promise<T> {
  const { env } = await import('../../config/env.js');
  const mutable = env as { tradingViewSecret: string };
  const original = mutable.tradingViewSecret;
  try {
    mutable.tradingViewSecret = value;
    return await run();
  } finally {
    mutable.tradingViewSecret = original;
  }
}

describe('a TradingView ticker', () => {
  it('survives the exchange prefix and the contract suffix', () => {
    assert.equal(normaliseSymbol('MEXC:LABUSDT.P'), 'LABUSDT');
    assert.equal(normaliseSymbol('BINANCE:BTCUSDT'), 'BTCUSDT');
    assert.equal(normaliseSymbol('ethusdt'), 'ETHUSDT');
    // A bare base is what somebody types when writing the alert by hand.
    assert.equal(normaliseSymbol('SOL'), 'SOLUSDT');
    assert.equal(normaliseSymbol('  '), '');
  });
});

describe('the shared secret', () => {
  it('is accepted from a header, the query or the body', async () => {
    await withSecret(SECRET, () => {
      assert.equal(authorise({ authorization: `Bearer ${SECRET}` }, {}, {}), true);
      assert.equal(authorise({ 'x-webhook-secret': SECRET }, {}, {}), true);
      assert.equal(authorise({}, { secret: SECRET }, {}), true);
      /*
       * The one that matters. TradingView cannot set request headers on an
       * alert, so the body field is the only transport it can actually use —
       * if this breaks, the feature is unreachable from its only client.
       */
      assert.equal(authorise({}, {}, { secret: SECRET }), true);
    });
  });

  it('refuses a near miss, a prefix and an empty secret', async () => {
    await withSecret(SECRET, () => {
      assert.equal(authorise({}, {}, { secret: `${SECRET}x` }), false);
      assert.equal(authorise({}, {}, { secret: SECRET.slice(0, -1) }), false);
      assert.equal(authorise({}, {}, {}), false);
      assert.equal(authorise({ authorization: SECRET }, {}, {}), false, 'Bearer prefix required');
    });

    // Unset means nothing authorises, rather than everything.
    await withSecret('', () => {
      assert.equal(authorise({ authorization: `Bearer ${SECRET}` }, {}, { secret: SECRET }), false);
    });
  });
});

describe('parsing an alert', () => {
  it('accepts the documented payload and defaults what it can', () => {
    const parsed = parseAlert({
      symbol: 'MEXC:LABUSDT.P',
      side: 'long',
      entry: '0.07403',
      stopLoss: '0.07100',
    });

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.alert.symbol, 'LABUSDT');
    assert.equal(parsed.alert.base, 'LAB');
    assert.equal(parsed.alert.side, 'buy', 'long is a side, not a direction');
    assert.equal(parsed.alert.entry, 0.07403);
    assert.equal(parsed.alert.strategy, 'day');
  });

  it('refuses a stop on the winning side of entry', () => {
    /*
     * The easiest mistake to make in an alert: the template is written once and
     * the direction edited later. Every rung of the ladder built from it would
     * point the wrong way, so it is refused rather than published.
     */
    const long = parseAlert({ symbol: 'BTCUSDT', side: 'buy', entry: 100, stopLoss: 110 });
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.reason, /stop below entry/);

    const short = parseAlert({ symbol: 'BTCUSDT', side: 'sell', entry: 100, stopLoss: 90 });
    assert.equal(short.ok, false);
    if (!short.ok) assert.match(short.reason, /stop above entry/);
  });

  it('refuses a stop that is almost certainly a decimal slip', () => {
    const tight = parseAlert({ symbol: 'BTCUSDT', side: 'buy', entry: 100, stopLoss: 99.95 });
    assert.equal(tight.ok, false);
    if (!tight.ok) assert.match(tight.reason, /decimals/);

    const wide = parseAlert({ symbol: 'BTCUSDT', side: 'buy', entry: 100, stopLoss: 10 });
    assert.equal(wide.ok, false);
    if (!wide.ok) assert.match(wide.reason, /decimals/);
  });

  it('names what was wrong, because the reason is what the alert log shows', () => {
    for (const [body, pattern] of [
      [{}, /symbol/],
      [{ symbol: 'BTCUSDT' }, /side/],
      [{ symbol: 'BTCUSDT', side: 'buy' }, /entry/],
      [{ symbol: 'BTCUSDT', side: 'buy', entry: 100 }, /stopLoss/],
      ['not an object', /JSON object/],
    ] as const) {
      const parsed = parseAlert(body);
      assert.equal(parsed.ok, false);
      if (!parsed.ok) assert.match(parsed.reason, pattern);
    }
  });
});

describe('the same alert arriving twice', () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it('is claimed once, so a resend cannot open a second position', async () => {
    /*
     * TradingView resends on every bar while a condition holds unless the alert
     * is set to fire once — and "once" is a setting a person can forget. A
     * duplicate here is not a duplicate message; it is a second position on the
     * same setup, counted twice in the record.
     */
    const first = parseAlert({ symbol: 'LABUSDT', side: 'buy', entry: 0.074, stopLoss: 0.071 });
    const again = parseAlert({ symbol: 'MEXC:LABUSDT.P', side: 'long', entry: 0.074, stopLoss: 0.071 });
    assert.ok(first.ok && again.ok);
    if (!first.ok || !again.ok) return;

    // Same setup, differently spelled — the key has to see through that.
    assert.equal(first.alert.dedupeKey, again.alert.dedupeKey);
    assert.equal(await claimAlert(first.alert.dedupeKey), true);
    assert.equal(await claimAlert(again.alert.dedupeKey), false);
  });

  it('lets a caller-supplied id override the derived one', async () => {
    const parsed = parseAlert({ symbol: 'LABUSDT', side: 'buy', entry: 1, stopLoss: 0.9, id: 'bar-42' });
    assert.ok(parsed.ok);
    if (!parsed.ok) return;

    assert.equal(parsed.alert.dedupeKey, 'bar-42');
    assert.equal(await claimAlert('bar-42'), true);
    assert.equal(await claimAlert('bar-42'), false);
  });
});
