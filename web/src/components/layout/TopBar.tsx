import { m } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MarketStatus } from '@/components/layout/MarketStatus';
import { MobileControls } from '@/components/layout/MobileControls';
import { TelegramCta } from '@/components/layout/TelegramCta';
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
  /*
   * "Live" means the exchange is actually answering — either the socket is
   * ticking or the REST snapshot came back with rows. There is no simulated
   * feed to fall back to, so an empty tape is reported as disconnected rather
   * than dressed up as live.
   */
  const live = streaming || tickers.length > 0;
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
            <m.img
              src="/logo.svg"
              alt=""
              aria-hidden
              width={36}
              height={36}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              /*
               * `size-9` — 36px — rather than the `h-8 w-auto` a logo swap
               * usually gets. The pre-rendered shell in `index.html` reserves a
               * 36px square inside a 61px bar so React's first paint moves
               * nothing; a 32px logo here would buy four pixels of nothing and
               * cost the zero-CLS the shell exists for.
               *
               * `alt=""` and `aria-hidden` because the wordmark beside it already
               * says Ayanox, and a screen reader should hear the brand once.
               */
              className="relative size-9 shrink-0 rounded-xl"
            />
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

            <TelegramCta className="hidden sm:flex" />
            <AssetSelector className="hidden md:block" />
            <LanguageSwitcher className="hidden md:flex" />

            <button
              type="button"
              onClick={handleRefresh}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              className="glass-soft flex size-9 shrink-0 items-center justify-center rounded-xl text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/6 hover:text-white focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-95"
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
