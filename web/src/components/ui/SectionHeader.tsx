import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Plain-language explanation of what this panel is, shown on an info icon. */
  tip?: ReactNode;
  tipLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  tip,
  tipLabel,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      {/*
        `min-w-40` rather than `min-w-0`: when the title cannot have at least
        that much room the actions wrap to their own line instead of squeezing
        a two-word heading into three lines. Long headings on a phone were
        being crushed against the badges.
      */}
      <div className="flex min-w-40 flex-1 items-center gap-3">
        <span className="glass-soft flex size-9 shrink-0 items-center justify-center rounded-xl text-accent-soft">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] leading-tight font-semibold tracking-tight text-balance text-white">
            {title}
            {tip && <InfoTip label={tipLabel ?? title} align="start">{tip}</InfoTip>}
          </h2>
          {/*
            Clamped to two lines: the Ukrainian subtitles run longer, and an
            unbounded third line would shift everything below the header when
            the language changes.
          */}
          {subtitle && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-white/55 sm:text-xs">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
