import { cn } from '@/lib/cn';

/** Shimmering placeholder used while the first payload is in flight. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-shimmer rounded-lg bg-white/6', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.02) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-14" />
      </div>
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-1.5 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

/**
 * A placeholder shaped like one open trade.
 *
 * Built to the card's own measurements rather than to a round number: the
 * ticker line, the side chip, the move and age on the right, then the three
 * price columns. A plain box of roughly the right height still shifts the page
 * when the payload lands, which is the one thing a placeholder exists to
 * prevent.
 */
export function TradeCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/8 bg-white/3 p-2.5">
      {/* The direction hairline the real card carries, drawn neutral. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-white/10" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3 w-11 rounded" />
        </div>
        <div className="shrink-0 space-y-1.5 text-right">
          <Skeleton className="ml-auto h-3.5 w-14" />
          <Skeleton className="ml-auto h-2.5 w-10" />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-w-0 space-y-1">
            <Skeleton className="h-2 w-8" />
            <Skeleton className="h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The open-trades board before the first payload.
 *
 * Mirrors the real thing down to the grid breakpoints and the gap, because the
 * two are read in sequence by the same pair of eyes: a placeholder on a
 * different column count reflows the moment it is replaced, and the reflow is
 * more distracting than the wait it was covering.
 *
 * Two sections, not three. Scalping is switched off, so a third heading would
 * promise a group that never arrives — and on a cold start the promise is on
 * screen for exactly as long as the reader has nothing else to look at.
 */
export function TradesBoardSkeleton({ sections = 2, perSection = 4 }: { sections?: number; perSection?: number }) {
  return (
    <div className="mt-4 space-y-5" aria-hidden>
      {Array.from({ length: sections }).map((_, section) => (
        <div key={section} className="space-y-2">
          <header className="flex items-center gap-2">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-4" />
          </header>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: perSection }).map((_, card) => (
              <TradeCardSkeleton key={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
