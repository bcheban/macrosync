import { m } from 'framer-motion';
import { AlertTriangle, BarChart3, Bitcoin, CalendarOff, Landmark, Megaphone, Radar } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { InfoTip } from '@/components/ui/InfoTip';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCountdown } from '@/hooks/useCountdown';
import { useTx } from '@/i18n/useTx';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import type { EventCategory, MacroEvent } from '@/types/domain';
import { CountdownUnit } from './CountdownUnit';
import { RadarDial } from './RadarDial';

const CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  monetary: Landmark,
  macro: BarChart3,
  political: Megaphone,
  crypto: Bitcoin,
};

/** 72h is the window over which the radar arc fills. */
const WINDOW_MS = 72 * 60 * 60 * 1000;

/*
 * The hero is the first block on the page, so any height difference between its
 * loading and loaded states moves everything below it — worth 0.51 of
 * cumulative layout shift on desktop, because what it pushes is nearly the
 * whole page.
 *
 * The reservation goes on the flex ROW rather than the card: the row is
 * `items-center`, so a row whose height changes re-centres the dial and the
 * ambient wash, and those move even when the card around them does not. Fixing
 * the row height makes the centring constant and the card follows.
 *
 * Values are the measured content heights at each breakpoint (mobile / tablet /
 * desktop) — re-measure if the hero gains or loses a row.
 */
const HERO_ROW_HEIGHT = 'min-h-[571px] sm:min-h-[542px] lg:min-h-[364px]';

