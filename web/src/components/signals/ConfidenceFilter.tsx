import { useTranslation } from 'react-i18next';
import { InfoTip } from '@/components/ui/InfoTip';
import { BUCKET_IDS, BUCKET_LABEL, recordByBucket, type Bucket } from '@/lib/confidence';
import { cn } from '@/lib/cn';
import type { JournalTrade } from '@/types/domain';

/**
 * Filter the board by confluence bracket, and show what each bracket has been
 * worth.
 *
 * The filter alone would be a preference. What makes it a tool is the row of
 * figures under it: every bracket's settled win rate side by side, so the
 * question "does the engine's own score predict anything" can be answered by
 * looking rather than by clicking through four states and remembering.
 *
 * Every rate carries its sample size. A bracket holding nine settled trades can
 * read 67% and mean nothing, and a percentage printed without its denominator
 * invites exactly that reading — which matters more here than anywhere else in
 * the app, because this is the number a recalibration would be based on.
 */
export function ConfidenceFilter({
  value,
  onChange,
  counts,
  trades,
  className,
}: {
  value: Bucket | null;
  onChange: (next: Bucket | null) => void;
  /** Signals on the board per bracket, before filtering. */
  counts: Record<Bucket, number>;
  /** Settled trades, for the rates. Empty until the history request lands. */
  trades: JournalTrade[];
  className?: string;
}) {
  const { t } = useTranslation();
  const rows = recordByBucket(trades);
  const settled = rows.some((row) => row.rate !== null);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/*
          The label and its tip sit outside the group. The tip is a button, and
          inside a `role="group"` of filter chips it reads to a screen reader as
          an option that does nothing.
        */}
        <span className="flex items-center gap-1 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          {t('signals.confidence')}
          <InfoTip label={t('signals.confidenceLabel')} align="start">
            {t('glossary.confidenceBands')}
          </InfoTip>
        </span>

        <div
          role="group"
          aria-label={t('signals.confidenceLabel')}
          className="flex flex-wrap items-center gap-1"
        >
          <Chip active={value === null} onClick={() => onChange(null)} label={t('common.all')} />
          {BUCKET_IDS.map((bucket) => (
            <Chip
              key={bucket}
              active={value === bucket}
              onClick={() => onChange(value === bucket ? null : bucket)}
              label={BUCKET_LABEL[bucket]}
              count={counts[bucket]}
            />
          ))}
        </div>
      </div>

      {/*
        The map. Four brackets, each with its rate, its denominator and its R.
        Hidden until something has settled anywhere — four columns of dashes is
        a table saying nothing, and it takes the room the board needs.
      */}
      {settled && (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row) => {
            const decided = row.wins + row.losses;
            const active = value === row.bucket;
            return (
              <button
                key={row.bucket}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : row.bucket)}
                className={cn(
                  'flex min-w-0 flex-1 basis-28 flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
                  active
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-white/8 bg-white/2 hover:border-white/16 hover:bg-white/4',
                )}
              >
                <span className="tnum font-mono text-[10px] text-white/35">{BUCKET_LABEL[row.bucket]}</span>

                <span className="flex w-full items-baseline justify-between gap-1.5">
                  {/*
                    A rate over fewer than ten settled trades is greyed rather
                    than coloured. The colour says "this bracket wins"; on six
                    trades nothing says that yet, and a green 67% beside a red
                    29% invites a decision the sample cannot support.
                  */}
                  <span
                    className={cn(
                      'tnum font-mono text-[13px] font-semibold',
                      row.rate === null
                        ? 'text-white/25'
                        : decided < 10
                          ? 'text-white/70'
                          : row.rate >= 50
                            ? 'text-bull'
                            : row.rate >= 35
                              ? 'text-white'
                              : 'text-bear',
                    )}
                  >
                    {row.rate === null ? '—' : `${row.rate}%`}
                  </span>
                  <span className="tnum font-mono text-[10px] whitespace-nowrap text-white/30">
                    {row.wins}/{decided}
                  </span>
                </span>

                <span
                  className={cn(
                    'tnum font-mono text-[10px]',
                    row.r >= 0 ? 'text-bull/70' : 'text-bear/70',
                  )}
                >
                  {row.r >= 0 ? '+' : ''}
                  {row.r.toFixed(1)}R
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
        active ? 'bg-white/12 text-white' : 'text-white/40 hover:bg-white/6 hover:text-white/75',
      )}
    >
      <span className="tnum font-mono">{label}</span>
      {count !== undefined && (
        <span className={cn('tnum font-mono', active ? 'text-white/50' : 'text-white/25')}>{count}</span>
      )}
    </button>
  );
}
