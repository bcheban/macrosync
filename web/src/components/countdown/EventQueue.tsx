import { m } from 'framer-motion';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { useTx } from '@/i18n/useTx';
import { GlassCard } from '@/components/ui/GlassCard';
import { InfoTip } from '@/components/ui/InfoTip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatClock, formatDistance } from '@/lib/format';
import type { MacroEvent } from '@/types/domain';

/**
 * Two tiers a trader acts on, and one they do not.
 *
 * The feed's own rating drives this. "High" is a print that reprices the
 * dollar; "moderate" is worth knowing about; everything below is regional
 * survey noise and stays hidden unless asked for.
 */
const TIER = {
  high: { rail: 'bg-bear', chip: 'border-bear/30 bg-bear/12 text-bear', dot: 'bg-bear' },
  medium: { rail: 'bg-warn', chip: 'border-warn/30 bg-warn/12 text-warn', dot: 'bg-warn' },
  low: { rail: 'bg-white/20', chip: 'border-white/12 bg-white/5 text-white/50', dot: 'bg-white/30' },
} as const;

interface EventQueueProps {
  events: MacroEvent[];
  loading: boolean;
  /** How many upcoming prints exist per tier, before filtering. */
  counts?: { high: number; medium: number; low: number };
  showLow: boolean;
  onToggleLow: (next: boolean) => void;
}

export function EventQueue({ events, loading, counts, showLow, onToggleLow }: EventQueueProps) {
  const { t, eventTitle } = useTx();

  // Grouped so the eye lands on what matters before it reads a single date.
  const groups = useMemo(() => {
    const order: MacroEvent['importance'][] = showLow ? ['high', 'medium', 'low'] : ['high', 'medium'];
    return order
      .map((tier) => ({ tier, items: events.filter((event) => event.importance === tier) }))
      .filter((group) => group.items.length);
  }, [events, showLow]);

  const hiddenLow = counts?.low ?? 0;

  return (
    <GlassCard className="p-4 sm:p-5">
      <SectionHeader
        icon={CalendarClock}
        title={t('eventQueue.title')}
        subtitle={t('eventQueue.subtitle')}
        actions={
          <InfoTip label={t('eventQueue.tipLabel')} align="end">
            {t('eventQueue.tip')}
          </InfoTip>
        }
      />

      <div className="mt-4 space-y-3">
        {loading && !events.length ? (
          // The queue is requested with limit=6; reserve exactly that.
          Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
        ) : !groups.length ? (
          <p className="rounded-xl border border-white/8 bg-white/2 px-3 py-6 text-center text-[12px] leading-relaxed text-white/45">
            {t('eventQueue.empty')}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.tier} className="space-y-2">
              <h3 className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-white/35 uppercase">
                <span className={cn('size-1.5 rounded-full', TIER[group.tier].dot)} />
                {t(`eventQueue.tier.${group.tier}`)}
                <span className="tnum font-mono text-white/25">{group.items.length}</span>
              </h3>

              {group.items.map((event, index) => (
                <m.div
                  key={`${event.id}-${event.startsAt}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.35 }}
                  className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/2 p-3 transition-all duration-200 hover:border-white/14 hover:bg-white/6"
                >
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 w-0.5 transition-all duration-300 group-hover:w-1',
                      TIER[event.importance].rail,
                    )}
                  />
                  <div className="flex items-start justify-between gap-2.5 pl-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] leading-snug font-medium text-white/90">
                        {eventTitle(event)}
                      </p>
                      <p className="tnum mt-1 truncate font-mono text-[11px] text-white/35">
                        {formatClock(event.startsAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="tnum font-mono text-sm font-semibold whitespace-nowrap text-white/85">
                        {formatDistance(event.startsAt)}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
                          TIER[event.importance].chip,
                        )}
                      >
                        {event.currency}
                      </span>
                    </div>
                  </div>
                </m.div>
              ))}
            </section>
          ))
        )}
      </div>

      {/* The hidden noise is disclosed rather than silently dropped. */}
      {!loading && hiddenLow > 0 && (
        <button
          type="button"
          onClick={() => {
            trackEvent('calendar_toggle_low', { show: !showLow });
            onToggleLow(!showLow);
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/6 py-2 text-[11px] text-white/40 transition-colors duration-200 hover:border-white/12 hover:bg-white/4 hover:text-white/75"
        >
          {showLow ? t('eventQueue.hideLow') : t('eventQueue.showLow', { count: hiddenLow })}
          <ChevronDown className={cn('size-3 transition-transform duration-300', showLow && 'rotate-180')} />
        </button>
      )}
    </GlassCard>
  );
}
