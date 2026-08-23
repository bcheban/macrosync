import { useMemo } from 'react';
import { useLivePrices, isFresh } from '@/hooks/useLivePrices';
import type { Ticker } from '@/types/domain';

export interface MarketTickers {
  tickers: Ticker[];
  /** How many rows are currently backed by a live socket tick. */
  liveCount: number;
  /** True once the exchange stream is feeding at least one tracked symbol. */
  streaming: boolean;
}

/**
 * Merges the REST snapshot with the live exchange stream.
 *
 * The API supplies structure the socket does not carry — the sparkline series,
 * the base/quote split, the data source — while the socket supplies the number
 * that has to be exact. Overlaying them means a price is never older than a
 * second, even when the backend is polling on a ten-second cache or has fallen
 * back to simulated candles.
 */
export function useMarketTickers(tickers: Ticker[]): MarketTickers {
  const symbols = useMemo(() => tickers.map((ticker) => ticker.symbol), [tickers]);
  const quotes = useLivePrices(symbols);

  return useMemo(() => {
    const now = Date.now();
    let liveCount = 0;

    const merged = tickers.map((ticker) => {
      const quote = quotes[ticker.symbol];
      if (!isFresh(quote, now) || !quote) return ticker;

      liveCount += 1;
      return {
        ...ticker,
        price: quote.price,
        changePct24h: quote.changePct24h,
        high24h: quote.high24h || ticker.high24h,
        low24h: quote.low24h || ticker.low24h,
        quoteVolume24h: quote.quoteVolume24h || ticker.quoteVolume24h,
        // The sparkline still comes from REST candles; only the tip is live.
        spark: ticker.spark.length
          ? [...ticker.spark.slice(0, -1), quote.price]
          : ticker.spark,
        source: 'binance' as const,
        updatedAt: new Date(quote.at).toISOString(),
      };
    });

    return { tickers: merged, liveCount, streaming: liveCount > 0 };
  }, [tickers, quotes]);
}
