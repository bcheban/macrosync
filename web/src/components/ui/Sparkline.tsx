import { useId } from 'react';
import { cn } from '@/lib/cn';

interface SparklineProps {
  data: number[];
  bullish?: boolean;
  className?: string;
  width?: number;
  height?: number;
}

/** Dependency-free SVG sparkline with a gradient fill under the curve. */
export function Sparkline({ data, bullish = true, className, width = 120, height = 36 }: SparklineProps) {
  const id = useId();
  if (data.length < 2) return <div className={cn('h-9', className)} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke = bullish ? 'var(--color-bull)' : 'var(--color-bear)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-9 w-full overflow-visible', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={`url(#fill-${id})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 6px ${stroke}55)` }}
      />
    </svg>
  );
}
