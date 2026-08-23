import { m } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus, ShieldAlert } from 'lucide-react';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Meter } from '@/components/ui/Meter';
import { useTx } from '@/i18n/useTx';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import type { Signal } from '@/types/domain';

const DIRECTION = {
  long: { icon: ArrowUpRight, tone: 'bull', text: 'text-bull', glow: 'bull' },
  short: { icon: ArrowDownRight, tone: 'bear', text: 'text-bear', glow: 'bear' },
  neutral: { icon: Minus, tone: 'neutral', text: 'text-white/60', glow: 'none' },
} as const;

function Level({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] tracking-[0.14em] text-white/30 uppercase">{label}</p>
      <p className={cn('tnum mt-0.5 truncate font-mono text-[13px] font-medium', className)}>
        {formatPrice(value)}
      </p>
    </div>
  );
}

export function SignalCard({ signal, index }: { signal: Signal; index: number }) {
  const { t, text } = useTx();
  const direction = DIRECTION[signal.direction];
  const Icon = direction.icon;
  const isLive = signal.status === 'live';

  return (
    <GlassCard
      interactive
      glow={direction.glow}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className="p-4 sm:p-5"
    >
      {/* direction accent line */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-px',
          signal.direction === 'long'
            ? 'bg-linear-to-r from-transparent via-bull/70 to-transparent'
            : signal.direction === 'short'
              ? 'bg-linear-to-r from-transparent via-bear/70 to-transparent'
              : 'bg-linear-to-r from-transparent via-white/20 to-transparent',
        )}
      />

      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold tracking-tight text-white">{signal.base}</h3>
            <Badge tone="neutral">{signal.timeframe}</Badge>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wider text-bull uppercase">
                <LiveDot tone={signal.direction === 'short' ? 'bear' : 'bull'} />
                {t(`signals.status.${signal.status}`)}
              </span>
            ) : (
              <span className="text-[10px] tracking-wider text-white/30 uppercase">
                {t(`signals.status.${signal.status}`)}
              </span>
            )}
          </div>
          <p className="tnum mt-1.5 font-mono text-xl font-semibold text-white/90">
            {formatPrice(signal.price)}
          </p>
        </div>

        <div
          className={cn(
            'flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5',
            signal.direction === 'long'
              ? 'border-bull/25 bg-bull/8'
              : signal.direction === 'short'
                ? 'border-bear/25 bg-bear/8'
                : 'border-white/10 bg-white/4',
          )}
        >
          <Icon className={cn('size-3.5 shrink-0', direction.text)} />
          <span className={cn('min-w-0 truncate text-[11px] font-semibold', direction.text)}>
            {t(`signals.direction.${signal.direction}`)}
          </span>
        </div>
      </div>

      <Meter
        className="mt-4"
        value={signal.confidence}
        tone={signal.direction === 'short' ? 'bear' : signal.direction === 'long' ? 'bull' : 'neutral'}
        label={t('signals.confluence')}
        showValue
      />

      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-white/6 bg-black/20 p-3">
        <Level label={t('signals.entry')} value={signal.entry} className="text-white/85" />
        <Level label={t('signals.stop')} value={signal.stopLoss} className="text-bear" />
        <Level label={t('signals.target')} value={signal.takeProfit} className="text-bull" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-white/40 [&>span]:whitespace-nowrap">
        <span className="tnum font-mono">
          {t('signals.riskReward')} <span className="text-white/70">{signal.riskReward || '—'}</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.risk')} <span className="text-white/70">{signal.suggestedRiskPct}%</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.rsi')} <span className="text-white/70">{signal.indicators.rsi}</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.atr')} <span className="text-white/70">{signal.indicators.atrPct}%</span>
        </span>
        <span className="tnum font-mono">
          {t('signals.volume')} <span className="text-white/70">{signal.indicators.volumeRatio}×</span>
        </span>
      </div>

      <ul className="mt-3.5 space-y-1.5">
        {signal.rationale.map((node) => (
          <li key={node.key ?? node.text} className="flex gap-2 text-[11.5px] leading-relaxed text-white/50">
            <span className={cn('mt-1.5 size-1 shrink-0 rounded-full', direction.text, 'bg-current')} />
            <span className="line-clamp-2 min-w-0">{text(node)}</span>
          </li>
        ))}
      </ul>

      {signal.eventWarning && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3.5 flex items-start gap-2 rounded-lg border border-warn/20 bg-warn/6 px-2.5 py-2"
        >
          <ShieldAlert className="mt-px size-3.5 shrink-0 text-warn" />
          <p className="line-clamp-3 min-w-0 text-[11px] leading-relaxed text-warn/85">
            {text(signal.eventWarning)}
          </p>
        </m.div>
      )}
    </GlassCard>
  );
}
