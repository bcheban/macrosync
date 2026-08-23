import { m } from 'framer-motion';
import { Gauge, Hourglass, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Strategy } from '@/types/domain';

interface StrategyMeta {
  key: Strategy;
  timeframe: string;
  icon: LucideIcon;
}

/** Labels live in the locale files; only the timeframe is language-neutral. */
export const STRATEGY_TABS: StrategyMeta[] = [
  { key: 'scalping', timeframe: '5m', icon: Zap },
  { key: 'day', timeframe: '1h', icon: Gauge },
  { key: 'swing', timeframe: '4h', icon: Hourglass },
];

interface StrategyTabsProps {
  value: Strategy;
  onChange: (strategy: Strategy) => void;
}

/**
 * Segmented control. The active pill is a single shared element animated with
 * `layoutId`, so switching tabs glides instead of cutting.
 */
export function StrategyTabs({ value, onChange }: StrategyTabsProps) {
  const { t } = useTranslation();

  /*
   * The strip scrolls horizontally rather than shrinking: "Внутрішньоденна" is
   * twice the width of "Day Trading", and truncating a tab label would hide
   * which strategy is selected. Snap points keep the scroll feeling deliberate.
   */
  return (
    <div
      role="tablist"
      aria-label={t('signals.strategyAria')}
      className="glass-soft no-scrollbar flex snap-x snap-mandatory items-center gap-1 overflow-x-auto rounded-2xl p-1"
    >
      {STRATEGY_TABS.map(({ key, timeframe, icon: Icon }) => {
        const active = key === value;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => {
              if (key !== value) trackEvent('strategy_change', { strategy: key });
              onChange(key);
            }}
            className={cn(
              'relative flex shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-200 sm:px-3.5 sm:text-[13px]',
              active ? 'text-white' : 'text-white/45 hover:text-white/75',
            )}
          >
            {active && (
              <m.span
                layoutId="strategy-pill"
                className="absolute inset-0 rounded-xl border border-accent/30 bg-linear-to-b from-accent/25 to-accent/10 shadow-[0_0_24px_-8px] shadow-accent/80"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className={cn('relative size-3.5', active && 'text-accent-soft')} />
            <span className="relative whitespace-nowrap">{t(`signals.strategies.${key}`)}</span>
            <span
              className={cn(
                'relative tnum hidden font-mono text-[10px] sm:inline',
                active ? 'text-accent-soft/80' : 'text-white/30',
              )}
            >
              {timeframe}
            </span>
          </button>
        );
      })}
    </div>
  );
}
