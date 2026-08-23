import { env } from '../config/env.js';
import { getHeadlineEvent } from './calendar.service.js';
import { getKlines, splitSymbol, type Interval } from './market.service.js';
import type { Direction, I18nText, MacroEvent, Signal, Strategy } from '../types/domain.js';
import { atr, clamp, ema, macd, round, roundPrice, rsi, sma } from '../utils/indicators.js';

interface StrategyProfile {
  strategy: Strategy;
  label: string;
  interval: Interval;
  timeframe: string;
  /** Typical holding time in minutes — used for the macro-event conflict check. */
  horizonMinutes: number;
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  /** ATR multiple for the protective stop. */
  stopAtr: number;
  /** Target as a multiple of the risk taken. */
  rewardRatio: number;
  baseRiskPct: number;
  /** Minimum absolute score before the setup is called rather than left neutral. */
  threshold: number;
}

export const STRATEGY_PROFILES: Record<Strategy, StrategyProfile> = {
  scalping: {
    strategy: 'scalping',
    label: 'Scalping',
    interval: '5m',
    timeframe: '5m',
    horizonMinutes: 45,
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 7,
    stopAtr: 1.1,
    rewardRatio: 1.5,
    baseRiskPct: 0.35,
    threshold: 18,
  },
  day: {
    strategy: 'day',
    label: 'Day Trading',
    interval: '1h',
    timeframe: '1h',
    horizonMinutes: 8 * 60,
    emaFast: 21,
    emaSlow: 55,
    rsiPeriod: 14,
    stopAtr: 1.6,
    rewardRatio: 2.2,
    baseRiskPct: 0.75,
    threshold: 22,
  },
  swing: {
    strategy: 'swing',
    label: 'Swing',
    interval: '4h',
    timeframe: '4h',
    horizonMinutes: 4 * 24 * 60,
    emaFast: 34,
    emaSlow: 89,
    rsiPeriod: 14,
    stopAtr: 2.4,
    rewardRatio: 3,
    baseRiskPct: 1.25,
    threshold: 26,
  },
};

export const STRATEGIES = Object.keys(STRATEGY_PROFILES) as Strategy[];

export const isStrategy = (value: string): value is Strategy =>
  (STRATEGIES as string[]).includes(value);

interface Component {
  score: number;
  /** The sentence that explains this component, as a translatable descriptor. */
  note: I18nText;
}

/** Builds an `I18nText` from a key under `signals.rationale.*`. */
const note = (key: string, params: Record<string, string | number>, text: string): I18nText => ({
  key: `signals.rationale.${key}`,
  params,
  text,
});

/**
 * Blends four independent reads — trend, momentum, mean reversion and
 * participation — into one directional score in [-100, 100]. Each component
 * also returns the sentence that explains it, so the UI can show *why* a
 * signal fired instead of an opaque verdict.
 */
function scoreComponents(profile: StrategyProfile, closes: number[], volumes: number[], candles: Parameters<typeof atr>[0]) {
  const price = closes[closes.length - 1] as number;
  const fast = ema(closes, profile.emaFast);
  const slow = ema(closes, profile.emaSlow);
  const trendSpread = ((fast - slow) / (slow || 1)) * 100;
  const momentum = macd(closes);
  const strength = rsi(closes, profile.rsiPeriod);
  const atrAbs = atr(candles, 14);
  const atrPct = (atrAbs / (price || 1)) * 100;
  const volumeRatio = (volumes[volumes.length - 1] as number) / (sma(volumes, 20) || 1);
  const histogramPct = (momentum.histogram / (price || 1)) * 100;

  const emaParams = { fast: profile.emaFast, slow: profile.emaSlow, spread: Math.abs(round(trendSpread, 2)) };
  const trend: Component = {
    score: clamp(trendSpread * 22, -40, 40),
    note:
      Math.abs(trendSpread) < 0.05
        ? note('trendFlat', emaParams, `EMA ${profile.emaFast}/${profile.emaSlow} flat — no directional edge from trend`)
        : note(
            trendSpread > 0 ? 'trendAbove' : 'trendBelow',
            emaParams,
            `EMA ${profile.emaFast} is ${trendSpread > 0 ? 'above' : 'below'} EMA ${profile.emaSlow} by ${emaParams.spread}%`,
          ),
  };

  const positive = momentum.histogram >= 0;
  const expanding = Math.abs(histogramPct) > 0.05;
  const impulse: Component = {
    score: clamp(histogramPct * 260, -30, 30),
    note: note(
      `macd${positive ? 'Positive' : 'Negative'}${expanding ? 'Expanding' : 'Flat'}`,
      { timeframe: profile.timeframe },
      `MACD histogram ${positive ? 'positive' : 'negative'} and ${expanding ? 'expanding' : 'flat'} on the ${profile.timeframe}`,
    ),
  };

  // Mean reversion pushes against the trend at RSI extremes.
  const rsiValue = Math.round(strength);
  const reversion: Component = {
    score: clamp((50 - strength) * 0.62, -20, 20),
    note:
      strength > 68
        ? note('rsiStretched', { rsi: rsiValue }, `RSI ${rsiValue} — stretched, chase risk elevated`)
        : strength < 32
          ? note('rsiWashedOut', { rsi: rsiValue }, `RSI ${rsiValue} — washed out, snap-back risk elevated`)
          : note('rsiNeutral', { rsi: rsiValue }, `RSI ${rsiValue} sits in the neutral band`),
  };

  const participation: Component = {
    score: clamp((volumeRatio - 1) * 24, -12, 18) * Math.sign(trendSpread || 1),
    note: note(
      'volume',
      { ratio: round(volumeRatio, 2) },
      `Volume ${round(volumeRatio, 2)}× its 20-bar average`,
    ),
  };

  return {
    price,
    fast,
    slow,
    strength,
    momentum,
    atrAbs,
    atrPct,
    volumeRatio,
    components: [trend, impulse, reversion, participation],
    total: trend.score + impulse.score + reversion.score + participation.score,
  };
}

