import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resetMemoryStore } from '../store/store.js';
import { claimSlot, cooldownFor, loadCooldown, noteAccepted } from './cooldown.js';
import { env } from '../../config/env.js';

/**
 * The limits that stopped the engine filling a sixty-two trade book in a day.
 *
 * `MAX_OPEN_TRADES` capped the damage and could not prevent it: it answers "how
 * much risk is open" and was being asked "is this call worth a slot". These
 * answer the second question, and the cases that matter are the ones where the
 * engine used to say yes too easily.
 */

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-09-01T12:00:00.000Z');

describe('the per-asset cooldown', () => {
  it('silences a ticker for the window after a call is accepted', () => {
    const state = noteAccepted({ assets: {}, accepted: [] }, 'BTC', NOW);

    assert.equal(cooldownFor(state, 'BTC', NOW + HOUR), 'cooldown');
    assert.equal(cooldownFor(state, 'BTC', NOW + env.assetCooldownMs - 1), 'cooldown');
    // And speaks again the moment the window closes.
    assert.equal(cooldownFor(state, 'BTC', NOW + env.assetCooldownMs), null);
  });

  it('covers the ticker across every strategy, which is the point', () => {
    /*
     * The same chart confirming on the 5m, the 1h and the 4h inside an hour is
     * one idea. The old cooldown keyed on symbol *and* strategy, so it let all
     * three through and spent three slots on one opinion — most of how the book
     * reached sixty-two positions in a day.
     */
    const state = noteAccepted({ assets: {}, accepted: [] }, 'ETH', NOW);

    assert.equal(cooldownFor(state, 'ETH', NOW + 60_000), 'cooldown');
    // A different asset is a different idea and is unaffected.
    assert.equal(cooldownFor(state, 'SOL', NOW + 60_000), null);
  });

  it('matches the ticker whatever case it arrives in', () => {
    // The engine sends `BTC`; a hand-written TradingView alert may send `btc`.
    const state = noteAccepted({ assets: {}, accepted: [] }, 'btc', NOW);

    assert.equal(cooldownFor(state, 'BTC', NOW + 60_000), 'cooldown');
  });
});

describe('the velocity limit', () => {
  it('refuses a burst even when every asset is different', () => {
    /*
     * The per-asset rule cannot see a market where everything confirms at once.
     * That is when the book fills with correlated positions a single reversal
     * closes together — the burst worth refusing rather than rationing after.
     */
    let state = { assets: {}, accepted: [] };
    for (let i = 0; i < env.signalsPerHour; i += 1) {
      state = noteAccepted(state, `ASSET${i}`, NOW);
    }

    assert.equal(cooldownFor(state, 'FRESH', NOW), 'velocity');
    // It is a rolling hour, not a bucket: an hour later the slots are back.
    assert.equal(cooldownFor(state, 'FRESH', NOW + HOUR), null);
  });

  it('names the asset rule first when both would fire', () => {
    /*
     * The specific reason beats the general one. Reporting "too many signals"
     * for a ticker that simply spoke an hour ago sends somebody to the wrong
     * setting.
     */
    let state = { assets: {}, accepted: [] };
    for (let i = 0; i < env.signalsPerHour; i += 1) {
      state = noteAccepted(state, `ASSET${i}`, NOW);
    }

    assert.equal(cooldownFor(state, 'ASSET0', NOW), 'cooldown');
  });
});

describe('the stored document', () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it('forgets what has aged out instead of growing for ever', () => {
    const stale = {
      assets: { OLD: new Date(NOW - env.assetCooldownMs - 1).toISOString() },
      accepted: [new Date(NOW - 2 * HOUR).toISOString()],
    };

    const state = noteAccepted(stale, 'NEW', NOW);

    assert.deepEqual(Object.keys(state.assets), ['NEW']);
    assert.equal(state.accepted.length, 1, 'the aged-out entry is dropped');
  });

  it('claims and checks in one call, so two arrivals cannot both pass', async () => {
    /*
     * The webhook's path. Reading and then writing would let two alerts landing
     * together both see an empty cooldown and both publish, which is exactly
     * the burst this prevents.
     */
    assert.equal(await claimSlot('LAB'), null, 'the first one through');
    assert.equal(await claimSlot('LAB'), 'cooldown', 'the second is refused');

    const stored = await loadCooldown();
    assert.ok(stored.assets.LAB, 'the claim was persisted, not just returned');
  });

  it('does not spend a slot on a call it refused', async () => {
    await claimSlot('AAA');
    await claimSlot('AAA');
    await claimSlot('AAA');

    const stored = await loadCooldown();
    // Three attempts, one acceptance: a refusal must not consume the velocity
    // budget, or a retrying alert would silence the whole engine.
    assert.equal(stored.accepted.length, 1);
  });
});
