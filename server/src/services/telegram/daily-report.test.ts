import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resetMemoryStore, setJson, storeKey } from '../store/store.js';
import { maybePublishDailyReport } from './daily-report.js';

/**
 * The report goes to every subscriber, so the failure that matters is sending
 * it twice. A missed report is one quiet evening; a duplicate is noise nobody
 * can take back, and a five-minute pinger gives it 288 chances a day to happen.
 */
describe('publishing the daily report', () => {
  let published: string[];
  const publish = async () => {
    published.push('sent');
    return 1;
  };

  beforeEach(() => {
    resetMemoryStore();
    published = [];
  });

  it('adopts the current day silently on a deployment that has never reported', async () => {
    /*
     * Otherwise the first run after this shipped would publish a report for a
     * day that ended before the feature existed — unprompted, to everybody. One
     * skipped report on the first day is the cheaper mistake.
     */
    const result = await maybePublishDailyReport(publish, new Date('2026-08-31T06:00:00Z'));

    assert.equal(result.published, false);
    assert.equal(result.date, '2026-08-30');
    assert.equal(published.length, 0);
  });

  it('publishes once for a day, however many times it is asked', async () => {
    await setJson(storeKey('telegram:daily-report'), { date: '2026-08-29' });

    const first = await maybePublishDailyReport(publish, new Date('2026-08-31T00:02:00Z'));
    assert.equal(first.published, true);
    assert.equal(first.date, '2026-08-30');

    // The pinger runs every five minutes; the next dozen calls must do nothing.
    for (const minute of ['00:07', '00:12', '11:00', '23:58']) {
      const again = await maybePublishDailyReport(publish, new Date(`2026-08-31T${minute}:00Z`));
      assert.equal(again.published, false, `a second report at ${minute}`);
    }

    assert.equal(published.length, 1);
  });

  it('reports the day that ended, not the day it was asked on', async () => {
    /*
     * An outage spanning midnight is the case a fixed 23:59 trigger loses. The
     * report is owed for the last day that finished, so a run at six in the
     * morning still delivers it rather than skipping to the next evening.
     */
    await setJson(storeKey('telegram:daily-report'), { date: '2026-08-29' });

    const result = await maybePublishDailyReport(publish, new Date('2026-08-31T06:00:00Z'));

    assert.equal(result.published, true);
    assert.equal(result.date, '2026-08-30');
  });

  it('does not report a day that is still running', async () => {
    await setJson(storeKey('telegram:daily-report'), { date: '2026-08-30' });

    const result = await maybePublishDailyReport(publish, new Date('2026-08-31T23:58:00Z'));

    assert.equal(result.published, false, 'two minutes short of the close');
    assert.equal(published.length, 0);
  });

  it('marks the day before sending, so a failed send cannot repeat', async () => {
    /*
     * Deliberately the less obvious ordering. A send that half-worked and then
     * threw would otherwise be retried five minutes later, and half the roster
     * would get the report twice.
     */
    await setJson(storeKey('telegram:daily-report'), { date: '2026-08-29' });

    await assert.rejects(
      maybePublishDailyReport(async () => {
        throw new Error('telegram fell over');
      }, new Date('2026-08-31T06:00:00Z')),
    );

    const after = await maybePublishDailyReport(publish, new Date('2026-08-31T06:05:00Z'));
    assert.equal(after.published, false, 'the day is spent whether or not it landed');
  });
});
