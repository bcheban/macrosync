import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toContractForm } from './market.service.js';

/**
 * The symbol shape MEXC uses in its own URLs.
 *
 * This was a regex that knew `USDT` and `USDC`. MEXC lists 1,183 futures
 * contracts across four quote currencies, and the 45 quoted in `USD` and `USD1`
 * came out without their underscore — `BTC_USD` became `.../futures/BTCUSD`,
 * which the exchange answers with a 400.
 */
describe('the contract form of a symbol', () => {
  it('splits every quote currency the exchange lists', () => {
    assert.equal(toContractForm('BTCUSDT'), 'BTC_USDT');
    assert.equal(toContractForm('ETHUSDC'), 'ETH_USDC');
    assert.equal(toContractForm('BTCUSD'), 'BTC_USD');
    assert.equal(toContractForm('ZECUSD1'), 'ZEC_USD1');
  });

  it('prefers the longest quote, so USD does not eat USD1', () => {
    /*
     * `USD` is a prefix of both `USD1` and `USDT`. Matching the shortest first
     * would split `ZECUSD1` into `ZECUSD` + `1` and link to a contract that
     * does not exist.
     */
    assert.equal(toContractForm('ZECUSD1'), 'ZEC_USD1');
    assert.equal(toContractForm('SOLUSDT'), 'SOL_USDT');
  });

  it('handles the awkward tickers that prompted the report', () => {
    // Digits at the front, digits throughout — all real MEXC contracts.
    assert.equal(toContractForm('1000BONKUSDT'), '1000BONK_USDT');
    assert.equal(toContractForm('1000000BABYDOGEUSDT'), '1000000BABYDOGE_USDT');
    assert.equal(toContractForm('0GUSDT'), '0G_USDT');
    assert.equal(toContractForm('4USDT'), '4_USDT');
    assert.equal(toContractForm('2ZUSDT'), '2Z_USDT');
  });

  it('leaves alone what it already understands, and what it does not', () => {
    assert.equal(toContractForm('BTC_USDT'), 'BTC_USDT', 'already split');
    /*
     * An unrecognised symbol comes back untouched rather than mangled. A link
     * that fails is better than one quietly pointing at a different contract.
     */
    assert.equal(toContractForm('NOTACONTRACT'), 'NOTACONTRACT');
    // And a bare quote is not a symbol with an empty base.
    assert.equal(toContractForm('USDT'), 'USDT');
  });
});
