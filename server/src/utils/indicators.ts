export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const last = (series: number[]): number => series[series.length - 1] ?? 0;

export function sma(values: number[], period: number): number {
  if (values.length < period) return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const window = values.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

/** Exponential moving average series (same length as input). */
export function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0] as number];
  for (let i = 1; i < values.length; i += 1) {
    const price = values[i] as number;
    out.push(price * k + (out[i - 1] as number) * (1 - k));
  }
  return out;
}

export const ema = (values: number[], period: number): number => last(emaSeries(values, period));

/** Wilder-smoothed RSI. */
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = (values[i] as number) - (values[i - 1] as number);
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = (values[i] as number) - (values[i - 1] as number);
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  const macdSeries = fastSeries.map((value, i) => value - (slowSeries[i] as number));
  const signalSeries = emaSeries(macdSeries, signalPeriod);
  const macdValue = last(macdSeries);
  const signalValue = last(signalSeries);
  return { macd: macdValue, signal: signalValue, histogram: macdValue - signalValue };
}

/** Average True Range (Wilder), returned in quote-currency units. */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i] as Candle;
    const prev = candles[i - 1] as Candle;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close),
      ),
    );
  }
  if (trueRanges.length < period) return sma(trueRanges, trueRanges.length);
  let value = sma(trueRanges.slice(0, period), period);
  for (let i = period; i < trueRanges.length; i += 1) {
    value = (value * (period - 1) + (trueRanges[i] as number)) / period;
  }
  return value;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Price precision that stays readable for both BTC (~$100k) and SHIB (~$0.00002). */
export const priceDecimals = (price: number): number => {
  if (price >= 1000) return 2;
  if (price >= 1) return 3;
  if (price >= 0.01) return 5;
  return 8;
};

export const roundPrice = (price: number): number => round(price, priceDecimals(price));
