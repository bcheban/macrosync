import { cn } from '@/lib/cn';

interface RadarDialProps {
  /** 0–100 expected impact — drives the ring colour and the blip count. */
  impact: number;
  /** 0–1 progress toward the event (1 = imminent). */
  proximity: number;
  imminent?: boolean;
  /** Localized caption under the impact number. */
  label: string;
  className?: string;
}

/**
 * The radar: concentric rings, a rotating sweep and a progress arc that fills
 * as the event approaches. Pure CSS/SVG — no chart library.
 */
export function RadarDial({ impact, proximity, imminent = false, label, className }: RadarDialProps) {
  const accent = imminent ? 'var(--color-bear)' : impact >= 80 ? 'var(--color-warn)' : 'var(--color-cyber)';
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.max(0, Math.min(1, proximity));

  return (
    <div className={cn('relative size-36 shrink-0 sm:size-40', className)}>
      {/* rotating sweep */}
      <div
        aria-hidden
        className="animate-radar absolute inset-0 rounded-full opacity-70"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, transparent 300deg, ${accent}22 340deg, ${accent}88 360deg)`,
          maskImage: 'radial-gradient(circle, transparent 34%, #000 36%, #000 98%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 34%, #000 36%, #000 98%, transparent 100%)',
        }}
      />

      <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2" />
        <circle cx="64" cy="64" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle cx="64" cy="64" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 8px ${accent})`, transition: 'stroke-dasharray 0.9s ease-out' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('tnum font-mono text-2xl font-bold', imminent && 'animate-breathe')}
          style={{ color: accent, textShadow: `0 0 20px ${accent}66` }}
        >
          {impact}
        </span>
        <span className="mt-0.5 text-[9px] tracking-[0.18em] text-white/40 uppercase">{label}</span>
      </div>
    </div>
  );
}
