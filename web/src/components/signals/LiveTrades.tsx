import { m } from 'framer-motion';
import { CandlestickChart, Radio, ShieldCheck, X } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { displayTicker } from '@/lib/ticker';
import { consumeDeepLink, deepLinkSymbol } from '@/lib/deep-link';
import { formatPrice, timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { ActiveSignal, ActiveSignalsResponse, Strategy } from '@/types/domain';

/*
 * The chart is the heaviest thing on the page and most sessions never open one,
 * so the renderer is fetched on the first click rather than shipped in the entry
 * bundle.
 */
const TradeChart = lazy(() =>
  import('@/components/signals/TradeChart').then((module) => ({ default: module.TradeChart })),
);

interface LiveTradesProps {
  data?: ActiveSignalsResponse;
  loading: boolean;
}

/** Fixed order, so the sections do not reshuffle as counts change. */
const ORDER: Strategy[] = ['scalping', 'day', 'swing'];

/**
 * How many cards a section shows on a phone before asking.
 *
 * Six is a screen and a half in one column — enough to see that a section has
 * depth without making the reader scroll past it to reach the next strategy.
 * The limit is enforced in CSS rather than by slicing the array, so the desktop
 * grid cannot be affected by it: there is no breakpoint in JavaScript to get
 * wrong, and no resize listener to fall out of step with the layout.
 */
const MOBILE_LIMIT = 6;

/** What the board can be narrowed to. `null` on either axis means everything. */
type SideFilter = 'buy' | 'sell' | null;

/**
 * One row of filter chips.
 *
 * Rendered as real buttons with `aria-pressed` rather than a `<select>`: there
 * are four options at most, they fit on one line, and a phone opening a native
 * picker to choose between "Long" and "Short" is three taps for a decision that
 * should be one.
 */
function Chips<T extends string | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
              active
                ? 'bg-white/12 text-white'
                : 'text-white/40 hover:bg-white/6 hover:text-white/75',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn('tnum ml-1 font-mono', active ? 'text-white/50' : 'text-white/25')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const COLUMN_ACCENT: Record<Strategy, string> = {
  scalping: 'from-warn/40',
  day: 'from-accent-soft/40',
  swing: 'from-cyber/40',
};

/**
 * How far a trade has travelled, as a bar.
 *
 * `pct` is already signed toward the target, so the side of the trade does not
 * come into it — a short moving down is positive progress just as a long moving
 * up is. Clamped for display only; the number beside it is not, because a trade
 * most of the way to its stop is exactly what somebody needs to see.
 */
function ProgressBar({ pct }: { pct: number }) {
  const toward = pct >= 0;
  const width = Math.min(Math.abs(pct), 100);

  return (
    <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className={cn(
          'absolute inset-y-0 rounded-full transition-[width] duration-500',
          toward ? 'bg-bull/70' : 'bg-bear/70',
        )}
        style={toward ? { width: `${width}%`, left: 0 } : { width: `${width}%`, right: 0 }}
      />
    </div>
  );
}

function TradeCard({
  trade,
  index,
  open,
  onOpen,
  className,
}: {
  trade: ActiveSignal;
  index: number;
  open: boolean;
  onOpen: () => void;
  /** Lets the section hide it on narrow screens without wrapping it in a div. */
  className?: string;
}) {
  const { t } = useTranslation();
  const { isSelected } = useAssetScope();

  const long = trade.side === 'buy';
  const move = trade.unrealisedPct;
  const selected = isSelected(trade.symbol);

  return (
    <m.button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.3 }}
      className={cn(
        'group relative block w-full overflow-hidden rounded-xl border p-2.5 text-left transition-colors duration-200',
        'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
        open ? 'border-white/20 bg-white/8' : 'border-white/8 bg-white/3 hover:border-white/14 hover:bg-white/6',
        className,
      )}
    >
      {/* A hairline in the trade's direction — the card reads before the text. */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', long ? 'bg-bull/60' : 'bg-bear/60')} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] leading-none font-semibold text-white">{displayTicker(trade.base)}</span>
            {trade.breakevenAt && (
              <ShieldCheck className="size-3.5 shrink-0 text-bull" aria-label={t('liveTrades.protected')} />
            )}
            {selected && <span className="size-1 shrink-0 rounded-full bg-accent-soft" aria-hidden />}
          </div>
          <span
            className={cn(
              'mt-1 inline-block rounded px-1 py-px text-[9px] font-semibold tracking-wider uppercase',
              long ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear',
            )}
          >
            {t(long ? 'liveTrades.long' : 'liveTrades.short')}
          </span>
        </div>

        <div className="shrink-0 text-right">
          {move !== null && (
            <div className={cn('tnum font-mono text-sm leading-none', move >= 0 ? 'text-bull' : 'text-bear')}>
              {move >= 0 ? '+' : ''}
              {move.toFixed(2)}%
            </div>
          )}
          <div className="mt-1 text-[10px] whitespace-nowrap text-white/30">{timeAgo(trade.openedAt)}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="min-w-0">
          <div className="text-white/30">{t('signals.entry')}</div>
          <div className="tnum truncate font-mono text-white/70">{formatPrice(trade.entry)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-white/30">{t('signals.stop')}</div>
          <div className={cn('tnum truncate font-mono', trade.breakevenAt ? 'text-bull/80' : 'text-white/50')}>
            {formatPrice(trade.stopLoss)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-white/30">{t('signals.target')}</div>
          <div className="tnum truncate font-mono text-white/50">
            {formatPrice(trade.targets?.length ? trade.targets[0]!.price : trade.takeProfit)}
          </div>
        </div>
      </div>

      {/*
        The rungs, when the trade has any. Shown as a row of small chips rather
        than three more label/value pairs: the interesting thing at a glance is
        which of them have paid, not what each is worth to four decimal places.
      */}
      {trade.targets && trade.targets.length > 1 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {trade.targets.map((target) => {
            const hit = trade.fills?.some((fill) => fill.reason === 'target' && fill.level === target.level);
            return (
              <span
                key={target.level}
                title={formatPrice(target.price)}
                className={cn(
                  'tnum rounded px-1.5 py-0.5 font-mono text-[9.5px]',
                  hit ? 'bg-bull/15 text-bull/90' : 'bg-white/5 text-white/35',
                )}
              >
                {hit ? '✓' : ''}TP{target.level} · {Math.round(target.share * 100)}%
              </span>
            );
          })}
        </div>
      )}

      {trade.progressPct !== null && <ProgressBar pct={trade.progressPct} />}

      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-white/25 transition-colors group-hover:text-white/50">
        <CandlestickChart className="size-3" />
        {t(open ? 'liveTrades.hideChart' : 'liveTrades.showChart')}
      </div>
    </m.button>
  );
}

/**
 * What the bot is tracking, on the site that publishes it.
 *
 * Grouped by strategy, because a scalp and a swing on the same asset are
 * different positions with different horizons and reading them interleaved
 * hides that — but grouped down the page rather than across it. Three
 * side-by-side columns cost two thirds of the width to say three words, and
 * with thirty trades in one of them the board ran to fourteen thousand pixels.
 * A heading on its own row costs one line and leaves the full width for cards.
 */
export function LiveTrades({ data, loading }: LiveTradesProps) {
  const { t } = useTranslation();
  const { toggle, isSelected } = useAssetScope();
  const [openId, setOpenId] = useState<string>();
  /** Set only when a deep link opened the chart, so only that case scrolls. */
  const scrollOnOpen = useRef(false);
  /** Sections the reader has expanded on a phone. Ignored above `md`. */
  const [expanded, setExpanded] = useState<Set<Strategy>>(new Set());
  /** Narrowing, on two independent axes. `null` means "everything" on each. */
  const [strategyFilter, setStrategyFilter] = useState<Strategy | null>(null);
  const [sideFilter, setSideFilter] = useState<SideFilter>(null);

  /*
   * Newest first, everywhere.
   *
   * Chosen over distance-to-entry, which sounds more useful and is not: a trade
   * sitting a hair from its entry is either minutes old or one that ran up and
   * came all the way back, and those are opposite situations shown in the same
   * position. Age says one thing and says it unambiguously — and a call from ten
   * minutes ago is the one still worth acting on.
   */
  const columns = useMemo(() => {
    const signals = [...(data?.signals ?? [])].sort(
      (a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt),
    );

    return ORDER.map((strategy) => ({
      strategy,
      trades: signals.filter((signal) => signal.strategy === strategy),
    }));
  }, [data]);

  /*
   * Counts come off the unfiltered board, so a chip says how many it would
   * show rather than how many survive the filter already applied. A "Long 4"
   * that becomes "Long 0" the moment you pick Scalping is a label that changes
   * as you read it.
   */
  const counts = useMemo(() => {
    const all = data?.signals ?? [];
    return {
      byStrategy: Object.fromEntries(
        ORDER.map((strategy) => [strategy, all.filter((s) => s.strategy === strategy).length]),
      ) as Record<Strategy, number>,
      buy: all.filter((s) => s.side === 'buy').length,
      sell: all.filter((s) => s.side === 'sell').length,
      all: all.length,
    };
  }, [data]);

  /** The board after both filters, still grouped and still in section order. */
  const shown = useMemo(
    () =>
      columns
        .filter((column) => !strategyFilter || column.strategy === strategyFilter)
        .map((column) => ({
          ...column,
          trades: sideFilter ? column.trades.filter((t) => t.side === sideFilter) : column.trades,
        }))
        .filter((column) => column.trades.length > 0),
    [columns, strategyFilter, sideFilter],
  );

  const filtered = Boolean(strategyFilter || sideFilter);
  const matched = shown.reduce((sum, column) => sum + column.trades.length, 0);

  const total = data?.signals.length ?? 0;
  const opened = data?.signals.find((signal) => signal.id === openId);
  const chartRef = useRef<HTMLDivElement>(null);

  /*
   * A link that names an asset opens that asset's chart, once the board has
   * loaded enough to know whether there is one.
   *
   * Newest first, matching the board's own order, so a coin carrying two open
   * trades opens the one the reader was just told about rather than an older
   * call on the same pair.
   *
   * `consumeDeepLink` is what makes this fire exactly once: the poll behind
   * `data` re-runs every few seconds, and without it every refresh would drag
   * the reader back to this chart after they had closed it or opened another.
   * A symbol with no open trade quietly does nothing here — it is still in the
   * selection, so its card is in the signal grid, which is the honest outcome
   * when there is no live trade to show.
   */
  useEffect(() => {
    if (!deepLinkSymbol || !data?.signals.length) return;

    const match = [...data.signals]
      .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
      .find((signal) => signal.symbol === deepLinkSymbol);
    if (!match) return;
    if (!consumeDeepLink()) return;

    scrollOnOpen.current = true;
    setOpenId(match.id);
  }, [data]);

  /*
   * Arriving from an alert lands at the top of a long page with the chart far
   * below it, so the one thing the link was for would open unseen. Scrolled
   * only when the panel appears in response to the link, never when the reader
   * opened it themselves — they are already looking at the card they clicked.
   */
  useEffect(() => {
    if (!opened || !chartRef.current || !scrollOnOpen.current) return;
    scrollOnOpen.current = false;
    chartRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [opened]);

  const handleOpen = (trade: ActiveSignal) => {
    setOpenId((current) => (current === trade.id ? undefined : trade.id));
    // Opening a chart also brings the asset into every other panel's scope.
    if (!isSelected(trade.symbol)) toggle(trade.symbol);
  };

  return (
    <GlassCard className="p-4 sm:p-5">
      <SectionHeader
        icon={Radio}
        title={t('liveTrades.title')}
        subtitle={t('liveTrades.subtitle')}
        tip={t('glossary.liveTrades')}
        tipLabel={t('liveTrades.title')}
        actions={
          data && data.decided > 0 ? (
            <span className="glass-soft tnum rounded-lg px-2 py-1 font-mono text-[10.5px] text-white/60">
              {t('liveTrades.record', { rate: String(data.winRate), decided: String(data.decided) })}
            </span>
          ) : undefined
        }
      />

      {/*
        What the open book carries, which the record never showed.

        Every panel here described settled trades, so a board holding sixty
        positions looked exactly like one holding three. Each open trade is a
        full risk unit committed at once, and a correlated market closes them
        together — the only occasion the count matters, and the one nobody was
        being shown.
      */}
      {data?.exposure && data.exposure.open > 0 && (
        <div
          className={cn(
            'mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[11px]',
            data.exposure.open >= data.exposure.limit
              ? 'border-warn/30 bg-warn/8'
              : 'border-white/8 bg-white/2',
          )}
        >
          <span className="text-white/40">{t('liveTrades.exposure')}</span>
          <span className="tnum font-mono text-[13px] font-semibold text-white">
            {t('liveTrades.exposureRisk', { count: data.exposure.open })}
          </span>
          {data.exposure.priced > 0 && (
            <span
              className={cn(
                'tnum font-mono',
                data.exposure.floatingR >= 0 ? 'text-bull/90' : 'text-bear/90',
              )}
            >
              {data.exposure.floatingR >= 0 ? '+' : ''}
              {data.exposure.floatingR.toFixed(2)}R {t('liveTrades.floating')}
            </span>
          )}
          {data.exposure.open >= data.exposure.limit && (
            <span className="text-warn/90">{t('liveTrades.exposureFull')}</span>
          )}
        </div>
      )}

      {loading && !total ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : !total ? (
        <p className="mt-4 px-1 py-6 text-center text-[11.5px] leading-relaxed text-white/40">
          {t('liveTrades.empty')}
        </p>
      ) : (
        <>
          {/*
            Sections stacked, cards flowing across the full width inside each.
            
            This used to be one column per strategy, which read well with three
            trades apiece and fell apart at thirty: a third-width column stacking
            thirty cards is thirty card-heights of page, and the board measured
            fourteen thousand pixels tall. The grouping is worth keeping — a
            scalp and a swing on the same asset are different positions — but it
            belongs on the vertical axis, where a heading costs one row, rather
            than on the horizontal one, where it costs two thirds of the width.
          */}
          {/*
            Two axes, one row. Strategy and direction are independent questions
            — "show me swings" and "show me shorts" compose — so they are two
            groups rather than one flat list where picking Long would silently
            clear the strategy you had chosen.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/6 pb-3">
            <Chips
              label={t('liveTrades.filterStrategy')}
              value={strategyFilter}
              onChange={setStrategyFilter}
              options={[
                { value: null, label: t('common.all'), count: counts.all },
                ...ORDER.map((strategy) => ({
                  value: strategy as Strategy | null,
                  label: t(`signals.strategies.${strategy}`),
                  count: counts.byStrategy[strategy],
                })),
              ]}
            />
            <span aria-hidden className="hidden h-3 w-px bg-white/10 sm:block" />
            <Chips
              label={t('liveTrades.filterSide')}
              value={sideFilter}
              onChange={setSideFilter}
              options={[
                { value: null, label: t('common.all') },
                { value: 'buy', label: t('liveTrades.long'), count: counts.buy },
                { value: 'sell', label: t('liveTrades.short'), count: counts.sell },
              ]}
            />
          </div>

          {filtered && !matched && (
            <p className="mt-4 px-1 py-6 text-center text-[11.5px] leading-relaxed text-white/40">
              {t('liveTrades.emptyFilter')}
            </p>
          )}

          <div className="mt-4 space-y-5">
            {shown
              .map((column) => (
                <section key={column.strategy} className="min-w-0">
                  <header className="relative mb-2 flex items-baseline justify-between overflow-hidden rounded-lg px-2 py-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-0 bg-gradient-to-r to-transparent opacity-15',
                        COLUMN_ACCENT[column.strategy],
                      )}
                    />
                    <h3 className="relative text-[10.5px] font-semibold tracking-[0.14em] text-white/70 uppercase">
                      {t(`signals.strategies.${column.strategy}`)}
                    </h3>
                    <span className="tnum relative font-mono text-[10.5px] text-white/35">
                      {column.trades.length}
                    </span>
                  </header>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {column.trades.map((trade, index) => (
                      <TradeCard
                        key={trade.id}
                        trade={trade}
                        index={index}
                        open={trade.id === openId}
                        onOpen={() => handleOpen(trade)}
                        /*
                         * Hidden below `md` only, and only while collapsed. The
                         * card stays mounted either way, so opening a section is
                         * instant and the desktop grid never sees this class do
                         * anything at all.
                         */
                        className={cn(
                          index >= MOBILE_LIMIT && !expanded.has(column.strategy) && 'hidden md:block',
                        )}
                      />
                    ))}
                  </div>

                  {column.trades.length > MOBILE_LIMIT && (
                    <button
                      type="button"
                      // `md:hidden`: above the breakpoint everything is already shown.
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/3 py-2 text-[11.5px] font-medium text-white/55 transition-colors duration-200 hover:border-white/20 hover:text-white/85 md:hidden"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(column.strategy)) next.delete(column.strategy);
                          else next.add(column.strategy);
                          return next;
                        })
                      }
                    >
                      {expanded.has(column.strategy)
                        ? t('liveTrades.showLess')
                        : t('liveTrades.showMore', { count: column.trades.length - MOBILE_LIMIT })}
                    </button>
                  )}
                </section>
              ))}
          </div>

          {opened && (
            <div ref={chartRef} className="mt-5 rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {displayTicker(opened.base)}
                  <span className="ml-2 text-[11px] font-normal text-white/40">
                    {t(`signals.strategies.${opened.strategy}`)} · {opened.timeframe}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setOpenId(undefined)}
                  aria-label={t('liveTrades.hideChart')}
                  className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
                >
                  <X className="size-4" />
                </button>
              </div>

              <Suspense fallback={<Skeleton className="h-64 w-full sm:h-72" />}>
                <TradeChart trade={opened} />
              </Suspense>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
