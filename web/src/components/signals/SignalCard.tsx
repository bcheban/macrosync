import { PositionCalculator } from '@/components/signals/PositionCalculator';
import { Suspense, lazy, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { trackUrl } from '@/lib/telegram';

/*
 * The chart renderer is the heaviest import this app has and most sessions
 * never expand a card, so it is fetched on the first click rather than shipped
 * in the entry bundle.
 */
const MiniChart = lazy(() =>
  import('@/components/signals/MiniChart').then((module) => ({ default: module.MiniChart })),
);
import { m } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  ChevronDown,
  ExternalLink,
  Eye,
  Hourglass,
  ShieldAlert,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { InfoTip } from '@/components/ui/InfoTip';
import { Meter } from '@/components/ui/Meter';
import { useTx } from '@/i18n/useTx';
import { cn } from '@/lib/cn';
import { displayTicker } from '@/lib/ticker';
import { formatPrice } from '@/lib/format';
import { mexcFuturesUrl } from '@/lib/mexc';
import type { Signal } from '@/types/domain';

/**
 * One colour per verdict, used everywhere the card refers to it.
 *
 * Green only ever means buy or take-profit, red only ever sell or stop-loss,
 * amber only ever "not yet". Nothing else in the card borrows those colours, so
 * any part of it read on its own carries the same meaning.
 */
const VERDICT = {
  buy: {
    icon: ArrowUpRight,
    text: 'text-bull',
    chip: 'border-bull/40 bg-bull/12 text-bull',
    rail: 'via-bull/70',
    glow: 'bull',
    meter: 'bull',
    dot: 'bull',
  },
  sell: {
    icon: ArrowDownRight,
    text: 'text-bear',
    chip: 'border-bear/40 bg-bear/12 text-bear',
    rail: 'via-bear/70',
    glow: 'bear',
    meter: 'bear',
    dot: 'bear',
  },
  wait: {
    icon: Hourglass,
    text: 'text-warn',
    chip: 'border-warn/30 bg-warn/10 text-warn',
    rail: 'via-warn/50',
    glow: 'none',
    meter: 'neutral',
    dot: 'warn',
  },
} as const;

function Level({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: number;
  tone: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] tracking-[0.14em] text-white/40 uppercase">{label}</p>
      <p
        className={cn(
          'tnum mt-1 truncate font-mono font-semibold',
          /*
           * Entry is the number a trader acts on first; the other two only
           * matter once the position exists. The size difference is the
           * hierarchy — colour alone was carrying it before.
           */
          emphasis ? 'text-[15px] sm:text-base' : 'text-[13px]',
          tone,
        )}
      >
        {formatPrice(value)}
      </p>
    </div>
  );
}

/** A footer toggle. Two of these sit side by side, so they share a shape. */
function FooterButton({
  onClick,
  expanded,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  expanded: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors duration-200',
        expanded
          ? 'border-white/20 bg-white/8 text-white'
          : 'border-white/10 bg-white/3 text-white/55 hover:border-white/20 hover:text-white/85',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
    </button>
  );
}

