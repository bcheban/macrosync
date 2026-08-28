import { useTranslation } from 'react-i18next';
import { InfoTip } from '@/components/ui/InfoTip';
import { BAND_RANGE, BANDS, recordForBand, type Band } from '@/lib/confidence';
import { cn } from '@/lib/cn';
import type { JournalTrade } from '@/types/domain';

/**
 * Filter the board by how strongly the engine agreed with itself — and say
 * what that has been worth.
 *
 * The filter alone would be a preference. What makes it a tool is the figure
 * beside it: the win rate of settled trades *at that band*, which is the only
 * way to find out whether the engine's own confidence predicts anything. A
 * headline rate over every call it ever made cannot answer that, because it
 * averages the setups worth taking together with the ones that merely cleared
 * the bar.
 *
 * The count is always shown next to the rate. A band holding nine settled
 * trades can read 67% and mean nothing, and a percentage printed without its
 * denominator invites exactly that reading.
 */
export function ConfidenceFilter({
  value,
  onChange,
  counts,
  trades,
  className,
}: {
  value: Band | null;
  onChange: (next: Band | null) => void;
  /** How many signals are on the board at each band, before filtering. */
  counts: Record<Band, number>;
  /** Settled trades, for the rate. Empty until the history request lands. */
  trades: JournalTrade[];
  className?: string;
}) {
  const { t } = useTranslation();
  const selected = recordForBand(trades, value);

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <div role="group" aria-label={t('signals.confidenceLabel')} className="flex flex-wrap items-center gap-1">
        <span className="mr-1 flex items-center gap-1 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          {t('signals.confidence')}
          <InfoTip label={t('signals.confidenceLabel')} align="start">
            {t('glossary.confidenceBands')}
          </InfoTip>
        </span>

        <Chip active={value === null} onClick={() => onChange(null)} label={t('common.all')} />
        {BANDS.map((band) => (
          <Chip
            key={band}
            active={value === band}
            onClick={() => onChange(value === band ? null : band)}
            label={t(`signals.bands.${band}`)}
            hint={BAND_RANGE[band]}
            count={counts[band]}
          />
        ))}
      </div>

      {/*
        The record at whatever is selected, recomputed as the selection moves.
        Hidden entirely until something has settled at that band — a rate is a
        claim, and there is nothing to claim from an empty sample.
      */}
      {selected.rate !== null && (
        <span className="flex items-baseline gap-1.5 rounded-lg border border-white/10 bg-white/3 px-2 py-1">
          <span className="text-[10px] text-white/35">{t('signals.winRateAt')}</span>
          <span
            className={cn(
              'tnum font-mono text-[12px] font-semibold',
              selected.rate >= 50 ? 'text-bull' : selected.rate >= 35 ? 'text-white' : 'text-bear',
            )}
          >
            {selected.rate}%
          </span>
          <span className="tnum font-mono text-[10px] text-white/30">
            {selected.wins}/{selected.wins + selected.losses}
          </span>
          <span
            className={cn('tnum font-mono text-[10px]', selected.r >= 0 ? 'text-bull/70' : 'text-bear/70')}
          >
            {selected.r >= 0 ? '+' : ''}
            {selected.r.toFixed(1)}R
          </span>
        </span>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  hint,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={hint}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
        active ? 'bg-white/12 text-white' : 'text-white/40 hover:bg-white/6 hover:text-white/75',
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn('tnum font-mono', active ? 'text-white/50' : 'text-white/25')}>{count}</span>
      )}
    </button>
  );
}
