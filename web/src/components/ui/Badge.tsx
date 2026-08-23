import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'bull' | 'bear' | 'neutral' | 'accent' | 'cyber' | 'warn';

const TONES: Record<Tone, string> = {
  bull: 'text-bull border-bull/30 bg-bull/10 shadow-[0_0_18px_-6px] shadow-bull/60',
  bear: 'text-bear border-bear/30 bg-bear/10 shadow-[0_0_18px_-6px] shadow-bear/60',
  neutral: 'text-white/60 border-white/12 bg-white/5',
  accent: 'text-accent-soft border-accent/30 bg-accent/10 shadow-[0_0_18px_-6px] shadow-accent/60',
  cyber: 'text-cyber border-cyber/30 bg-cyber/10 shadow-[0_0_18px_-6px] shadow-cyber/60',
  warn: 'text-warn border-warn/30 bg-warn/10 shadow-[0_0_18px_-6px] shadow-warn/60',
};

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  size?: 'sm' | 'md';
}

export function Badge({ children, tone = 'neutral', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Pulsing dot used for live signals and the connection state. */
export function LiveDot({ tone = 'bull', className }: { tone?: Tone; className?: string }) {
  const color =
    tone === 'bear' ? 'text-bear' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-bull';
  return (
    <span className={cn('relative flex size-2', color, className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}
