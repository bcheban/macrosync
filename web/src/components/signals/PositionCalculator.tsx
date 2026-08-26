import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { mexcFuturesUrl } from '@/lib/mexc';
import type { Signal } from '@/types/domain';

/**
 * What this call costs, for the reader's own account.
 *
 * The card already carries a stop distance and a leverage ceiling, which
 * together fix the position size — but only once somebody's deposit is known.
 * Leaving that multiplication to the reader is where mistakes happen, and the
 * mistakes are expensive in a way a mis-read indicator is not.
 *
 * The deposit is remembered per browser. It is a number somebody typed to size a
 * trade, it never leaves the machine, and asking for it again on every visit
 * would make the widget not worth opening.
 */

const STORAGE_KEY = 'macrosync.calc';

interface Saved {
  balance: number;
  riskPct: number;
}

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { balance: 1000, riskPct: 1 };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      balance: Number(parsed.balance) > 0 ? Number(parsed.balance) : 1000,
      riskPct: Number(parsed.riskPct) > 0 ? Number(parsed.riskPct) : 1,
    };
  } catch {
    // A private window, or storage the browser refuses. Defaults are fine.
    return { balance: 1000, riskPct: 1 };
  }
}

const usd = (value: number): string =>
  value >= 1000
    ? Math.round(value).toLocaleString('en-US')
    : value >= 1
      ? value.toFixed(2)
      : value.toPrecision(3);

export function PositionCalculator({ signal }: { signal: Signal }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<Saved>(readSaved);

  const persist = (next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Sizing still works; it just will not be remembered.
    }
  };

  const plan = useMemo(() => {
    const stopFraction = Math.abs(signal.entry - signal.stopLoss) / signal.entry;
    if (!(stopFraction > 0) || !(saved.balance > 0)) return null;

    const riskAmount = (saved.balance * saved.riskPct) / 100;
    const notional = riskAmount / stopFraction;
    const leverage = signal.maxSafeLeverage > 0 ? signal.maxSafeLeverage : null;

    const wanted = leverage ? notional / leverage : null;
    const capped = wanted !== null && wanted > saved.balance;
    const sized = capped && leverage ? saved.balance * leverage : notional;

    return {
      riskAmount,
      stopPct: stopFraction * 100,
      notional: sized,
      quantity: sized / signal.entry,
      margin: capped ? saved.balance : wanted,
      leverage,
      capped,
    };
  }, [signal, saved]);

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] tracking-wide text-white/35 uppercase">{t('calc.deposit')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={saved.balance}
            onChange={(event) => persist({ ...saved, balance: Math.max(0, Number(event.target.value)) })}
            className="tnum w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-sm text-white outline-none focus:border-accent-soft"
          />
        </label>

        <label className="w-28 shrink-0">
          <span className="mb-1 block text-[10px] tracking-wide text-white/35 uppercase">
            {t('calc.risk')} <span className="tnum text-white/60">{saved.riskPct}%</span>
          </span>
          {/* A slider, because risk is a feel rather than a figure people type. */}
          <input
            type="range"
            min={0.25}
            max={5}
            step={0.25}
            value={saved.riskPct}
            onChange={(event) => persist({ ...saved, riskPct: Number(event.target.value) })}
            className="h-8 w-full accent-accent-soft"
            aria-label={t('calc.risk')}
          />
        </label>
      </div>

      {plan && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-white/35">{t('calc.atRisk')}</dt>
            <dd className="tnum truncate font-mono text-bear/90">{usd(plan.riskAmount)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-white/35">{t('calc.size')}</dt>
            <dd className="tnum truncate font-mono text-white/80">{usd(plan.notional)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-white/35">{t('calc.quantity')}</dt>
            <dd className="tnum truncate font-mono text-white/80">
              {plan.quantity >= 1 ? plan.quantity.toFixed(2) : plan.quantity.toPrecision(4)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-white/35">
              {t('calc.margin')}
              {plan.leverage ? <span className="text-white/25"> · {plan.leverage}x</span> : null}
            </dt>
            <dd className={cn('tnum truncate font-mono', plan.capped ? 'text-warn' : 'text-white/80')}>
              {plan.margin === null ? '—' : usd(plan.margin)}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-2.5 text-[10.5px] leading-snug text-white/30">
        {plan?.capped ? t('calc.capped') : t('calc.stopNote', { pct: (plan?.stopPct ?? 0).toFixed(2) })}
      </p>

      <a
        href={mexcFuturesUrl(signal.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-linear-to-b from-accent/25 to-accent/10 py-2 text-[12px] font-semibold text-white transition-colors duration-200 hover:from-accent/35 hover:to-accent/15"
      >
        {t('calc.tradeOn', { price: formatPrice(signal.entry) })}
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
