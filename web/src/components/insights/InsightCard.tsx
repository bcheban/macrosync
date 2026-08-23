import { AnimatePresence, m } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Meter } from '@/components/ui/Meter';
import { useTx } from '@/i18n/useTx';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import type { AiInsight } from '@/types/domain';

const SENTIMENT: Record<AiInsight['sentiment'], { tone: Tone; icon: typeof TrendingUp }> = {
  bullish: { tone: 'bull', icon: TrendingUp },
  bearish: { tone: 'bear', icon: TrendingDown },
  neutral: { tone: 'neutral', icon: Waves },
};

const POSTURE_TONE: Record<AiInsight['posture'], Tone> = {
  defensive: 'bear',
  neutral: 'cyber',
  constructive: 'bull',
};

const SEVERITY_BAR = { high: 'bg-bear', medium: 'bg-warn', low: 'bg-cyber' } as const;

export function InsightCard({ insight, index }: { insight: AiInsight; index: number }) {
  const { t, text } = useTx();
  const [expanded, setExpanded] = useState(false);
  const sentiment = SENTIMENT[insight.sentiment];
  const SentimentIcon = sentiment.icon;

  const visible = expanded ? insight.scenarios : insight.scenarios.slice(0, 2);
  const hidden = insight.scenarios.length - visible.length;

  return (
    <GlassCard
      interactive
      glow={insight.sentiment === 'bearish' ? 'bear' : insight.sentiment === 'bullish' ? 'bull' : 'cyber'}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone={sentiment.tone} className="max-w-full">
          <SentimentIcon className="size-3 shrink-0" />
          {t(`insights.sentiment.${insight.sentiment}`)}
        </Badge>
        <Badge tone={POSTURE_TONE[insight.posture]} className="max-w-full">
          <span className="min-w-0 truncate">{t(`insights.posture.${insight.posture}`)}</span>
        </Badge>
        <Badge tone="neutral" className="max-w-full">
          <span className="min-w-0 truncate">
            {t('insights.volatilityTag', { level: t(`volatility.${insight.volatility}`) })}
          </span>
        </Badge>
        <span className="tnum ml-auto shrink-0 font-mono text-[11px] whitespace-nowrap text-white/30">
          {insight.source} · {timeAgo(insight.publishedAt)}
        </span>
      </div>

      <a
        href={insight.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group/link mt-3 flex items-start gap-2"
      >
        <h3 className="line-clamp-3 min-w-0 text-[15px] leading-snug font-semibold text-balance text-white transition-colors duration-200 group-hover/link:text-accent-soft">
          {insight.headline}
        </h3>
        <ExternalLink className="mt-1 size-3.5 shrink-0 text-white/20 transition-colors duration-200 group-hover/link:text-accent-soft" />
      </a>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-accent/15 bg-accent/6 px-3 py-2.5">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-soft" />
        <p className="min-w-0 text-[12.5px] leading-relaxed text-white/75">{text(insight.thesis)}</p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[10px] tracking-[0.16em] text-white/35 uppercase">{t('insights.riskScenarios')}</p>
        <AnimatePresence initial={false}>
          {visible.map((scenario) => (
            <m.div
              key={scenario.trigger.key ?? scenario.trigger.text}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="relative rounded-xl border border-white/6 bg-black/25 p-3 pl-4 transition-colors duration-200 hover:border-white/12">
                <span
                  aria-hidden
                  className={cn('absolute inset-y-2 left-0 w-0.5 rounded-full', SEVERITY_BAR[scenario.severity])}
                />
                <p className="text-[12px] font-medium text-balance text-white/85">{text(scenario.trigger)}</p>
                <div className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-white/55">
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-accent-soft" />
                  <p className="min-w-0">{text(scenario.response)}</p>
                </div>
              </div>
            </m.div>
          ))}
        </AnimatePresence>

        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-white/40 transition-colors duration-200 hover:bg-white/4 hover:text-white/70"
          >
            <span className="min-w-0 truncate">
              {expanded ? t('common.showLess') : t('insights.more', { count: hidden })}
            </span>
            <ChevronDown className={cn('size-3 transition-transform duration-300', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-2.5 pt-2">
              <p className="text-[10px] tracking-[0.16em] text-white/35 uppercase">{t('insights.riskControls')}</p>
              <ul className="space-y-1.5">
                {insight.riskControls.map((control) => (
                  <li
                    key={control.key ?? control.text}
                    className="flex gap-2 text-[12px] leading-relaxed text-white/60"
                  >
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-bull/70" />
                    <span className="min-w-0">{text(control)}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg border border-white/6 bg-white/2 px-3 py-2 text-[11.5px] leading-relaxed text-white/45">
                <span className="text-white/60">{t('insights.invalidation')} — </span>
                {text(insight.invalidation)}
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex items-center gap-3 border-t border-white/6 pt-3">
        <Meter value={insight.confidence} tone="accent" className="min-w-0 flex-1" />
        <span className="tnum shrink-0 font-mono text-[11px] whitespace-nowrap text-white/40">
          {t('insights.conviction', { value: String(insight.confidence) })}
        </span>
        <Badge tone="accent" className="hidden shrink-0 sm:inline-flex">
          {t(`insights.provider.${insight.generatedBy}`)}
        </Badge>
      </div>
    </GlassCard>
  );
}
