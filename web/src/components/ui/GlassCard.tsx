import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  /** Adds a coloured aura behind the card on hover. */
  glow?: 'accent' | 'bull' | 'bear' | 'cyber' | 'none';
  interactive?: boolean;
}

const GLOW: Record<string, string> = {
  accent: 'from-accent/25',
  bull: 'from-bull/20',
  bear: 'from-bear/20',
  cyber: 'from-cyber/20',
  none: 'from-transparent',
};

/**
 * The single surface primitive of the app: frosted glass, a luminous top edge
 * and an optional coloured aura that blooms on hover.
 */
export function GlassCard({
  children,
  className,
  glow = 'none',
  interactive = false,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'group glass edge-light relative overflow-hidden rounded-card',
        interactive && 'transition-colors duration-300 hover:border-white/15',
        className,
      )}
      {...props}
    >
      {glow !== 'none' && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-px bg-linear-to-br to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100',
            GLOW[glow],
          )}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
