import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { MarketContext } from '@/types/domain';

const VOL_TONE = { low: 'bull', elevated: 'cyber', high: 'warn', extreme: 'bear' } as const;

interface MarketStatusProps {
  context?: MarketContext;
  live: boolean;
  /**
   * `bar` progressively reveals badges as the header widens; `stacked` shows
   * all of them, for the mobile sheet where there is room.
   */
  variant?: 'bar' | 'stacked';
  className?: string;
}

/**
 * Volatility regime, market breadth and the data-source indicator.
 *
 * Rendered inline in the header on wide screens and inside the mobile control
 * sheet below `md`, so the same information is reachable at every size instead
 * of being dropped on small viewports.
 */
export function MarketStatus({ context, live, variant = 'bar', className }: MarketStatusProps) {
  const { t } = useTranslation();
  const breadth = context ? Math.round(context.breadth * 100) : undefined;
  const stacked = variant === 'stacked';

  return (
    <div className={cn('flex items-center gap-2', stacked ? 'flex-wrap' : 'gap-2 sm:gap-3', className)}>
      {context && (
        <Badge
          tone={VOL_TONE[context.volatility]}
          size="md"
          className={cn('max-w-full', !stacked && 'hidden xl:inline-flex')}
        >
          <Activity className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {t('topbar.volatility')}: {t(`volatility.${context.volatility}`)}
          </span>
          <span className="tnum shrink-0 font-mono text-white/50">
            · {t('topbar.atr', { value: String(context.avgAtrPct) })}
          </span>
        </Badge>
      )}

      {breadth !== undefined && (
        <Badge
          tone={breadth >= 50 ? 'bull' : 'bear'}
          size="md"
          className={cn('max-w-full', !stacked && 'hidden 2xl:inline-flex')}
        >
          <span className="min-w-0 truncate">{t('topbar.breadth', { value: String(breadth) })}</span>
        </Badge>
      )}

      <Badge tone={live ? 'bull' : 'warn'} size="md" className={cn('max-w-full', !stacked && 'hidden md:inline-flex')}>
        <LiveDot tone={live ? 'bull' : 'warn'} />
        <span className="min-w-0 truncate">{live ? t('topbar.binanceLive') : t('topbar.simulatedFeed')}</span>
      </Badge>
    </div>
  );
}
