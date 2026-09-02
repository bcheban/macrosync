import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { cache } from '../utils/cache.js';

/**
 * Whose macro reaches a reader.
 *
 * The feed carries ten currencies. Crypto is priced in dollars and moves on
 * dollar liquidity, so a Frankfurt survey or a Bank of England speech is a real
 * event about a market this bot does not trade — and printing it under a signal
 * card implies a connection that is not there.
 *
 * It was not an edge case. In the week this was written the feed held four
 * high-impact USD prints and eleven from elsewhere, and "BOE Gov Bailey Speaks"
 * was the one appearing on cards.
 */

/** One feed row, in the shape ForexFactory actually publishes. */
const row = (country: string, title: string, impact = 'High') => ({
  title,
  country,
  date: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
  impact,
  forecast: '',
  previous: '',
});

const FEED = [
  row('USD', 'Non-Farm Employment Change'),
  row('USD', 'CPI m/m'),
  row('GBP', 'BOE Gov Bailey Speaks'),
  row('EUR', 'German ifo Business Climate'),
  row('JPY', 'BOJ Gov Ueda Speaks'),
  row('CAD', 'Employment Change'),
  row('All', 'G20 Meetings'),
  row('USD', 'Bank Holiday', 'Holiday'),
];

describe('the macro calendar', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    cache.clear();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(FEED), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    cache.clear();
  });

  it('keeps dollar prints and drops everybody else', async () => {
    const { getUpcomingEvents } = await import('./calendar.service.js');
    const { events } = await getUpcomingEvents({ limit: 50 });

    assert.ok(events.length > 0, 'the dollar prints survive');
    assert.deepEqual(
      [...new Set(events.map((event) => event.currency))],
      ['USD'],
      'nothing but USD reaches a reader',
    );

    const titles = events.map((event) => event.title);
    assert.ok(titles.includes('Non-Farm Employment Change'));
    assert.ok(!titles.some((title) => title.includes('Bailey')), 'the case that prompted this');
    assert.ok(!titles.some((title) => title.includes('ifo')));
    assert.ok(!titles.some((title) => title.includes('G20')), 'All is not a currency');
  });

  it('still drops holidays, which are not prints', async () => {
    const { getUpcomingEvents } = await import('./calendar.service.js');
    const { events } = await getUpcomingEvents({ limit: 50 });

    assert.ok(!events.some((event) => event.title === 'Bank Holiday'));
  });

  it('gives a signal card a dollar print or nothing at all', async () => {
    /*
     * The headline is what lands under an alert. Before the filter it could be
     * a Bank of England speech attached to a crypto call, which is the whole
     * complaint — an unrelated market's news presented as context.
     */
    const { getHeadlineEvent } = await import('./calendar.service.js');
    const headline = await getHeadlineEvent();

    if (headline) assert.equal(headline.currency, 'USD');
  });
});