export function SignalCard({
  signal,
  index,
  className,
}: {
  signal: Signal;
  index: number;
  /** Lets the grid fold the card away on a phone without wrapping it in a div. */
  className?: string;
}) {
  const { t, text } = useTx();
  const { t: tt } = useTranslation();

  const verdict = VERDICT[signal.verdict];
  const Icon = verdict.icon;
  const [chartOpen, setChartOpen] = useState(false);
  /*
   * Collapsed on every width, not just below `md`.
   *
   * Eight cards each carrying an open form is most of the page and almost
   * none of it is being read — and on a stretched grid every one of those
   * forms is height the shorter cards have to match.
   */
  const [calcOpen, setCalcOpen] = useState(false);
  const track = trackUrl(signal.symbol, signal.strategy);

  return (
    <GlassCard
      interactive
      fill
      glow={verdict.glow}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className={cn('p-4 sm:p-5', className)}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent',
          verdict.rail,
        )}
      />

      {/* Asset, price and the call — the three things read at a glance. */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold tracking-tight text-white">{displayTicker(signal.base)}</h3>
            <Badge tone="neutral">{signal.timeframe}</Badge>
            {signal.status === 'live' && <LiveDot tone={verdict.dot} />}
          </div>
          <p className="tnum mt-1.5 font-mono text-xl font-semibold text-white/90">
            {formatPrice(signal.price)}
          </p>
        </div>

        <div
          className={cn(
            'flex max-w-[52%] shrink-0 flex-col items-end gap-0.5 rounded-xl border px-2.5 py-1.5',
            verdict.chip,
          )}
        >
          <span className="flex items-center gap-1.5 text-[13px] leading-none font-bold tracking-wide">
            <Icon className="size-3.5 shrink-0" strokeWidth={2.6} />
            {t(`signals.verdict.label.${signal.verdict}`)}
          </span>
          <span className="text-[10px] leading-none opacity-70">
            {t(`signals.verdict.side.${signal.verdict}`)}
          </span>
        </div>
      </div>

      <div className="mt-3.5">
        <Meter
          value={signal.confidence}
          tone={verdict.meter}
          label={t('signals.confluence')}
          labelTip={
            <InfoTip label={tt('glossary.confluenceLabel')} align="start">
              {tt('glossary.confluence')}
            </InfoTip>
          }
          showValue
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-[10px] tracking-[0.16em] text-white/40 uppercase">{t('signals.plan')}</p>
          <InfoTip label={tt('glossary.levelsLabel')} align="start">
            {tt('glossary.levels')}
          </InfoTip>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/*
            Entry, target, stop — the order a trade is thought about rather
            than the order it might end in. Entry is the decision, the target
            is why it is worth taking, and the stop is the cost of being wrong.
          */}
          <Level label={t('signals.entry')} value={signal.entry} tone="text-white" emphasis />
          <Level label={t('signals.target')} value={signal.takeProfit} tone="text-bull" />
          <Level label={t('signals.stop')} value={signal.stopLoss} tone="text-bear" />
        </div>
      </div>

      {/* The raw reads, demoted — there to check the sentence against. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-white/35 [&>span]:whitespace-nowrap">
        <span className="tnum font-mono">
          {t('signals.riskReward')} <span className="text-white/60">{signal.riskReward || '—'}</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.risk')} <span className="text-white/60">{signal.suggestedRiskPct}%</span>
        </span>
        {/* Perpetuals only: the leverage at which liquidation still clears the stop. */}
        {signal.maxSafeLeverage > 0 && (
          <span className="tnum font-mono">
            {t('signals.leverage')} <span className="text-white/60">{signal.maxSafeLeverage}x</span>
          </span>
        )}
        <span className="tnum font-mono">
          {t('signals.rsi')} <span className="text-white/60">{signal.indicators.rsi}</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.atr')} <span className="text-white/60">{signal.indicators.atrPct}%</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.volume')} <span className="text-white/60">{signal.indicators.volumeRatio}×</span>
        </span>
      </div>

      {/*
        The sentence, after the numbers it explains.
        
        It reads second because a card is scanned before it is read: entry,
        target and stop are what somebody is looking for, and a paragraph above
        them pushes the figures to a different height on every card.
        
        `grow` makes this the block that absorbs the height difference between
        cards in a row, which is what keeps the numbers above it at the same
        level everywhere. The slack lands in a bordered box rather than in an
        auto margin because a reason panel of consistent height reads as a
        grid, where a floating gap reads as a bug.

        `max-h-40` is the ceiling on that, and it exists for one case: a
        neighbour expanding its calculator adds two hundred pixels to the row,
        and without a cap this box swallowed all of it — measured at 344px of
        panel around 61px of text, which is the "massive empty space" this was
        reported as. Past the cap the remainder goes to the footer's `mt-auto`
        instead, where it reads as space rather than as a panel of nothing.

        `min-h-fit` is what stops the cap ever clipping: when the two conflict
        CSS takes the minimum, so a genuinely long summary sets its own height
        and `max-h` is ignored. The cap can only ever limit *growth*.
      */}
      <p className="mt-3.5 max-h-40 min-h-fit grow rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-[12.5px] leading-relaxed text-white/75">
        {text(signal.summary)}
      </p>

      {/* Disclosures, above the footer so the buttons stay the last thing. */}
      {chartOpen && (
        <Suspense fallback={<div className="mt-3 h-40 animate-pulse rounded-xl bg-white/4 sm:h-48" />}>
          <MiniChart signal={signal} />
        </Suspense>
      )}

      {calcOpen && signal.verdict !== 'wait' && <PositionCalculator signal={signal} />}

      {signal.eventWarning && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3.5 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/8 px-2.5 py-2"
        >
          <ShieldAlert className="mt-px size-3.5 shrink-0 text-warn" />
          <p className="line-clamp-3 min-w-0 text-[11px] leading-relaxed text-warn/90">
            {text(signal.eventWarning)}
          </p>
        </m.div>
      )}

      {/*
        The footer: three small toggles, then the one button that acts.

        `mt-auto` is belt-and-braces — the summary above already grows, so
        there is no slack left for an auto margin to claim. It is here because
        it costs nothing and it is what keeps this anchored if the summary is
        ever dropped or stops growing.

        The exchange link is full width and last. It used to live inside the
        calculator; now the calculator is collapsed by default and the link
        would have been collapsed with it, which is the one control in this
        card nobody should have to open anything to reach.
      */}
      <div className="mt-auto pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <FooterButton
            onClick={() => setChartOpen((open) => !open)}
            expanded={chartOpen}
            icon={CandlestickChart}
            label={t(chartOpen ? 'signals.chartHide' : 'signals.chartShow')}
          />

          {/*
            Sizing on actionable calls only — a position calculator beside "no
            edge right now" reads as encouragement.
          */}
          {signal.verdict !== 'wait' && (
            <FooterButton
              onClick={() => setCalcOpen((open) => !open)}
              expanded={calcOpen}
              icon={SlidersHorizontal}
              label={t('calc.toggle')}
            />
          )}

          {/*
            Track is offered on every verdict, not only on `wait`. A standing
            call is exactly when somebody wants to hear if it flips, and one
            rule is easier to learn than two.
          */}
          {track && (
            <a
              href={track}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('track_click', { strategy: signal.strategy })}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#229ED9]/40 bg-[#229ED9]/12 px-2.5 text-[11px] font-medium text-white/80 transition-colors duration-200 hover:bg-[#229ED9]/20 hover:text-white"
            >
              <Eye className="size-3.5" />
              {t('signals.track')}
            </a>
          )}
        </div>

        {signal.verdict !== 'wait' && (
          <a
            href={mexcFuturesUrl(signal.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-linear-to-b from-accent/25 to-accent/10 py-2 text-[12px] font-semibold text-white transition-colors duration-200 hover:from-accent/35 hover:to-accent/15"
          >
            {t('calc.tradeOn', { price: formatPrice(signal.entry) })}
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </GlassCard>
  );
}
