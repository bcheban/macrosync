import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { Tone } from './Badge';

const BAR: Record<Tone, string> = {
  bull: 'from-bull/60 to-bull',
  bear: 'from-bear/60 to-bear',
  neutral: 'from-white/30 to-white/60',
  accent: 'from-accent/60 to-accent-soft',
  cyber: 'from-cyber/60 to-cyber',
  warn: 'from-warn/60 to-warn',
};

interface MeterProps {
  /** 0–100. */
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
  showValue?: boolean;
}

/** Thin animated progress bar used for confidence, impact and volatility. */
export function Meter({ value, tone = 'accent', className, label, showValue }: MeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between text-[11px] tracking-wide text-white/45 uppercase">
          {label && <span>{label}</span>}
          {showValue && <span className="tnum font-mono text-white/70">{Math.round(pct)}</span>}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={cn('h-full rounded-full bg-linear-to-r', BAR[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>
    </div>
  );
}
