import { PositionCalculator } from '@/components/signals/PositionCalculator';
import { m } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Hourglass, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { InfoTip } from '@/components/ui/InfoTip';
import { Meter } from '@/components/ui/Meter';
import { useTx } from '@/i18n/useTx';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
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
            <h3 className="text-base font-semibold tracking-tight text-white">{signal.base}</h3>
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

      {/* Why, in one sentence — the card's conclusion rather than its inputs. */}
      <p className="mt-3.5 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-[12.5px] leading-relaxed text-white/75">
        {text(signal.summary)}
      </p>

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
          <Level label={t('signals.entry')} value={signal.entry} tone="text-white" emphasis />
          <Level label={t('signals.stop')} value={signal.stopLoss} tone="text-bear" />
          <Level label={t('signals.target')} value={signal.takeProfit} tone="text-bull" />
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
        What the reader does about the card, pinned to its bottom edge.

        `mt-auto` eats whatever slack the stretched card has, so the exchange
        button sits the same distance from the bottom on every card in the row
        however far the summary above it wrapped. That only holds while the
        calculator is the last thing in here — which is why the event warning
        now comes before it rather than after. It reads better in that order
        anyway: the risk, and then the size to take given the risk.
      */}
      <div className="mt-auto">
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
          The levels above are what the engine decided; this is what the reader
          does about it, and interleaving the two made the card read as one
          undifferentiated block of numbers.

          Actionable calls only — a sizing widget beside "no edge right now"
          reads as encouragement.
        */}
        {signal.verdict !== 'wait' && <PositionCalculator signal={signal} />}
      </div>
    </GlassCard>
  );
}
