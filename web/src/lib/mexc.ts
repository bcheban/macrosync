/**
 * The exchange page for a symbol.
 *
 * `https://www.mexc.com/futures/BTC_USDT` — the URL MEXC publishes in its own
 * sitemap, which matters twice over. It is the canonical trading page rather
 * than a guess, and it sits on the domain the mobile apps claim for universal
 * links: tapping it opens the MEXC app straight onto the contract when it is
 * installed, and the web page when it is not.
 *
 * A `mexcapp://` scheme would open the app too, and Telegram accepts it in a
 * button — but with nothing installed it is a button that does nothing at all,
 * and there is no way to attach a fallback to an inline URL.
 */
/**
 * Every quote currency MEXC lists futures against, longest first.
 *
 * The order matters: `USD` is a prefix of both `USD1` and `USDT`, so trying a
 * shorter match first would split `ZECUSD1` into `ZECUSD` + `1`.
 */
const QUOTES = ['USDT', 'USDC', 'USD1', 'USD'] as const;

/**
 * `BTCUSDT` → `BTC_USDT`, the form the exchange uses in its own URLs.
 *
 * This was a regex that knew `USDT` and `USDC` and passed anything else through
 * untouched. MEXC lists 1,183 contracts across four quotes, and the 45 quoted
 * in `USD` and `USD1` came out without their underscore — `BTC_USD` became
 * `https://www.mexc.com/futures/BTCUSD`, which answers 400.
 *
 * An unrecognised symbol is returned unchanged rather than mangled: a link that
 * fails is better than one quietly pointing at a different contract.
 */
export const toContractForm = (symbol: string): string => {
  if (symbol.includes('_')) return symbol;

  const quote = QUOTES.find(
    (candidate) => symbol.endsWith(candidate) && symbol.length > candidate.length,
  );
  return quote ? `${symbol.slice(0, -quote.length)}_${quote}` : symbol;
};

export const mexcFuturesUrl = (symbol: string): string =>
  `https://www.mexc.com/futures/${toContractForm(symbol)}`;
