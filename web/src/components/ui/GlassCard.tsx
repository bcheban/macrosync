import { m, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  /** Adds a coloured aura behind the card on hover. */
  glow?: 'accent' | 'bull' | 'bear' | 'cyber' | 'none';
  interactive?: boolean;
  /**
   * Lays the children out in a column that fills the card, so one of them can
   * claim the bottom edge with `mt-auto`.
   *
   * Opt-in because it has to reach the wrapper below, which no caller can style
   * from outside — and that wrapper is the whole reason a grid of these cards
   * does not bottom-align on its own. `align-items: stretch` already makes the
   * boxes in a row equal height; it is this div, sized to its content inside a
   * stretched box, that leaves a short card's last element floating.
   */
  fill?: boolean;
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
  fill = false,
  ...props
}: GlassCardProps) {
  return (
    <m.div
      className={cn(
        'group glass edge-light relative overflow-hidden rounded-card',
        /*
         * A full-height column.
         *
         * `height: 100%` resolves against the grid area, which is the row's
         * height — so this is what makes a short card as tall as its tallest
         * neighbour. It only works while the grid is stretching: an
         * `items-start` on the container cancels it, and the two have been
         * swapped back and forth here, so they are worth reading together.
         */
        fill && 'flex h-full flex-col',
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
      <div className={cn('relative', fill && 'flex flex-1 flex-col')}>{children}</div>
    </m.div>
  );
}
