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