function buildSignal(
  symbol: string,
  profile: StrategyProfile,
  set: Awaited<ReturnType<typeof getKlines>>,
  headline: MacroEvent | undefined,
): Signal {
  const closes = set.candles.map((candle) => candle.close);
  const volumes = set.candles.map((candle) => candle.volume);
  const read = scoreComponents(profile, closes, volumes, set.candles);

  const direction: Direction =
    read.total >= profile.threshold ? 'long' : read.total <= -profile.threshold ? 'short' : 'neutral';

  const confidence = Math.round(clamp(Math.abs(read.total) * 1.15, 4, 97));
  const status: Signal['status'] =
    direction === 'neutral' ? 'cooling' : confidence >= 62 ? 'live' : 'forming';

  const entry = read.price;
  const risk = read.atrAbs * profile.stopAtr || entry * 0.004;
  const sign = direction === 'short' ? -1 : 1;
  const stopLoss = direction === 'neutral' ? entry - risk : entry - sign * risk;
  const takeProfit = direction === 'neutral' ? entry + risk : entry + sign * risk * profile.rewardRatio;

  // Volatility-adjusted sizing: the wider the ATR, the smaller the ticket.
  const suggestedRiskPct = round(
    clamp(profile.baseRiskPct * (1.4 / Math.max(read.atrPct, 0.35)), 0.1, profile.baseRiskPct * 1.2),
    2,
  );

  const rationale = read.components
    .slice()
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map((component) => component.note);

  const minutesToEvent = headline ? (Date.parse(headline.startsAt) - Date.now()) / 60_000 : Number.NaN;
  const minutes = Math.round(minutesToEvent);
  const eventWarning: I18nText | undefined =
    headline && minutesToEvent > 0 && minutesToEvent < profile.horizonMinutes
      ? {
          key: 'signals.eventWarning',
          // `eventKey` is resolved client-side into a translated `event` title.
          params: { event: headline.title, eventKey: `events.${headline.id}.title`, minutes },
          text: `${headline.title} lands in ${minutes}m — inside this setup's horizon`,
        }
      : undefined;

  return {
    id: `${symbol}-${profile.strategy}`,
    symbol,
    base: splitSymbol(symbol).base,
    strategy: profile.strategy,
    timeframe: profile.timeframe,
    direction,
    confidence,
    status,
    price: roundPrice(read.price),
    entry: roundPrice(entry),
    stopLoss: roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    riskReward: direction === 'neutral' ? 0 : round(profile.rewardRatio, 2),
    suggestedRiskPct,
    indicators: {
      rsi: round(read.strength, 1),
      emaFast: roundPrice(read.fast),
      emaSlow: roundPrice(read.slow),
      macdHistogram: round(read.momentum.histogram, 4),
      atrPct: round(read.atrPct, 2),
      volumeRatio: round(read.volumeRatio, 2),
    },
    rationale,
    ...(eventWarning ? { eventWarning } : {}),
    source: 'mexc',
    updatedAt: new Date().toISOString(),
  };
}

export async function getSignals(
  strategy?: Strategy,
  symbols: string[] = [...env.symbols],
): Promise<Signal[]> {
  const profiles = strategy ? [STRATEGY_PROFILES[strategy]] : STRATEGIES.map((key) => STRATEGY_PROFILES[key]);

  const pairs = profiles.flatMap((profile) => symbols.map((symbol) => ({ profile, symbol })));

  /*
   * `allSettled`, not `all`: one symbol failing must never empty the whole
   * grid. A rejected pair is dropped and the rest of the tape still renders —
   * partial data beats an error screen for a dashboard that is polled.
   */
  // Fetched once for the whole batch rather than per signal.
  const headline = await getHeadlineEvent();

  const settled = await Promise.allSettled(
    pairs.map(async ({ profile, symbol }) => {
      const set = await getKlines(symbol, profile.interval, 180);
      return buildSignal(symbol, profile, set, headline);
    }),
  );

  for (const result of settled) {
    if (result.status === 'rejected') {
      console.warn('[signals] dropped one symbol:', (result.reason as Error)?.message);
    }
  }

  return settled
    .filter((result): result is PromiseFulfilledResult<Signal> => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => b.confidence - a.confidence);
}

/** Average ATR% across the tape — the volatility regime the AI layer reasons about. */
export async function getVolatilitySnapshot(symbols: string[] = [...env.symbols]) {
  const sets = await Promise.all(symbols.map((symbol) => getKlines(symbol, '1h', 180)));
  const readings = sets.map((set) => {
    const price = set.candles[set.candles.length - 1]?.close ?? 1;
    return (atr(set.candles, 14) / price) * 100;
  });
  const avgAtrPct = readings.reduce((sum, value) => sum + value, 0) / (readings.length || 1);

  const breadth =
    sets.filter((set) => {
      const closes = set.candles.map((candle) => candle.close);
      return ema(closes, 21) > ema(closes, 55);
    }).length / (sets.length || 1);

  return { avgAtrPct: round(avgAtrPct, 2), breadth: round(breadth, 2) };
}
