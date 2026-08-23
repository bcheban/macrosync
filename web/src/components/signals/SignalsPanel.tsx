import { AnimatePresence, motion } from 'framer-motion';
import { CandlestickChart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { Strategy } from '@/types/domain';
import { SignalCard } from './SignalCard';
import { StrategyTabs } from './StrategyTabs';

const REFRESH_MS: Record<Strategy, number> = {
  scalping: 15_000,
  day: 30_000,
  swing: 60_000,
};

/**
 * Strategy-segmented signal grid. Each tab is its own polling cadence, and the
 * grid re-flows with a layout animation when the timeframe — or the selected
 * asset universe — changes.
 */
export function SignalsPanel() {
  const { t } = useTranslation();
  const { selected } = useAssetScope();
  const [strategy, setStrategy] = useState<Strategy>('day');

  const key = selected.join(',');
  const { data, loading, error, lastUpdated } = usePolling(
    (signal) => api.signals(strategy, selected, signal),
    REFRESH_MS[strategy],
    [strategy, key],
  );

  const signals = data?.signals ?? [];
  const liveCount = signals.filter((item) => item.status === 'live').length;

  return (
    <section className="min-w-0 space-y-4">
      <SectionHeader
        icon={CandlestickChart}
        title={t('signals.title')}
        subtitle={t(`signals.subtitles.${strategy}`)}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="tnum hidden font-mono text-[11px] text-white/30 sm:inline">
                {timeAgo(new Date(lastUpdated).toISOString())}
              </span>
            )}
            <Badge tone={liveCount ? 'bull' : 'neutral'}>{t('signals.live', { count: liveCount })}</Badge>
          </div>
        }
      />

      <StrategyTabs value={strategy} onChange={setStrategy} />

      {error && !signals.length && (
        <div className="rounded-card text-safe border border-bear/20 bg-bear/6 p-4 text-sm text-bear/90">
          {t('signals.error', { message: error.message })}
        </div>
      )}

      <motion.div layout className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {loading && !signals.length
          ? Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
          : null}

        <AnimatePresence mode="popLayout">
          {signals.map((signal, index) => (
            <SignalCard key={signal.id} signal={signal} index={index} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
