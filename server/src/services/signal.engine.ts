import { env } from '../config/env.js';
import { getHeadlineEvent } from './calendar.service.js';
import {
  getContractSpecs,
  getKlines,
  isTradableContract,
  splitSymbol,
  type ContractSpec,
  type Interval,
} from './market.service.js';
import type { Direction, I18nText, MacroEvent, Signal, Strategy, Verdict } from '../types/domain.js';
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
  /**
   * ATR multiple for the protective stop.
   *
   * Widened on the day book after measurement: a 1.6 ATR stop on the 1h was
   * inside the noise it was meant to sit outside, and the trades it cut were
   * disproportionately ones that went on to reach target.
   */
  stopAtr: number;
  /**
   * Target as a multiple of the risk taken.
   *
   * The number that was costing the most, and not the one anybody would have
   * guessed. Swing published a 3R target — 7.2 ATR away on the 4h — and reached
   * it 29% of the time on majors and 20% on microcaps, which at 3R is a losing
   * book. Backtested over 40 symbols and roughly 1,800 resolved trades per
   * setting, dropping it to 1.5R took the win rate to 50% and 44% and turned
   * both universes positive. Reaching a nearer target more often beats reaching
   * a distant one rarely, and it is the same entries either way.
   */
  rewardRatio: number;
  baseRiskPct: number;
  /** Minimum absolute score before the setup is called rather than left neutral. */
  threshold: number;
}

/**
 * The furthest a target may sit from entry, as a fraction of price.
 *
 * Generous on purpose: half of entry is already an enormous move, so this
 * excludes only setups that are absurd rather than merely aggressive. Its real
 * job is the hard floor — for a short, a target beyond 100% of entry is not a
 * price at all.
 */
const MAX_TARGET_FRACTION = 0.5;

/**
 * How much further than the stop the liquidation price must sit.
 *
 * At exactly 1.0 the two coincide, which in practice means liquidation wins: the
 * stop is a limit the exchange fills at *your* price while liquidation is
 * triggered off the mark price, which moves independently and can gap. Funding
 * accrues against the position as well. Half again the distance is the margin
 * that makes the stop the thing that closes the trade.
 */
const LIQUIDATION_BUFFER = 1.5;

/**
 * A ceiling on the arithmetic, set where it clips only the absurd.
 *
 * A very tight stop lets the formula return three figures, which is a number
 * nobody should see next to the word "safe". But the cap must not dominate the
 * ordinary case either: at 20 it swallowed the whole calculation — a 2% stop
 * returned 20 on a deep contract and 20 on a thin one, and a figure that is the
 * same for every signal tells the reader nothing. Fifty leaves the stop distance
 * and the maintenance rate visible, which is the entire point of computing it.
 */
const HOUSE_MAX_LEVERAGE = 50;

/**
 * The highest leverage at which the stop is still reached before liquidation.
 *
 * An isolated position is liquidated once the loss eats the margin down to the
 * maintenance requirement, which happens at roughly `1/L - mmr` of entry. So
 * requiring liquidation to sit `buffer` times further out than the stop gives
 *
 *     1/L - mmr >= buffer * stopFraction     =>     L <= 1 / (buffer * s + mmr)
 *
 * The maintenance rate is read from the contract rather than assumed: across
 * MEXC's board it spans 0.04% to 5%, and on a thin contract it dominates the
 * denominator entirely. A 2% stop gives 33x at BTC's 0.1% but only 14x where
 * the rate is 2% — treating it as a constant would be an order-of-magnitude
 * error in the direction that costs somebody their position.
 *
 * Capped at both the contract's own limit and a house ceiling. "Safe" here
 * means exactly one thing — liquidation is not what closes this trade — and
 * nothing at all about whether the position is sensibly sized. The alert says
 * so next to the number.
 */
