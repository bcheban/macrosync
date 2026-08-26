/**
 * The exchange page for a symbol.
 *
 * Kept beside the other formatters rather than inlined at the call sites: the
 * underscore that separates our internal form from MEXC's belongs in as few
 * places as possible, and the bot has exactly one of these too.
 */
export const mexcFuturesUrl = (symbol: string): string =>
  `https://futures.mexc.com/exchange/${symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC)$/, '_$1')}`;
