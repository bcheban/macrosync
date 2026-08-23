import { AnimatePresence, motion } from 'framer-motion';
import { CandlestickChart, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { Strategy } from '@/types/domain';
import { AssetFocusTabs, type AssetFocus } from './AssetFocusTabs';
import { SignalCard } from './SignalCard';
import { StrategyTabs } from './StrategyTabs';

const REFRESH_MS: Record<Strategy, number> = {
  scalping: 15_000,
  day: 30_000,
  swing: 60_000,
};

/**
 * Strategy-segmented signal grid, narrowable to a single asset.
 *
 * Each strategy tab has its own polling cadence, and the grid re-flows with a
 * layout animation when the timeframe, the asset scope or the focus changes.
 */
export function SignalsPanel() {
  const { t } = useTranslation();
  const { selected, bySymbol, loading: scopeLoading } = useAssetScope();
  const [strategy, setStrategy] = useState<Strategy>('day');
  const [focus, setFocus] = useState<AssetFocus>(null);

  const symbolKey = selected.join(',');
  const { data, loading, error, lastUpdated } = usePolling(
    (signal) => api.signals(strategy, selected, signal),
    REFRESH_MS[strategy],
    [strategy, symbolKey],
  );

  const signals = useMemo(() => data?.signals ?? [], [data]);

  const bases = useMemo(() => {
    /*
     * Ordered by the asset scope, not by the payload: the API sorts signals by
     * confidence, so deriving the strip from it would reshuffle the tabs under
     * the user's finger on every poll.
     */
    const present = new Set(signals.map((item) => item.base));
    const ordered = selected
      .map((symbol) => bySymbol.get(symbol)?.base)
      .filter((base): base is string => Boolean(base) && present.has(base as string));
    // Anything the API returned that is not in the scope (server defaults).
    const extra = [...present].filter((base) => !ordered.includes(base));
    return [...ordered, ...extra];
  }, [signals, selected, bySymbol]);

  const counts = useMemo(
    () =>
      signals.reduce<Record<string, number>>((acc, item) => {
        acc[item.base] = (acc[item.base] ?? 0) + 1;
        return acc;
      }, {}),
    [signals],
  );

  // A focused asset that leaves the selection would otherwise strand the panel
  // on an empty view with no obvious way back.
  useEffect(() => {
    if (focus && !bases.includes(focus) && bases.length) setFocus(null);
  }, [focus, bases]);

  const visible = focus ? signals.filter((item) => item.base === focus) : signals;
  const liveCount = visible.filter((item) => item.status === 'live').length;

  const waiting = (loading || scopeLoading) && !signals.length;
  const isEmpty = !waiting && !error && !visible.length;

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

      <div className="space-y-2.5">
        <StrategyTabs value={strategy} onChange={setStrategy} />
        <AssetFocusTabs bases={bases} value={focus} onChange={setFocus} counts={counts} />
      </div>

      {error && !signals.length && (
        <div className="rounded-card text-safe border border-bear/20 bg-bear/6 p-4 text-sm text-bear/90">
          {t('signals.error', { message: error.message })}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-card flex flex-col items-center gap-2 border border-white/8 bg-white/2 px-4 py-10 text-center">
          <Inbox className="size-5 text-white/25" />
          <p className="text-[13px] font-medium text-white/70">
            {focus ? t('signals.emptyFocus', { asset: focus }) : t('signals.empty')}
          </p>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-white/40">
            {focus ? t('signals.emptyFocusHint') : t('signals.emptyHint')}
          </p>
          {focus && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="glass-soft mt-1 rounded-lg px-3 py-1.5 text-[11.5px] text-white/70 transition-colors duration-200 hover:text-white"
            >
              {t('signals.showAll')}
            </button>
          )}
        </div>
      )}

      <motion.div layout className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {waiting ? Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />) : null}

        <AnimatePresence mode="popLayout">
          {visible.map((signal, index) => (
            <SignalCard key={signal.id} signal={signal} index={index} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
