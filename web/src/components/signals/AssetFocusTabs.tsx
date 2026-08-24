import { m } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';

/** `null` means "every tracked asset". */
export type AssetFocus = string | null;

/** Fixed row height — the strip reserves its space before the tabs exist. */
const STRIP_HEIGHT = 'h-8';

interface AssetFocusTabsProps {
  /** Base symbols in display order, e.g. `['BTC', 'ETH', …]`. */
  bases: string[];
  value: AssetFocus;
  onChange: (focus: AssetFocus) => void;
  /** Signals available per base, used for the count chip. */
  counts: Record<string, number>;
}

/**
 * Narrows the signal grid to one asset.
 *
 * With a dozen assets tracked the grid becomes a wall of cards, and it stops
 * being obvious which ones belong to what. This strip keeps "All" as the
 * default — a trader usually wants the whole tape — while making a single
 * asset one tap away. It scrolls horizontally rather than wrapping, so the
 * panel's height never changes with the number of assets or the language.
 */
export function AssetFocusTabs({ bases, value, onChange, counts }: AssetFocusTabsProps) {
  const { t } = useTranslation();

  /*
   * Renders an empty row rather than nothing while the asset scope is still
   * loading. Appearing later would insert a row above the grid and shift every
   * card — and on mobile that happens right at the fold.
   */
  if (bases.length < 2) return <div aria-hidden className={STRIP_HEIGHT} />;

  const select = (focus: AssetFocus) => {
    if (focus === value) return;
    trackEvent('signal_focus_change', { focus: focus ?? 'all' });
    onChange(focus);
  };

  return (
    <div
      role="tablist"
      aria-label={t('signals.focusAria')}
      className={`no-scrollbar -mx-1 flex ${STRIP_HEIGHT} snap-x items-center gap-1 overflow-x-auto px-1`}
    >
      <button
        role="tab"
        type="button"
        aria-selected={value === null}
        onClick={() => select(null)}
        className={cn(
          'relative flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyber/50 focus-visible:outline-none',
          value === null ? 'text-white' : 'text-white/45 hover:text-white/75',
        )}
      >
        {value === null && (
          <m.span
            layoutId="asset-focus-pill"
            className="absolute inset-0 rounded-lg border border-cyber/30 bg-cyber/12"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        <LayoutGrid className="relative size-3" />
        <span className="relative">{t('signals.allAssets')}</span>
      </button>

      {bases.map((base) => {
        const active = value === base;
        return (
          <button
            key={base}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => select(base)}
            className={cn(
              'relative shrink-0 snap-start rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyber/50 focus-visible:outline-none',
              active ? 'text-white' : 'text-white/45 hover:text-white/75',
              !counts[base] && 'opacity-45',
            )}
          >
            {active && (
              <m.span
                layoutId="asset-focus-pill"
                className="absolute inset-0 rounded-lg border border-cyber/30 bg-cyber/12"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{base}</span>
          </button>
        );
      })}
    </div>
  );
}
