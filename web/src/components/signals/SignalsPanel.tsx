import { AnimatePresence, m } from 'framer-motion';
import { CandlestickChart, Compass, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { bucketOf, BUCKET_IDS, type Bucket } from '@/lib/confidence';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { Strategy } from '@/types/domain';
import { AssetFocusTabs, type AssetFocus } from './AssetFocusTabs';
import { SignalCard } from './SignalCard';
import { SignalCardSkeleton } from './SignalCardSkeleton';
import { ConfidenceFilter } from './ConfidenceFilter';
import { StrategyTabs } from './StrategyTabs';
import { ZenToggle, useZenMode } from './ZenToggle';

/**
 * How many signal cards a phone shows before asking.
 *
 * Four, where the trade board shows six, because these cards are roughly three
 * times the height: four of them is about the same amount of page as six
 * trades, and page is the thing being rationed. Enforced in CSS rather than by
 * slicing the array, so the desktop grid cannot be affected by it — there is no
 * breakpoint in JavaScript to get wrong and no resize listener to fall out of
 * step with the layout.
 */
const MOBILE_LIMIT = 4;

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
  const [zen, setZen] = useZenMode();
  const [bucket, setBucket] = useState<Bucket | null>(null);

  /*
   * The settled record, for the win rate beside the band filter.
   *
   * Its own request on its own clock: the history changes when a trade closes,
   * which is minutes to days apart, where the board re-reads every fifteen to
   * sixty seconds. Polling them together would fetch the ledger dozens of
   * times for every change in it.
   */
  const history = usePolling((signal) => api.tradeHistory(signal), 180_000);
  /** Whether the reader has asked for the rest, on a phone. Ignored above `md`. */
  const [expanded, setExpanded] = useState(false);

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

  /*
   * Actionable calls first, then confidence — which is the order the API
   * already returns them in.
   *
   * Not newest-first, which is the obvious rule and would do nothing here:
   * every card in a response is computed in one batch off the same candles, so
   * the timestamps differ by milliseconds and sorting on them is a shuffle.
   * Order only started to matter once a phone sees four cards out of eight, and
   * what must not happen is those four all being `wait` — the reader would
   * scroll the whole panel without meeting one call they could act on.
   */
  /* Band counts come off the unfiltered board, so a chip says how many it
     would show rather than how many survive a filter already applied. */
  const bucketCounts = useMemo(() => {
    const tally = Object.fromEntries(BUCKET_IDS.map((key) => [key, 0])) as Record<Bucket, number>;
    for (const item of signals) {
      const found = bucketOf(item.confidence);
      // `null` is a reading under 60, which belongs to none of the brackets.
      if (found) tally[found] += 1;
    }
    return tally;
  }, [signals]);

  const { visible, hiddenByZen } = useMemo(() => {
    const byFocus = focus ? signals.filter((item) => item.base === focus) : signals;
    const scoped = bucket ? byFocus.filter((item) => bucketOf(item.confidence) === bucket) : byFocus;
    const actionable = scoped.filter((item) => item.verdict !== 'wait');
    const setups = scoped.filter((item) => item.verdict === 'wait');

    /*
     * The ordering above already splits the board on exactly the line zen mode
     * cares about, so the mode is not a second filter — it is the decision not
     * to append the second half. Keeping it as one expression means the sort
     * and the mode cannot drift into disagreeing about what "actionable" is.
     */
    return {
      visible: zen ? actionable : [...actionable, ...setups],
      hiddenByZen: setups.length,
    };
  }, [signals, focus, zen, bucket]);
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
            <ZenToggle value={zen} onChange={setZen} hidden={hiddenByZen} />
            <Badge tone={liveCount ? 'bull' : 'neutral'}>{t('signals.live', { count: liveCount })}</Badge>
          </div>
        }
      />

      <div className="space-y-2.5">
        <StrategyTabs value={strategy} onChange={setStrategy} />
        <AssetFocusTabs bases={bases} value={focus} onChange={setFocus} counts={counts} />
        <ConfidenceFilter
          value={bucket}
          onChange={setBucket}
          counts={bucketCounts}
          trades={history.data?.trades ?? []}
        />
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
            {zen && hiddenByZen > 0
              ? t('signals.emptyZen')
              : focus
                ? t('signals.emptyFocus', { asset: focus })
                : t('signals.empty')}
          </p>
          <p className="max-w-md text-[12px] leading-relaxed text-white/45">
            {/*
              A board emptied by the mode is not an empty board. Telling
              somebody to pick an asset when they already have twelve would
              read as the panel having lost them.
            */}
            {zen && hiddenByZen > 0
              ? t('signals.emptyZenHint', { count: hiddenByZen })
              : focus
                ? t('signals.emptyFocusHint')
                : t('signals.onboarding')}
          </p>

          {/*
            An escape hatch, not just an explanation.
            
            Focus mode persists, so somebody who turned it on days ago comes
            back to a board that is empty whenever every setup is a `wait` —
            and from the outside that reads as the signals having disappeared,
            not as a filter doing its job. Telling them is half of it; the
            button that undoes it has to be here, where they are looking.
          */}
          {zen && hiddenByZen > 0 ? (
            <button
              type="button"
              onClick={() => setZen(false)}
              className="glass-soft mt-1 rounded-lg px-3.5 py-2 text-[12px] text-white/75 transition-all duration-200 hover:bg-white/8 hover:text-white active:scale-95"
            >
              {/*
                An action, not a description. `zenOff` is the toggle's tooltip
                — "Focus mode: hide setups that are not calls yet" — which on a
                button offering the way out reads exactly backwards.
              */}
              {t('signals.zenShowAll')}
            </button>
          ) : focus ? (
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

      {/*
        Stretching, and the slack has somewhere to go.
        
        This grid was on `items-start` for a while, because pinning only the
        sizing block with `mt-auto` left every short card with one dead gap
        above it. The fix is not to stop stretching — it is to put the slack
        somewhere that looks deliberate: the summary below grows, so a short
        card gets a taller reason panel rather than a hole.
      */}
      <m.div layout className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {/* As many placeholders as signals are expected, so the grid does not
            change height when the payload lands. */}
        {waiting
          ? Array.from({ length: Math.min(selected.length || 8, 16) }).map((_, index) => (
              <SignalCardSkeleton
                key={index}
                /*
                 * Folded on the same rule as the cards they stand in for.
                 * Otherwise a phone paints eight placeholders and drops to four
                 * when the payload lands — the exact shift this component was
                 * shaped to prevent.
                 */
                className={cn(index >= MOBILE_LIMIT && 'hidden md:block')}
              />
            ))
          : null}

        <AnimatePresence mode="popLayout">
          {visible.map((signal, index) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              index={index}
              /*
               * Hidden below `md` only, and only while collapsed. The card stays
               * mounted either way, so expanding is instant and the desktop grid
               * never sees this class do anything at all.
               */
              className={cn(index >= MOBILE_LIMIT && !expanded && 'hidden md:block')}
            />
          ))}
        </AnimatePresence>
      </m.div>

      {!waiting && visible.length > MOBILE_LIMIT && (
        <button
          type="button"
          // `md:hidden`: above the breakpoint everything is already shown.
          className="w-full rounded-xl border border-white/10 bg-white/3 py-2 text-[11.5px] font-medium text-white/55 transition-colors duration-200 hover:border-white/20 hover:text-white/85 md:hidden"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? t('common.showLess')
            : t('signals.showMore', { count: visible.length - MOBILE_LIMIT })}
        </button>
      )}
    </section>
  );
}
