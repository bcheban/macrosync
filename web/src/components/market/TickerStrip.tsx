import { TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { formatPct, formatPrice } from '@/lib/format';
import type { Ticker } from '@/types/domain';

/**
 * Infinite marquee of live prices. The list is rendered twice and translated
 * by -50%, which makes the loop seamless without any JS ticking.
 */
/** Fixed height, so the strip never resizes between empty and populated. */
const STRIP_HEIGHT = 'h-[41px]';

export function TickerStrip({ tickers }: { tickers: Ticker[] }) {
  const { t } = useTranslation();

  /*
   * The marquee starts once the browser is idle rather than on mount. A
   * continuously moving strip during load costs main-thread time exactly when
   * the app is still booting, and it keeps the page from ever settling for
   * Speed Index. Held still, the prices are perfectly readable anyway.
   */
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    const start = () => setRolling(true);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(start, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  /*
   * Renders its own height even with no data. Returning `null` until the first
   * payload arrived made the strip pop into existence and shove the entire page
   * down — the single largest contributor to cumulative layout shift.
   */
  if (!tickers.length) {
    return <div aria-hidden className={`${STRIP_HEIGHT} border-b border-white/6 bg-black/25`} />;
  }
  // Enough copies that the -50% translate loop stays seamless on wide screens.
  const loop = [...tickers, ...tickers, ...tickers, ...tickers];

  return (
    <div
      aria-label={t('ticker.label')}
      className={`relative ${STRIP_HEIGHT} overflow-hidden border-b border-white/6 bg-black/25 py-2.5`}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-linear-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l from-void to-transparent" />

      <div
        className={cn(
          'flex w-max items-center gap-8 pr-8',
          rolling && 'animate-marquee hover:[animation-play-state:paused]',
        )}
      >
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
