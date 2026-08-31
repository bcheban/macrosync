import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getJson, setJson, storeBackend, storeKey, resetMemoryStore } from './store.js';

/**
 * One guarantee, and it is a safety one rather than a behavioural one.
 *
 * The backend used to be chosen purely by whether Redis credentials were
 * present. So a developer who pulled an env file to run a script had, from that
 * moment, a test suite pointed at the production ledger — opening trades,
 * settling them and recording wins against the published record.
 *
 * That happened once here. It caused no damage only because every case that
 * writes also stubs `globalThis.fetch`, which swallowed the REST calls by
 * accident; a test file that did not stub fetch would have written for real,
 * and the first sign of it would have been a win rate nobody could explain.
 */
describe('the store under test', () => {
  it('never reaches Redis, whatever the environment holds', () => {
    /*
     * Asserted with credentials deliberately in place, because that is the
     * dangerous state — a suite that only passes this when there is nothing to
     * connect to is not testing anything.
     */
    const before = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };

    try {
      process.env.KV_REST_API_URL = 'https://example.invalid';
      process.env.KV_REST_API_TOKEN = 'a-real-looking-token';

      assert.equal(storeBackend(), 'memory');
    } finally {
      if (before.url === undefined) delete process.env.KV_REST_API_URL;
      else process.env.KV_REST_API_URL = before.url;
      if (before.token === undefined) delete process.env.KV_REST_API_TOKEN;
      else process.env.KV_REST_API_TOKEN = before.token;
    }
  });

  it('round-trips a document without touching the network', async () => {
    resetMemoryStore();

    // No fetch stub anywhere in this file: a write that escaped would throw or
    // hang against `example.invalid` rather than passing quietly.
    await setJson(storeKey('trades:probe'), { rungs: 3 });

    assert.deepEqual(await getJson(storeKey('trades:probe'), null), { rungs: 3 });
    resetMemoryStore();
    assert.equal(await getJson(storeKey('trades:probe'), null), null);
  });
});
