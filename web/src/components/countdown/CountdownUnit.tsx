import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { pad2 } from '@/lib/format';

interface CountdownUnitProps {
  value: number;
  label: string;
  tone?: 'default' | 'alert';
}

/**
 * One DD/HH/MM/SS tile. The digit block slides up on every change, which is
 * what makes the timer feel alive rather than merely numeric.
 */
export function CountdownUnit({ value, label, tone = 'default' }: CountdownUnitProps) {
  const text = pad2(value);

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      {/*
        Fluid inside the mobile 4-column grid, fixed from `sm` where the units
        sit in a flex row. `min-w-0` lets the grid track shrink below the tile's
        intrinsic width on very narrow screens instead of overflowing.
      */}
      <div
        className={cn(
          'glass-soft relative flex h-16 w-full min-w-0 items-center justify-center overflow-hidden rounded-2xl sm:h-20 sm:w-[4.5rem]',
          tone === 'alert' && 'border-bear/25 bg-bear/8',
        )}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px bg-white/8"
        />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={text}
            initial={{ y: '55%', opacity: 0, filter: 'blur(4px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: '-55%', opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'tnum font-mono text-[1.75rem] font-bold sm:text-[2.4rem]',
              tone === 'alert' ? 'text-bear' : 'text-white',
            )}
            style={{
              textShadow:
                tone === 'alert' ? '0 0 26px rgba(255,59,92,0.55)' : '0 0 26px rgba(124,92,255,0.35)',
            }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="max-w-full truncate text-[9px] tracking-[0.16em] text-white/35 uppercase sm:text-[10px] sm:tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}