export function maxSafeLeverage(
  entry: number,
  stopLoss: number,
  spec: Pick<ContractSpec, 'maxLeverage' | 'maintenanceMarginRate'> | undefined,
): number {
  if (!(entry > 0) || !(stopLoss > 0)) return 0;

  const stopFraction = Math.abs(entry - stopLoss) / entry;
  if (!(stopFraction > 0)) return 0;

  const mmr = spec?.maintenanceMarginRate ?? 0.02;
  const raw = 1 / (LIQUIDATION_BUFFER * stopFraction + mmr);

  const ceiling = Math.min(spec?.maxLeverage ?? HOUSE_MAX_LEVERAGE, HOUSE_MAX_LEVERAGE);
  // Rounded down: rounding a leverage limit up is the one direction that lies.
  return Math.max(1, Math.min(Math.floor(raw), ceiling));
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
    // 1.35x the old 1.6, which measured best of the widths tried.
    stopAtr: 2.16,
    rewardRatio: 1.5,
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
    rewardRatio: 1.5,
    baseRiskPct: 1.25,
    threshold: 26,
  },
};

export const STRATEGIES = Object.keys(STRATEGY_PROFILES) as Strategy[];

export const isStrategy = (value: string): value is Strategy =>
  (STRATEGIES as string[]).includes(value);

/** Which of the four reads a component represents. */
type ComponentKind = 'trend' | 'momentum' | 'reversion' | 'volume';

