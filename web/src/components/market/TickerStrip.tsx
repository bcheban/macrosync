import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { formatPct, formatPrice } from '@/lib/format';
import type { Ticker } from '@/types/domain';

/**
 * Infinite marquee of live prices. The list is rendered twice and translated
 * by -50%, which makes the loop seamless without any JS ticking.
 */
export function TickerStrip({ tickers }: { tickers: Ticker[] }) {
  const { t } = useTranslation();
  if (!tickers.length) return null;
  // Enough copies that the -50% translate loop stays seamless on wide screens.
  const loop = [...tickers, ...tickers, ...tickers, ...tickers];

  return (
    <div
      aria-label={t('ticker.label')}
      className="relative overflow-hidden border-b border-white/6 bg-black/25 py-2.5"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-linear-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l from-void to-transparent" />

      <div className="animate-marquee flex w-max items-center gap-8 pr-8 hover:[animation-play-state:paused]">
        {loop.map((ticker, index) => {
          const up = ticker.changePct24h >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <div key={`${ticker.symbol}-${index}`} className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className="font-semibold tracking-wide text-white/80">{ticker.base}</span>
              <span className="tnum font-mono text-white/55">{formatPrice(ticker.price)}</span>
              <span className={cn('tnum inline-flex items-center gap-1 font-mono', up ? 'text-bull' : 'text-bear')}>
                <Icon className="size-3" />
                {formatPct(ticker.changePct24h)}
              </span>
              <span className="text-white/12">|</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
