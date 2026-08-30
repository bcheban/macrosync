import { m } from 'framer-motion';
import { LineChart, X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/cn';
import { cumulativeRoiPct } from '@/lib/confidence';
import { simulatedUsd } from '@/lib/money';
import type { Strategy } from '@/types/domain';

const ORDER: Strategy[] = ['scalping', 'day', 'swing'];

/**
 * The record, trade by trade, instead of as one percentage.
 *
 * A win rate is a claim; a curve is the same claim with its working shown. The
 * two things it makes visible that a headline figure cannot are the shape of
 * the drawdowns and whether the number rests on twelve trades or two hundred —
 * both of which decide whether the percentage means anything at all.
 *
 * Plotted in R, not in currency. Currency would need a starting balance this
 * app has no business knowing, and would make two identical strategies look
 * different because one reader risks more per trade than another. R is what the
 * engine actually controls.
 */
function EquityCurve({ points }: { points: { r: number; at: string }[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null;

    let running = 0;
    const cumulative = points.map((point) => (running += point.r));
    const min = Math.min(0, ...cumulative);
    const max = Math.max(0, ...cumulative);
    const span = max - min || 1;

    // A 100x36 viewBox stretched by CSS: the shape is what matters, not the units.
    const step = 100 / (cumulative.length - 1);
    const y = (value: number) => 36 - ((value - min) / span) * 36;

    return {
      line: cumulative.map((value, index) => `${index === 0 ? 'M' : 'L'}${index * step},${y(value)}`).join(' '),
      zero: min < 0 && max > 0 ? y(0) : null,
      final: cumulative[cumulative.length - 1] ?? 0,
      peak: max,
      /*
       * The worst run down from a high-water mark, in R. The single number a
       * curve is read for: a book that ends up is still unusable if getting
       * there meant sitting through eight risk units of loss.
       */
      drawdown: cumulative.reduce(
        (worst, value, index) => Math.max(worst, Math.max(...cumulative.slice(0, index + 1)) - value),
        0,
      ),
    };
  }, [points]);

  if (!path) {
    return null;
  }

  const up = path.final >= 0;

  return (
    <div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-28 w-full" aria-hidden>
        {path.zero !== null && (
          <line x1="0" y1={path.zero} x2="100" y2={path.zero} stroke="rgba(255,255,255,0.14)" strokeWidth="0.3" strokeDasharray="1 1" />
        )}
        <path
          d={path.line}
          fill="none"
          stroke={up ? 'var(--color-bull, #22c55e)' : 'var(--color-bear, #ef4444)'}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <Figure label="net" value={`${path.final >= 0 ? '+' : ''}${path.final.toFixed(2)}R`} tone={up ? 'text-bull' : 'text-bear'} />
        <Figure label="peak" value={`${path.peak.toFixed(2)}R`} />
        <Figure label="max drawdown" value={`−${path.drawdown.toFixed(2)}R`} tone="text-warn" />
        <Figure label="at $100 risk" value={simulatedUsd(path.final)} />
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-white/30">{label}</span>
      <span className={cn('tnum font-mono', tone ?? 'text-white/75')}>{value}</span>
    </span>
  );
}

export function Journal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data, loading, error } = usePolling((signal) => api.tradeHistory(signal), 120_000);

  /*
   * Settled means decided: the call reached its target or it hit its stop.
   *
   * Everything on this panel reads this one array — the curve, the per-setup
   * split, the ROI line and the count in the footnote. It used to read the
   * unfiltered log, which also holds breakevens and calls that expired. Those
   * contribute exactly zero to R and to the percentage, so no sum here ever
   * moved; only the denominator did, and that was enough for the footnote to
   * quote a total the wins and losses above it did not add up to.
   */
  const trades = useMemo(
    () => (data?.trades ?? []).filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss'),
    [data],
  );

  const bySetup = useMemo(
    () =>
      ORDER.map((strategy) => {
        const mine = trades.filter((trade) => trade.strategy === strategy);
        const wins = mine.filter((trade) => trade.outcome === 'win').length;
        const losses = mine.filter((trade) => trade.outcome === 'loss').length;
        const decided = wins + losses;
        return {
          strategy,
          wins,
          losses,
          decided,
          rate: decided ? Math.round((wins / decided) * 100) : 0,
          r: mine.reduce((sum, trade) => sum + trade.r, 0),
        };
      }).filter((row) => row.decided > 0),
    [trades],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      {/* A click outside closes it; the panel stops the click reaching here. */}
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 cursor-default" onClick={onClose} />

      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={t('journal.title')}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-card sm:rounded-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/8 bg-[#0B0E14]/90 px-5 py-4 backdrop-blur">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <LineChart className="size-4 text-accent-soft" />
            {t('journal.title')}
            {/*
              R is the one unit on this panel a newcomer cannot guess, and every
              figure here is quoted in it. The explanation belongs at the top,
              beside the title, not in a footnote under the numbers it defines.
            */}
            <InfoTip label={t('journal.whatIsR')} align="start">
              {t('glossary.rMultiple')}
            </InfoTip>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && !data && <div className="h-28 animate-pulse rounded-xl bg-white/4" />}
          {error && !data && <p className="text-[12px] text-warn/90">{error.message}</p>}

          {data && trades.length < 2 && (
            <p className="py-8 text-center text-[12px] leading-relaxed text-white/45">{t('journal.thin')}</p>
          )}

          {trades.length >= 2 && (
            <>
              <EquityCurve points={trades.map((trade) => ({ r: trade.r, at: trade.closedAt }))} />

              {/*
                The raw move, beside the risk-normalised one. R says whether
                the sizing works; this says whether the direction did — the two
                can disagree, and a reader deserves both rather than whichever
                one flatters.
              */}
              <p className="mt-2 flex items-baseline gap-1.5 text-[11px]">
                <span className="text-white/30">{t('journal.roi')}</span>
                <span
                  className={cn(
                    'tnum font-mono text-[13px] font-semibold',
                    cumulativeRoiPct(trades) >= 0 ? 'text-bull' : 'text-bear',
                  )}
                >
                  {cumulativeRoiPct(trades) >= 0 ? '+' : ''}
                  {cumulativeRoiPct(trades).toFixed(2)}%
                </span>
                <span className="text-white/25">{t('journal.roiNote')}</span>
              </p>

              <p className="mt-4 text-[10px] tracking-[0.16em] text-white/35 uppercase">{t('journal.bySetup')}</p>
              <div className="mt-2 space-y-1.5">
                {bySetup.map((row) => (
                  <div
                    key={row.strategy}
                    className="flex items-center justify-between rounded-lg border border-white/8 bg-white/2 px-3 py-2"
                  >
                    <span className="text-[12.5px] text-white/80">{t(`signals.strategies.${row.strategy}`)}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="tnum font-mono text-[13px] font-semibold text-white">{row.rate}%</span>
                      <span className="tnum font-mono text-[10.5px] text-white/35">
                        {row.wins}W / {row.losses}L
                      </span>
                      <span
                        className={cn('tnum font-mono text-[10.5px]', row.r >= 0 ? 'text-bull' : 'text-bear')}
                      >
                        {row.r >= 0 ? '+' : ''}
                        {row.r.toFixed(1)}R
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/*
                The denominator, said out loud. A rate over a dozen trades is
                not the same kind of number as a rate over two hundred, and
                printing it without the count invites it to be read as though
                it were.
              */}
              <p className="mt-4 text-[10.5px] leading-relaxed text-white/30">
                {t('journal.footnote', { count: trades.length })}
              </p>
            </>
          )}
        </div>
      </m.div>
    </div>
  );
}
