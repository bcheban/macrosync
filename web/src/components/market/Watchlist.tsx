import { m } from 'framer-motion';
import { LineChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sparkline } from '@/components/ui/Sparkline';
import { cn } from '@/lib/cn';
import { formatCompact, formatPct, formatPrice } from '@/lib/format';
import type { Ticker } from '@/types/domain';

interface WatchlistProps {
  tickers: Ticker[];
  loading: boolean;
  /** How many rows to reserve while loading, so the card keeps its height. */
  expected?: number;
}

export function Watchlist({ tickers, loading, expected = 4 }: WatchlistProps) {
  const { t } = useTranslation();

  return (
    <GlassCard className="p-4 sm:p-5">
      <SectionHeader
        icon={LineChart}
        title={t('watchlist.title')}
        subtitle={t('watchlist.subtitle')}
        tip={t('glossary.watchlist')}
        tipLabel={t('glossary.watchlistLabel')}
      />

      {/* Scrolls once the selection grows past a handful of assets. */}
      <div className="mt-4 max-h-104 space-y-1 overflow-y-auto pr-1">
        {loading && !tickers.length
          ? Array.from({ length: Math.min(expected, 8) }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))
          : tickers.map((ticker, index) => {
              const up = ticker.changePct24h >= 0;
              return (
                <m.div
                  key={ticker.symbol}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.35 }}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-200 hover:bg-white/4"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-white">{ticker.base}</span>
                      <span className="text-[10px] tracking-wider text-white/30 uppercase">{ticker.quote}</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="tnum truncate font-mono text-sm text-white/85">{formatPrice(ticker.price)}</span>
                      <span className={cn('tnum shrink-0 font-mono text-xs', up ? 'text-bull' : 'text-bear')}>
                        {formatPct(ticker.changePct24h)}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 shrink-0 flex-col items-end gap-1">
                    <div className="w-16 opacity-80 transition-opacity duration-200 group-hover:opacity-100 sm:w-24">
                      <Sparkline data={ticker.spark} bullish={up} height={28} />
                    </div>
                    <span className="tnum max-w-full truncate font-mono text-[10px] whitespace-nowrap text-white/30">
                      {t('watchlist.volume', { value: formatCompact(ticker.quoteVolume24h) })}
                    </span>
                  </div>
                </m.div>
              );
            })}

        {!loading && !tickers.length && (
          <p className="px-2 py-6 text-center text-[12px] text-white/35">{t('watchlist.empty')}</p>
        )}
      </div>
    </GlassCard>
  );
}