export function CountdownRadar({ event, loading }: { event?: MacroEvent; loading: boolean }) {
  const { t, eventTitle } = useTx();
  const countdown = useCountdown(event?.startsAt);

  /*
   * The placeholder mirrors the real hero row for row — dial, badge strip,
   * two-line title, three-line detail, the countdown tiles and the forecast
   * chips. A generic block here was ~90px shorter than the content that
   * replaced it, and because the hero sits above everything else that gap
   * moved the entire page on load.
   */
  if (!loading && !event) {
    return (
      <GlassCard className="relative p-4 sm:p-6 lg:p-8">
        <div
          className={cn(
            'flex min-w-0 flex-col items-center justify-center gap-2 text-center',
            HERO_ROW_HEIGHT,
          )}
        >
          <CalendarOff className="size-7 text-white/20" />
          <p className="text-base font-semibold text-white/80">{t('countdown.noEvent')}</p>
          <p className="max-w-md text-[13px] leading-relaxed text-white/40">{t('countdown.noEventHint')}</p>
        </div>
      </GlassCard>
    );
  }

  if (loading || !event) {
    return (
      <GlassCard className="relative p-4 sm:p-6 lg:p-8">
        {/*
          The same decorative wash the loaded hero renders. Present in only one
          of the two states it counted as an appearing element, and because it
          is 384px across that alone was 0.26 of layout shift.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-accent/12 blur-3xl"
        />

        <div
          className={cn(
            'relative flex min-w-0 flex-col gap-6 sm:gap-7 lg:flex-row lg:items-center lg:gap-10',
            HERO_ROW_HEIGHT,
          )}
        >
          <Skeleton className="size-36 shrink-0 rounded-full sm:size-40" />

          <div className="min-w-0 flex-1">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-40 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="hidden h-6 w-32 rounded-full sm:block" />
            </div>

            <Skeleton className="mt-3.5 h-[50px] w-3/4 sm:h-[60px] lg:h-[70px]" />
            <Skeleton className="mt-1.5 h-[59px] w-full max-w-2xl sm:h-[63px]" />

            <div className="mt-6 grid grid-cols-4 items-end gap-2 sm:flex sm:gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex flex-col items-center gap-1.5">
                  <Skeleton className="h-16 w-full rounded-2xl sm:h-20 sm:w-[4.5rem]" />
                  <Skeleton className="h-2.5 w-8" />
                </div>
              ))}
            </div>

            <div className="mt-4 h-4 sm:hidden" />

            <div className="mt-5 flex gap-2.5">
              <Skeleton className="h-8 w-40 rounded-xl" />
              <Skeleton className="h-8 w-44 rounded-xl" />
            </div>
          </div>
        </div>
      </GlassCard>
    );
  }

  const Icon = CATEGORY_ICON[event.category];
  const imminent = countdown.totalMinutes < 60 && !countdown.expired;
  const soon = countdown.totalMinutes < 8 * 60;
  const proximity = 1 - Math.min(1, countdown.totalMs / WINDOW_MS);

  return (
    <GlassCard
      glow={imminent ? 'bear' : 'accent'}
      className={cn('relative p-4 sm:p-6 lg:p-8', imminent && 'border-bear/25')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Ambient wash behind the hero */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-32 -right-24 size-96 rounded-full blur-3xl',
          imminent ? 'bg-bear/12' : 'bg-accent/12',
        )}
      />

      <div
        className={cn(
          'relative flex min-w-0 flex-col gap-6 sm:gap-7 lg:flex-row lg:items-center lg:gap-10',
          HERO_ROW_HEIGHT,
        )}
      >
        <RadarDial
          impact={event.expectedImpact}
          proximity={proximity}
          imminent={imminent}
          label={t('countdown.impact')}
        />

        <div className="min-w-0 flex-1">
          {/*
            One scrolling row on phones instead of a wrapping block: the badge
            set wraps to three rows in Ukrainian and two in English, which would
            move everything below it on a language switch.
          */}
          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Badge tone={imminent ? 'bear' : 'accent'} size="md" className="shrink-0">
              <Radar className="size-3" />
              {t('countdown.badge')}
              <InfoTip label={t('glossary.impactLabel')} align="start" className="text-current/60">
                {t('glossary.impact')}
              </InfoTip>
            </Badge>
            <Badge tone="neutral" size="md" className="shrink-0">
              <Icon className="size-3" />
              {t(`countdown.categories.${event.category}`)}
            </Badge>
            <Badge tone={event.importance === 'high' ? 'warn' : 'neutral'} size="md" className="shrink-0">
              {t('countdown.importance', {
                level: t(`importance.${event.importance}`),
                region: event.region,
              })}
            </Badge>
            {soon && (
              <Badge tone="bear" size="md" className="shrink-0">
                <LiveDot tone="bear" />
                {t('countdown.riskWindow')}
              </Badge>
            )}
          </div>

          {/*
            `lh` units reserve exact line boxes at every breakpoint, so a title
            that needs two lines in Ukrainian and one in English occupies the
            same height either way. Browsers without `lh` simply fall back to
            content height.
          */}
          <h1 className="mt-3.5 line-clamp-2 min-h-[2lh] text-xl leading-tight font-semibold tracking-tight text-balance text-white sm:text-2xl lg:text-[1.75rem]">
            {eventTitle(event)}
          </h1>
          {/*
            The calendar feed publishes a name, a currency and an impact rating
            — no prose. Rather than invent a description, this states what the
            feed actually said. Height stays reserved so nothing below the hero
            moves when the language or the event changes.
          */}
          <p className="mt-1.5 line-clamp-3 min-h-[3lh] max-w-2xl text-[13px] leading-normal text-balance text-white/50 sm:text-sm">
            {t('countdown.summary', {
              currency: event.currency,
              region: event.region,
              level: t(`importance.${event.importance}`),
            })}
          </p>

          {/*
            A 4-column grid on phones so the units always divide the available
            width exactly — a flex row of fixed-width tiles overflows below
            360px. From `sm` it relaxes into the original row with separators.
          */}
          <div className="mt-6 grid grid-cols-4 items-end gap-2 sm:flex sm:flex-wrap sm:gap-4">
            <CountdownUnit value={countdown.days} label={t('countdown.days')} tone={imminent ? 'alert' : 'default'} />
            <span className="hidden pb-8 font-mono text-2xl text-white/20 sm:inline">:</span>
            <CountdownUnit value={countdown.hours} label={t('countdown.hours')} tone={imminent ? 'alert' : 'default'} />
            <span className="hidden pb-8 font-mono text-2xl text-white/20 sm:inline">:</span>
            <CountdownUnit
              value={countdown.minutes}
              label={t('countdown.minutes')}
              tone={imminent ? 'alert' : 'default'}
            />
            <span className="hidden pb-8 font-mono text-2xl text-white/20 sm:inline">:</span>
            <CountdownUnit
              value={countdown.seconds}
              label={t('countdown.seconds')}
              tone={imminent ? 'alert' : 'default'}
            />

            <div className="ml-auto hidden min-w-0 flex-col items-end gap-1 pb-2 sm:flex">
              <span className="tnum font-mono text-xs whitespace-nowrap text-white/45">
                {formatClock(event.startsAt)}
              </span>
              <span className="max-w-[22ch] truncate text-[11px] text-white/30">
                {t('countdown.scheduleSource')}
              </span>
            </div>
          </div>

          {/*
            The same detail on one non-wrapping line — the affected-asset list is
            longer in Ukrainian and would otherwise take a second line, changing
            the card's height with the language.
          */}
          <div className="mt-4 flex items-center gap-x-3 text-[11px] sm:hidden">
            <span className="tnum shrink-0 font-mono whitespace-nowrap text-white/45">
              {formatClock(event.startsAt)}
            </span>
            <span className="min-w-0 truncate text-white/30">{t('countdown.scheduleSource')}</span>
          </div>

          {(event.forecast || event.previous) && (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {event.forecast && (
                <div className="glass-soft rounded-xl px-3 py-1.5">
                  <span className="text-[10px] tracking-wider text-white/35 uppercase">
                    {t('countdown.forecast')}
                  </span>
                  <span className="tnum ml-2 font-mono text-sm text-cyber">{event.forecast}</span>
                </div>
              )}
              {event.previous && (
                <div className="glass-soft rounded-xl px-3 py-1.5">
                  <span className="text-[10px] tracking-wider text-white/35 uppercase">
                    {t('countdown.previous')}
                  </span>
                  <span className="tnum ml-2 font-mono text-sm text-white/70">{event.previous}</span>
                </div>
              )}
            </div>
          )}

          {soon && (
            <m.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-warn/20 bg-warn/6 px-3.5 py-2.5"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <p className="text-[11.5px] leading-relaxed text-white/70 sm:text-xs">{t('countdown.warning')}</p>
            </m.div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
