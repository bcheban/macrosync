import { m } from 'framer-motion';
import { RefreshCw, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MarketStatus } from '@/components/layout/MarketStatus';
import { MobileControls } from '@/components/layout/MobileControls';
import { AssetSelector } from '@/components/market/AssetSelector';
import { trackEvent } from '@/lib/analytics';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import type { MarketContext, Ticker } from '@/types/domain';

interface TopBarProps {
  context?: MarketContext;
  tickers: Ticker[];
  /** True while the exchange WebSocket is delivering ticks. */
  streaming?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Header layout, by breakpoint:
 *  - `< md`  brand · refresh · control sheet trigger
 *  - `md`    + data-source badge, asset switcher, language switcher inline
 *  - `xl`    + volatility, and breadth at `2xl`
 *
 * Nothing is dropped on the way down — what leaves the bar moves into the
 * mobile sheet, so a phone reaches every control the desktop has.
 */
export function TopBar({ context, tickers, streaming = false, refreshing, onRefresh }: TopBarProps) {
  const { t } = useTranslation();
  // A live socket is authoritative; otherwise fall back to what REST reported.
  const live = streaming || tickers.some((ticker) => ticker.source === 'binance');
  const [head, tail] = BRAND.nameParts;

  const handleRefresh = () => {
    trackEvent('manual_refresh');
    onRefresh();
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="glass-bar px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <m.span
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-accent to-cyber shadow-[0_0_24px_-4px] shadow-accent/70"
            >
              <Radio className="size-4.5 text-white" strokeWidth={2.4} />
            </m.span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold tracking-tight text-white">
                {head}
                <span className="text-accent-soft">{tail}</span>
              </p>
              {/*
                Clamped and hidden below `lg`: the Ukrainian tagline is ~40%
                longer, and letting it size the brand block would shove the
                controls around on a language switch.
              */}
              <p className="hidden max-w-[26ch] truncate text-[11px] text-white/40 lg:block 2xl:max-w-[44ch]">
                {t('brand.tagline')}
              </p>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <MarketStatus context={context} live={live} streaming={streaming} />

            <AssetSelector className="hidden md:block" />
            <LanguageSwitcher className="hidden md:flex" />

            <button
              type="button"
              onClick={handleRefresh}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              className="glass-soft flex size-9 shrink-0 items-center justify-center rounded-xl text-white/60 transition-all duration-200 hover:scale-105 hover:text-white active:scale-95"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </button>

            <MobileControls context={context} live={live} streaming={streaming} className="md:hidden" />
          </div>
        </div>
      </div>
    </header>
  );
}
