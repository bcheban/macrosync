import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import type { Signal } from '@/types/domain';

/**
 * The candles behind one signal, inside the card that made the claim.
 *
 * The point is not a chart — anybody can open one. It is that the two EMAs the
 * card's sentence talks about are drawn on the same bars the engine read, so
 * "EMA 21 crossed above EMA 55" can be checked rather than believed, without
 * leaving the page and finding a chart whose settings do not match.
 *
 * Loaded on demand and rendered only while open. `lightweight-charts` is the
 * heaviest thing this app can import and most sessions never expand a card, so
 * the module is code-split at the call site and the instance is destroyed when
 * the card collapses rather than parked.
 */

/**
 * The interval and the EMA pair each strategy is computed on.
 *
 * A mirror of the server's `STRATEGY_PROFILES`, and the one thing in this file
 * that can drift: change a period there and this draws a line the engine is not
 * reading. Kept here rather than derived from the card's text — the summary
 * names the periods in prose, and parsing a sentence to decide what to plot is
 * a worse dependency than a table somebody can diff.
 */
const PROFILE: Record<string, { interval: '5m' | '1h' | '4h'; limit: number; fast: number; slow: number }> = {
  scalping: { interval: '5m', limit: 120, fast: 9, slow: 21 },
  day: { interval: '1h', limit: 120, fast: 21, slow: 55 },
  swing: { interval: '4h', limit: 120, fast: 34, slow: 89 },
};

/**
 * Exponential moving average over closes, as a series.
 *
 * Recomputed here rather than requested, because the API publishes the latest
 * value and a line needs every one. The seed is a simple mean over the first
 * `period` bars — the same convention the server uses, so the last point of
 * this line and the `emaFast`/`emaSlow` on the card agree.
 */
function emaSeries(values: number[], period: number): (number | undefined)[] {
  if (values.length < period) return values.map(() => undefined);

  const k = 2 / (period + 1);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let running = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = running;

  for (let i = period; i < values.length; i += 1) {
    running = (values[i] as number) * k + running * (1 - k);
    out[i] = running;
  }
  return out;
}

export function MiniChart({ signal }: { signal: Signal }) {
  const { fast, slow, ...plan } = PROFILE[signal.strategy] ?? PROFILE.day;
  const { t } = useTranslation();
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    const controller = new AbortController();


    const instance = createChart(element, {
      width: element.clientWidth,
      height: element.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.4)',
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
    });
    chart.current = instance;

    const candles = instance.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const fastLine: ISeriesApi<'Line'> = instance.addSeries(LineSeries, {
      color: 'rgba(167,139,250,0.9)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const slowLine: ISeriesApi<'Line'> = instance.addSeries(LineSeries, {
      color: 'rgba(34,211,238,0.75)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    void api
      .candles(signal.symbol, plan.interval, plan.limit, controller.signal)
      .then((set) => {
        if (controller.signal.aborted) return;

        const bars = set.candles.map((candle) => ({
          time: Math.floor(candle.openTime / 1000) as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));
        candles.setData(bars);

        const closes = set.candles.map((candle) => candle.close);
        const toLine = (series: (number | undefined)[]) =>
          series
            .map((value, index) => ({ time: bars[index]?.time as Time, value }))
            .filter((point): point is { time: Time; value: number } => point.value !== undefined);

        fastLine.setData(toLine(emaSeries(closes, fast)));
        slowLine.setData(toLine(emaSeries(closes, slow)));

        /*
         * Entry, stop and target on the same axis as the candles. Without them
         * this is a picture of the market; with them it is a picture of the
         * trade being proposed.
         */
        for (const line of [
          { price: signal.entry, color: 'rgba(255,255,255,0.55)', title: t('signals.entry'), style: LineStyle.Solid },
          { price: signal.stopLoss, color: '#ef4444', title: t('signals.stop'), style: LineStyle.Dashed },
          { price: signal.takeProfit, color: '#22c55e', title: t('signals.target'), style: LineStyle.Dashed },
        ]) {
          candles.createPriceLine({
            price: line.price,
            color: line.color,
            title: line.title,
            lineWidth: 1,
            lineStyle: line.style,
            axisLabelVisible: false,
          });
        }

        instance.timeScale().fitContent();
        setLoading(false);
      })
      .catch((caught: Error) => {
        if (controller.signal.aborted) return;
        setError(caught.message);
        setLoading(false);
      });

    // The card is in a responsive grid, so the width is not knowable up front.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) instance.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);

    return () => {
      controller.abort();
      observer.disconnect();
      instance.remove();
      chart.current = null;
    };
  }, [signal, fast, slow, plan.interval, plan.limit, t]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-black/25">
      <div className="flex items-center justify-between px-2.5 pt-2 text-[10px] text-white/35">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3 bg-[rgba(167,139,250,0.9)]" /> EMA {fast}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3 bg-[rgba(34,211,238,0.75)]" /> EMA {slow}
          </span>
        </span>
        <span className="tnum font-mono">{signal.timeframe}</span>
      </div>

      <div ref={holder} className="h-40 w-full sm:h-48" />

      {loading && !error && (
        <p className="px-2.5 pb-2 text-[10px] text-white/25">{t('liveTrades.chartLoading')}</p>
      )}
      {error && <p className="px-2.5 pb-2 text-[10px] text-warn/80">{error}</p>}
    </div>
  );
}
