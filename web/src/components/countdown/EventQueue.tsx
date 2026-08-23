import { m } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { useTx } from '@/i18n/useTx';
import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatClock, formatDistance } from '@/lib/format';
import type { MacroEvent } from '@/types/domain';

const IMPORTANCE_TONE = { high: 'bear', medium: 'warn', low: 'neutral' } as const;

export function EventQueue({ events, loading }: { events: MacroEvent[]; loading: boolean }) {
  const { t, eventTitle } = useTx();

  return (
    <GlassCard className="p-4 sm:p-5">
      <SectionHeader icon={CalendarClock} title={t('eventQueue.title')} subtitle={t('eventQueue.subtitle')} />

      <div className="mt-4 space-y-2">
        {loading && !events.length
          ? // The queue is requested with limit=6; reserve exactly that.
            Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
          : events.map((event, index) => (
              <m.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.35 }}
                className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/2 p-3 transition-all duration-200 hover:border-white/12 hover:bg-white/5"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-0.5 transition-all duration-300 group-hover:w-1',
                    event.importance === 'high'
                      ? 'bg-bear'
                      : event.importance === 'medium'
                        ? 'bg-warn'
                        : 'bg-white/20',
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
                    <Badge tone={IMPORTANCE_TONE[event.importance]}>{event.region}</Badge>
                  </div>
                </div>
              </m.div>
            ))}
      </div>
    </GlassCard>
  );
}
