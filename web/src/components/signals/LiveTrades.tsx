import { m } from 'framer-motion';
import { CandlestickChart, Radio, ShieldCheck, X } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
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
            <span className="truncate text-[14px] leading-none font-semibold text-white">{trade.base}</span>
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
          <div className="tnum truncate font-mono text-white/50">{formatPrice(trade.takeProfit)}</div>
        </div>
      </div>

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
  /** Sections the reader has expanded on a phone. Ignored above `md`. */
  const [expanded, setExpanded] = useState<Set<Strategy>>(new Set());

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

  const total = data?.signals.length ?? 0;
  const opened = data?.signals.find((signal) => signal.id === openId);

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
          <div className="mt-4 space-y-5">
            {columns
              // An empty strategy is not information worth a heading and a box.
              .filter((column) => column.trades.length > 0)
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
            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {opened.base}
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
