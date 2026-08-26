import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

/**
 * A placeholder shaped like a real {@link SignalCard}.
 *
 * A generic skeleton is roughly half the height of the card it stands in for,
 * so the grid grew the moment data landed and pushed everything below it down.
 * Mirroring the card's anatomy — header, meter, the three price levels, the
 * indicator strip and three rationale lines — keeps the height stable through
 * the swap, which is what takes cumulative layout shift to zero.
 */
export function SignalCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass rounded-card p-4 sm:p-5', className)}>
      {/* header: base + badges, then the price */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-9 rounded-full" />
          </div>
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-7 w-24 rounded-xl" />
      </div>

      {/* confluence meter */}
      <div className="mt-4 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      {/* entry / stop / target */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-white/6 bg-black/20 p-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>

      {/* indicator strip — wraps to two rows in a real card at this width */}
      <div className="mt-3 space-y-1.5">
        <div className="flex gap-3.5">
          {['w-12', 'w-14', 'w-12'].map((width, index) => (
            <Skeleton key={index} className={`h-3 ${width}`} />
          ))}
        </div>
        <div className="flex gap-3.5">
          {['w-14', 'w-12'].map((width, index) => (
            <Skeleton key={index} className={`h-3 ${width}`} />
          ))}
        </div>
      </div>

      {/* rationale — three entries, each of which may wrap to a second line */}
      <div className="mt-3.5 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
