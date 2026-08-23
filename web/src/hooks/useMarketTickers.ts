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
       * Only the price is taken from the socket. MEXC's miniTicker carries its
       * own `rate` field, but it is computed over a different window than the
       * REST ticker's `priceChangePercent` — they disagreed by 0.27 points on
       * BTC — and showing a percentage the exchange's own ticker does not is
       * worse than showing one a few seconds old.
       *
       * So the 24h open is recovered from the REST pair (price and change are
       * consistent with each other by construction) and the change is
       * recomputed against the live price. The number moves with the tape and
       * still reconciles with MEXC.
       */
      const restOpen =
        ticker.changePct24h > -100 ? ticker.price / (1 + ticker.changePct24h / 100) : 0;
      const changePct24h =
        restOpen > 0 ? ((quote.price - restOpen) / restOpen) * 100 : ticker.changePct24h;

      return {
        ...ticker,
        price: quote.price,
        changePct24h,
        // The sparkline still comes from REST candles; only the tip is live.
        spark: ticker.spark.length ? [...ticker.spark.slice(0, -1), quote.price] : ticker.spark,
        updatedAt: new Date(quote.at).toISOString(),
      };
    });

    return { tickers: merged, liveCount, streaming: liveCount > 0 };
  }, [tickers, quotes]);
}
