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
 * The API supplies structure the socket does not carry — the sparkline series
 * and the base/quote split — while the socket supplies the number that has to
 * be exact. Overlaying them means the displayed price is never older than a
 * second, and matches MEXC to the last decimal even though the REST snapshot
 * behind it is on a ten-second cache.
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

      /*
       * Price and change both come from the socket now.
       *
       * On spot this was not possible: `miniTicker`'s `rate` was computed over a
       * different window than the REST ticker's `priceChangePercent` — they
       * disagreed by 0.27 points on BTC — so the change had to be recomputed
       * against a 24h open recovered from the REST pair. The contract feeds
       * publish the same `riseFallRate` on both sides; measured live, they
       * differ by 0.01 points, which is the price moving between the two calls.
       */
      return {
        ...ticker,
        price: quote.price,
        changePct24h: quote.changePct24h,
        // The sparkline still comes from REST candles; only the tip is live.
        spark: ticker.spark.length ? [...ticker.spark.slice(0, -1), quote.price] : ticker.spark,
        updatedAt: new Date(quote.at).toISOString(),
      };
    });

    return { tickers: merged, liveCount, streaming: liveCount > 0 };
  }, [tickers, quotes]);
}
