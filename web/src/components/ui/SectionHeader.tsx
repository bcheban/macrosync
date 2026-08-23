import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ icon: Icon, title, subtitle, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="glass-soft flex size-9 shrink-0 items-center justify-center rounded-xl text-accent-soft">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] leading-tight font-semibold tracking-tight text-balance text-white">
            {title}
          </h2>
          {/*
            Clamped to two lines: the Ukrainian subtitles run longer, and an
            unbounded third line would shift everything below the header when
            the language changes.
          */}
          {subtitle && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-white/45 sm:text-xs">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
