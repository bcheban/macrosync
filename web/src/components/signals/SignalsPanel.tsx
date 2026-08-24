import { AnimatePresence, m } from 'framer-motion';
import { CandlestickChart, Compass, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { Strategy } from '@/types/domain';
import { AssetFocusTabs, type AssetFocus } from './AssetFocusTabs';
import { SignalCard } from './SignalCard';
import { SignalCardSkeleton } from './SignalCardSkeleton';
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
     * Derived from the asset scope, which is known before the first response,
     * so the strip has its final width and height on the very first paint. Two
     * things follow from that: the tabs never reshuffle when the API re-sorts
     * signals by confidence, and the row cannot appear late and shove the whole
     * grid down — that late insertion was the largest layout shift on desktop.
     */
    const ordered = selected
      .map((symbol) => bySymbol.get(symbol)?.base)
      .filter((base): base is string => Boolean(base));
    // Anything the API returned outside the scope (it falls back to defaults).
    const extra = [...new Set(signals.map((item) => item.base))].filter(
      (base) => !ordered.includes(base),
    );
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
  // Counts actionable calls, which is what the badge implies — a `forming`
  // long is a watch item, and counting it made the header overstate the tape.
  const liveCount = visible.filter((item) => item.verdict !== 'wait').length;

  const waiting = (loading || scopeLoading) && !signals.length;
  const isEmpty = !waiting && !error && !visible.length;

  return (
    <section className="min-w-0 space-y-4">
      <SectionHeader
        icon={CandlestickChart}
        title={t('signals.title')}
        subtitle={t(`signals.subtitles.${strategy}`)}
        tip={t('glossary.signals')}
        tipLabel={t('glossary.signalsLabel')}
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
        <div className="rounded-card flex flex-col items-center gap-3 border border-white/8 bg-white/2 px-5 py-12 text-center">
          {/*
            An empty grid is the first thing a new visitor may see, so it
            explains what the panel would show rather than just reporting that
            it is empty.
          */}
          <span className="glass-soft flex size-11 items-center justify-center rounded-2xl text-accent-soft">
            {focus ? <Inbox className="size-5" /> : <Compass className="size-5" />}
          </span>

          <p className="text-[14px] font-semibold text-white/85">
            {focus ? t('signals.emptyFocus', { asset: focus }) : t('signals.empty')}
          </p>
          <p className="max-w-md text-[12px] leading-relaxed text-white/45">
            {focus ? t('signals.emptyFocusHint') : t('signals.onboarding')}
          </p>

          {focus ? (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="glass-soft mt-1 rounded-lg px-3.5 py-2 text-[12px] text-white/75 transition-all duration-200 hover:bg-white/8 hover:text-white active:scale-95"
            >
              {t('signals.showAll')}
            </button>
          ) : (
            <ul className="mt-1 grid gap-1.5 text-left text-[11.5px] text-white/40 sm:grid-cols-3">
              {(['step1', 'step2', 'step3'] as const).map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="tnum font-mono text-accent-soft/70">{index + 1}</span>
                  {t(`signals.${step}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <m.div layout className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {/* As many placeholders as signals are expected, so the grid does not
            change height when the payload lands. */}
        {waiting
          ? Array.from({ length: Math.min(selected.length || 8, 16) }).map((_, index) => (
              <SignalCardSkeleton key={index} />
            ))
          : null}

        <AnimatePresence mode="popLayout">
          {visible.map((signal, index) => (
            <SignalCard key={signal.id} signal={signal} index={index} />
          ))}
        </AnimatePresence>
      </m.div>
    </section>
  );
}
