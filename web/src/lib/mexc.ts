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
export const mexcFuturesUrl = (symbol: string): string =>
  `https://www.mexc.com/futures/${symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC)$/, '_$1')}`;
