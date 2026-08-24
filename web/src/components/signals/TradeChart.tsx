import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import type { ActiveSignal } from '@/types/domain';

/**
 * The chart behind a live trade, with its own levels drawn on it.
 *
 * A TradingView embed was the obvious reach and the wrong one: the free widget
 * has no API for drawing horizontal lines — `createShape` belongs to the
 * licensed Charting Library — so the entry, the stop and the target, which are
 * the only reason to open a chart here at all, could not be put on it.
 *
 * `lightweight-charts` is TradingView's own renderer and does have
 * `createPriceLine`. It also means the candles are **our** candles: the same
 * bars the signal was computed from, so the picture and the call cannot
 * disagree about what the market did.
 */

interface TradeChartProps {
  trade: ActiveSignal;
}

/** Bars per strategy, matched to how long that kind of trade runs. */
const INTERVAL: Record<string, { interval: '5m' | '1h' | '4h'; limit: number }> = {
  scalping: { interval: '5m', limit: 180 },
  day: { interval: '1h', limit: 180 },
  swing: { interval: '4h', limit: 180 },
};

export function TradeChart({ trade }: TradeChartProps) {
  const { t } = useTranslation();
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    let chart: IChartApi | undefined;
    let series: ISeriesApi<'Candlestick'> | undefined;
    let disposed = false;
    const controller = new AbortController();

    const plan = INTERVAL[trade.strategy] ?? INTERVAL.day;

    chart = createChart(element, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.45)',
        fontFamily: 'inherit',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });

    /*
     * The three lines are the point of this component. Entry is neutral, the
     * stop is drawn in the colour of a loss and the target in the colour of a
     * win, so the shape of the trade reads without the labels.
     */
    const levels: { price: number; color: string; title: string; style: LineStyle }[] = [
      { price: trade.entry, color: 'rgba(255,255,255,0.55)', title: t('signals.entry'), style: LineStyle.Solid },
      { price: trade.stopLoss, color: '#ef4444', title: t('signals.stop'), style: LineStyle.Dashed },
      { price: trade.takeProfit, color: '#22c55e', title: t('signals.target'), style: LineStyle.Dashed },
    ];

    for (const level of levels) {
      series.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: 1,
        lineStyle: level.style,
        axisLabelVisible: true,
        title: level.title,
      });
    }

    api
      .candles(trade.symbol, plan?.interval ?? '1h', plan?.limit ?? 180, controller.signal)
      .then((payload) => {
        if (disposed) return;

        series?.setData(
          payload.candles.map((candle) => ({
            // Seconds, and strictly ascending — the library rejects either wrong.
            time: Math.floor(candle.openTime / 1000) as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );

        /*
         * Fitted to the levels as well as the bars. A stop or target outside the
         * visible range would leave its line off-screen, which is exactly the
         * information somebody opened this to see.
         */
        chart?.timeScale().fitContent();
        setLoading(false);
      })
      .catch((reason: Error) => {
        if (disposed || reason.name === 'AbortError') return;
        setError(reason.message);
        setLoading(false);
      });

    return () => {
      disposed = true;
      controller.abort();
      chart?.remove();
    };
  }, [trade, t]);

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="tnum font-mono text-white/45">
          {t('signals.entry')} <span className="text-white/75">{formatPrice(trade.entry)}</span>
        </span>
        <span className="tnum font-mono text-bear/70">
          {t('signals.stop')} <span className="text-bear">{formatPrice(trade.stopLoss)}</span>
        </span>
        <span className="tnum font-mono text-bull/70">
          {t('signals.target')} <span className="text-bull">{formatPrice(trade.takeProfit)}</span>
        </span>
      </div>

      {/* Height is reserved up front so loading the bars cannot shift the page. */}
      <div ref={holder} className="h-64 w-full sm:h-72" />

      {(loading || error) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[11px] text-white/35">
          {error ? t('liveTrades.chartError') : t('liveTrades.chartLoading')}
        </div>
      )}
    </div>
  );
}
