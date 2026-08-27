import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
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
 *
 * Purely the arithmetic now. Whether it is on screen at all is the card's
 * decision — it keeps this behind a toggle on every width, because eight cards
 * each carrying an open form is most of the page and almost none of it is being
 * read. The exchange link moved to the card's footer for the opposite reason:
 * it is the one control every reader wants, so it must not be behind anything.
 */

const STORAGE_KEY = 'ayanox.calc';

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

    /*
     * Where to drag the stop once the trade is one risk unit ahead.
     *
     * At 1R the position has earned the right to stop being a risk, and the
     * usual answer — pull the stop to entry — throws that away by handing the
     * trade back to the same noise it just survived. This trails one ATR
     * behind the 1R mark instead: still locked in profit, but with the room
     * the asset's own volatility says a move needs.
     *
     * Signed by side, so a short's trail sits above the price rather than
     * below it. `atrPct` is the engine's own reading off the candles the
     * levels came from, so this cannot disagree with the stop distance beside
     * it about how volatile the asset is.
     */
    const long = signal.takeProfit > signal.entry;
    const risk = Math.abs(signal.entry - signal.stopLoss);
    const atr = (signal.indicators.atrPct / 100) * signal.entry;
    const oneR = signal.entry + (long ? risk : -risk);
    const trail = atr > 0 ? oneR - (long ? atr : -atr) : null;

    return {
      riskAmount,
      stopPct: stopFraction * 100,
      notional: sized,
      quantity: sized / signal.entry,
      margin: capped ? saved.balance : wanted,
      leverage,
      capped,
      oneR,
      /*
       * Only offered when it is actually an improvement. One ATR behind 1R can
       * land below entry on an asset whose ATR is wider than its own stop, and
       * a trailing stop that locks in a loss is not one — a number that looks
       * like advice is worse than no number.
       */
      trail: trail !== null && (long ? trail > signal.entry : trail < signal.entry) ? trail : null,
    };
  }, [signal, saved]);

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div>
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

        {plan?.trail != null && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-bull/20 bg-bull/6 px-2.5 py-2">
            <TrendingUp className="mt-px size-3.5 shrink-0 text-bull" />
            <p className="min-w-0 text-[10.5px] leading-snug text-white/55">
              {t('calc.trail', {
                at: formatPrice(plan.oneR),
                to: formatPrice(plan.trail),
                atr: signal.indicators.atrPct.toFixed(2),
              })}
            </p>
          </div>
        )}

        <p className="mt-2.5 text-[10.5px] leading-snug text-white/30">
          {plan?.capped ? t('calc.capped') : t('calc.stopNote', { pct: (plan?.stopPct ?? 0).toFixed(2) })}
        </p>
      </div>

    </div>
  );
}
