/**
 * Domain contract shared between the API and the dashboard.
 * `web/src/types/domain.ts` is a mirror of this file — keep them in sync.
 */

export type Strategy = 'scalping' | 'day' | 'swing';
export type Direction = 'long' | 'short' | 'neutral';
export type Sentiment = 'bullish' | 'bearish' | 'neutral';
export type VolatilityRegime = 'low' | 'elevated' | 'high' | 'extreme';
/** Every price in the app comes from one exchange; there is no fallback feed. */
/**
 * Where a call came from.
 *
 * `tradingview` is not a data feed but an origin: the levels were decided on
 * somebody's chart rather than by the engine. The card reads differently for
 * it — there is no confluence score to show, and claiming one would be
 * inventing agreement that was never measured.
 */
export type DataSource = 'mexc' | 'tradingview';
export type Locale = 'en' | 'uk';

/**
 * A piece of user-facing copy that survives translation.
 *
 * Deterministic producers (the signal engine, the rule-based risk engine) emit a
 * `key` plus interpolation `params`, so the dashboard can render the sentence in
 * any language. Free-form producers (the LLM providers) emit `text` only — they
 * are prompted in the requested locale instead. `text` is always populated, so a
 * client with no translation for `key` still shows something sensible.
 *
 * Any param named `<name>Key` is itself a translation key for `<name>`; the
 * client resolves it before interpolating. That is how a nested value such as an
 * event title or a volatility label stays translatable.
 */
export interface I18nText {
  key?: string;
  params?: Record<string, string | number>;
  text: string;
}

export type AssetGroup = 'majors' | 'layer1' | 'layer2' | 'defi' | 'meme' | 'ai' | 'radar';

export interface AssetMeta {
  symbol: string;
  base: string;
  quote: string;
  /** Canonical project name, e.g. "Ethereum". Not translated — it is a proper noun. */
  name: string;
  group: AssetGroup;
  /**
   * Position in the radar's volume ranking, 1-based. Absent for a curated pair
   * the scan does not currently reach.
   */
  rank?: number;
}

export interface Ticker {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  /** Recent closes, oldest → newest. Used for the sparkline. */
  spark: number[];
  source: DataSource;
  updatedAt: string;
}

export interface SignalIndicators {
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdHistogram: number;
  /** ATR as a percentage of price — the volatility budget for stops. */
  atrPct: number;
  /** Volume vs. its 20-period average, 1 = average. */
  volumeRatio: number;
}

/**
 * What a trader should do with this card, collapsing direction and maturity
 * into one call. `wait` covers both "no edge" and "a setup that has not
 * confirmed yet" — from the desk's point of view they are the same instruction.
 */
export type Verdict = 'buy' | 'sell' | 'wait';

export interface Signal {
  id: string;
  symbol: string;
  base: string;
  strategy: Strategy;
  timeframe: string;
  direction: Direction;
  verdict: Verdict;
  /** One plain sentence on why, in place of the indicator dump. */
  summary: I18nText;
  /** 0–100. Agreement between trend, momentum, mean-reversion and volume. */
  confidence: number;
  status: 'live' | 'forming' | 'cooling';
  price: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  /** Suggested risk per trade in % of account, scaled down by volatility. */
  suggestedRiskPct: number;
  /**
   * The highest leverage at which liquidation still sits comfortably beyond the
   * stop, given this contract's maintenance margin. `0` when there is no trade.
   */
  maxSafeLeverage: number;
  indicators: SignalIndicators;
  rationale: I18nText[];
  /** Set when a high-impact macro event lands inside the trade's horizon. */
  eventWarning?: I18nText;
  source: DataSource;
  updatedAt: string;
}

export type EventCategory = 'monetary' | 'macro' | 'political' | 'crypto';

export interface MacroEvent {
  /** Slug of the print's name — stable across the feed's weekly rollover. */
  id: string;
  /** As published by the calendar feed. Clients may translate by `events.<id>.title`. */
  title: string;
  category: EventCategory;
  importance: 'high' | 'medium' | 'low';
  /** Country/bloc the print comes from, derived from the feed's currency code. */
  region: string;
  currency: string;
  startsAt: string;
  /** 0–100 volatility expectation, derived from the feed's own impact rating. */
  expectedImpact: number;
  /**
   * Only present when the calendar actually published them. Never inferred —
   * a forecast the market has not made is not a forecast.
   */
  previous?: string;
  forecast?: string;
}

export interface NewsItem {
  id: string;
  /** English copy. Clients translate by id via `news.<id>.headline`. */
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  assets: string[];
  sentiment: Sentiment;
  /** -1 (max bearish) → +1 (max bullish). */
  sentimentScore: number;
  /** 0–100, how much of the tape this headline is likely to move. */
  impact: number;
}

export interface RiskScenario {
  /** The market condition being matched, e.g. "Bearish tone + high volatility". */
  trigger: I18nText;
  /** The risk-management response — never a buy/sell call. */
  response: I18nText;
  severity: 'low' | 'medium' | 'high';
}

export interface AiInsight {
  id: string;
  newsId: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  assets: string[];
  sentiment: Sentiment;
  volatility: VolatilityRegime;
  /** One-word stance for the risk desk: Defensive / Neutral / Constructive. */
  posture: 'defensive' | 'neutral' | 'constructive';
  thesis: I18nText;
  scenarios: RiskScenario[];
  riskControls: I18nText[];
  invalidation: I18nText;
  confidence: number;
  generatedBy: 'anthropic' | 'openai' | 'heuristic';
  generatedAt: string;
}

export interface MarketContext {
  avgAtrPct: number;
  volatility: VolatilityRegime;
  breadth: number;
  nextEvent?: {
    id: string;
    title: string;
    startsAt: string;
    minutesAway: number;
    importance: string;
  };
}