interface Component {
  kind: ComponentKind;
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
    kind: 'trend',
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
    kind: 'momentum',
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
    kind: 'reversion',
    score: clamp((50 - strength) * 0.62, -20, 20),
    note:
      strength > 68
        ? note('rsiStretched', { rsi: rsiValue }, `RSI ${rsiValue} — stretched, chase risk elevated`)
        : strength < 32
          ? note('rsiWashedOut', { rsi: rsiValue }, `RSI ${rsiValue} — washed out, snap-back risk elevated`)
          : note('rsiNeutral', { rsi: rsiValue }, `RSI ${rsiValue} sits in the neutral band`),
  };

  const participation: Component = {
    kind: 'volume',
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

/**
 * One plain sentence explaining the call.
 *
 * The card used to lead with three indicator sentences and leave the reader to
 * assemble a conclusion. This states the conclusion and names the read that
 * produced it — descriptive, never a promise: the strongest component is the
 * reason, and the rest of the card is still there to check it against.
 */
function buildSummary(
  verdict: Verdict,
  dominant: Component,
  profile: StrategyProfile,
  read: ReturnType<typeof scoreComponents>,
): I18nText {
  const params: Record<string, string | number> = {
    timeframe: profile.timeframe,
    rsi: Math.round(read.strength),
    ratio: round(read.volumeRatio, 2),
    fast: profile.emaFast,
    slow: profile.emaSlow,
  };

  // `wait` has no direction to explain, so it describes the disagreement.
  const key = verdict === 'wait' ? `signals.verdict.wait.${dominant.kind}` : `signals.verdict.${verdict}.${dominant.kind}`;

  return { key, params, text: dominant.note.text };
}

function buildSignal(
  symbol: string,
  profile: StrategyProfile,
  set: Awaited<ReturnType<typeof getKlines>>,
  headline: MacroEvent | undefined,
  spec: ContractSpec | undefined,
): Signal {
  const closes = set.candles.map((candle) => candle.close);
  const volumes = set.candles.map((candle) => candle.volume);
  const read = scoreComponents(profile, closes, volumes, set.candles);

  const entry = read.price;
  const risk = read.atrAbs * profile.stopAtr || entry * 0.004;

  /*
   * A read can be right about direction and still describe no trade.
   *
   * The stop is a multiple of ATR and the target a multiple of the stop, so on
   * an asset whose ATR approaches its own price the target runs past what a
   * price can be: a 2.2R short on a coin with a 50% ATR lands *below zero*. That
   * call can never reach its target — only its stop, or expiry — so publishing
   * it would be advertising a trade that cannot win and quietly poisoning the
   * win rate with it.
   *
   * This never came up while the scan covered eight majors. It appeared the
   * moment the radar reached microcaps, which is where a latent bug of this
   * shape was always going to surface.
   */
  const tradable = risk * profile.rewardRatio <= entry * MAX_TARGET_FRACTION;

  /*
   * Whether the exchange will let anyone act on this at all.
   *
   * The last line of defence, and it catches what the radar's filter cannot: a
   * universe cached six hours ago, or a symbol somebody selected by hand. A
   * contract the API refuses is one where the alert names an entry nobody can
   * take — worse than silence, because it looks actionable.
   *
   * An unknown symbol passes. A spec outage should narrow the board, not empty
   * it, and the levels stay drawn either way.
   */
  const contractOk = spec === undefined || isTradableContract(spec);

  const bias: Direction =
    read.total >= profile.threshold ? 'long' : read.total <= -profile.threshold ? 'short' : 'neutral';
  // No expressible trade is no trade, whatever the indicators agree on.
  const direction: Direction = tradable && contractOk ? bias : 'neutral';

  const confidence = Math.round(clamp(Math.abs(read.total) * 1.15, 4, 97));
  const status: Signal['status'] =
    direction === 'neutral' ? 'cooling' : confidence >= 62 ? 'live' : 'forming';

  const sign = direction === 'short' ? -1 : 1;
  /*
   * A neutral read draws a volatility band rather than a trade, so it is capped
   * separately — otherwise the same wild ATR that made the setup untradable
   * would print a negative price on the card instead of in the alert.
   */
  const band = Math.min(risk, entry * 0.25);
  const stopLoss = direction === 'neutral' ? entry - band : entry - sign * risk;
  const takeProfit = direction === 'neutral' ? entry + band : entry + sign * risk * profile.rewardRatio;

  // Volatility-adjusted sizing: the wider the ATR, the smaller the ticket.
  const suggestedRiskPct = round(
    clamp(profile.baseRiskPct * (1.4 / Math.max(read.atrPct, 0.35)), 0.1, profile.baseRiskPct * 1.2),
    2,
  );

  const ranked = read.components.slice().sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const rationale = ranked.slice(0, 3).map((component) => component.note);

  /*
   * A directional call is only made once the reads actually agree. A `long`
   * that is still `forming` is a watch item, not an instruction, so it reads
   * as "wait" rather than a weak buy.
   */
  const verdict: Verdict = direction === 'neutral' || status !== 'live' ? 'wait' : direction === 'long' ? 'buy' : 'sell';
  const summary = buildSummary(verdict, ranked[0] as Component, profile, read);

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
    verdict,
    summary,
    confidence,
    status,
    price: roundPrice(read.price),
    entry: roundPrice(entry),
    stopLoss: roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    riskReward: direction === 'neutral' ? 0 : round(profile.rewardRatio, 2),
    maxSafeLeverage: direction === 'neutral' ? 0 : maxSafeLeverage(entry, stopLoss, spec),
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
  // Both fetched once for the whole batch rather than per signal.
  const [headline, specs] = await Promise.all([
    getHeadlineEvent(),
    // A spec failure costs the leverage figure, never the signal.
    getContractSpecs().catch(() => new Map<string, ContractSpec>()),
  ]);

  const settled = await Promise.allSettled(
    pairs.map(async ({ profile, symbol }) => {
      const set = await getKlines(symbol, profile.interval, 180);
      return buildSignal(symbol, profile, set, headline, specs.get(symbol));
    }),
  );

  for (const result of settled) {
    if (result.status === 'rejected') {
      console.warn('[signals] dropped one symbol:', (result.reason as Error)?.message);
    }
  }

  const signals = settled
    .filter((result): result is PromiseFulfilledResult<Signal> => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => b.confidence - a.confidence);

  /*
   * No alerting here any more. It used to hang off this read path, which meant
   * the bot only spoke while somebody had the dashboard open; `/api/cron/signals`
   * owns it now and runs on a schedule instead.
   */
  return signals;
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
