import { getKlines } from '../market.service.js';
import { getJson, setJson, storeKey } from '../store/store.js';
import { dict } from '../telegram/i18n/index.js';
import type { Locale } from '../telegram/preferences.service.js';
import {
  INTERVAL,
  LOOKBACK,
  MAX_LIFETIME_MS,
  loadHistory,
  loadStats,
  winRate,
  type ClosedTrade,
} from '../trades/trades.service.js';

/**
 * What the record actually says, as opposed to what the headline percentage says.
 *
 * Three questions, and the third is the one that pays for this module: when a
 * trade is scratched at breakeven, would holding it have paid? That is the only
 * evidence that can settle where the breakeven threshold belongs, and without it
 * the number is set by argument rather than by measurement.
 *
 * Every figure here carries its sample size. A win rate over eleven trades and a
 * win rate over eleven hundred are different kinds of claim, and printing them
 * in the same format invites them to be read the same way.
 */

/** Below this, a rate or a correlation is a description of noise. */
const MIN_SAMPLE = 30;

export interface RateBreakdown {
  wins: number;
  losses: number;
  breakeven: number;
  /** Target and stop only — breakeven trades are not in the denominator. */
  excludingBreakeven: number | null;
  /**
   * Breakeven counted as a non-win, which is what the rate *was* before the
   * rule existed: every one of these used to be a loss.
   */
  includingBreakeven: number | null;
  sample: number;
  reliable: boolean;
}

export interface ConfidenceCorrelation {
  /** Point-biserial r between confluence score and win/loss, -1..1. */
  r: number | null;
  sample: number;
  /** Trades with no stored score — opened before the field existed. */
  missing: number;
  meanWinning: number | null;
  meanLosing: number | null;
  reliable: boolean;
  reading: string;
}

export interface BreakevenCase {
  base: string;
  strategy: string;
  side: 'buy' | 'sell';
  entry: number;
  originalStop: number;
  target: number;
  closedAt: string;
  /** What the tape did after the scratch, within the trade's own lifetime. */
  after: 'target' | 'stop' | 'neither' | 'unknown';
}

export interface BreakevenWhatIf {
  scratched: number;
  wouldHaveWon: number;
  wouldHaveLost: number;
  neither: number;
  /** Closed too long ago for the candle window to cover — counted, not guessed. */
  unknown: number;
  /** Of the cases the tape could answer, the share that would have paid. */
  wouldHaveWonPct: number | null;
  /**
   * The win rate the record would show had none of these been scratched.
   *
   * The decision-relevant number: `wouldHaveWonPct` looks impressive because it
   * is measured only over trades that resolved, while the ones that went
   * nowhere would have expired and never entered a rate at all.
   */
  projectedRate: number | null;
  reliable: boolean;
  reading: string;
  cases: BreakevenCase[];
}

export interface Analytics {
  generatedAt: string;
  breakevenThreshold: number;
  rate: RateBreakdown;
  confidence: ConfidenceCorrelation;
  whatIf: BreakevenWhatIf;
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/**
 * Point-biserial correlation between confluence score and outcome.
 *
 * The same number Pearson's r would give against a 0/1 outcome column, written
 * the short way. Positive means higher-confidence calls won more often.
 *
 * Trades with no stored score are excluded rather than defaulted. Treating an
 * absent field as a zero would produce a strong-looking correlation that
 * describes when the field was added, not how the strategy performs.
 */
function correlateConfidence(decided: ClosedTrade[]): ConfidenceCorrelation {
  const scored = decided.filter((trade) => typeof trade.confidence === 'number');
  const missing = decided.length - scored.length;

  const wins = scored.filter((trade) => trade.outcome === 'win');
  const losses = scored.filter((trade) => trade.outcome === 'loss');

  const mean = (list: ClosedTrade[]): number | null =>
    list.length ? list.reduce((sum, trade) => sum + (trade.confidence ?? 0), 0) / list.length : null;

  const meanWinning = mean(wins);
  const meanLosing = mean(losses);

  // Both classes must be present, or there is nothing to correlate against.
  if (!wins.length || !losses.length || scored.length < 3) {
    return {
      r: null,
      sample: scored.length,
      missing,
      meanWinning: meanWinning === null ? null : Math.round(meanWinning * 10) / 10,
      meanLosing: meanLosing === null ? null : Math.round(meanLosing * 10) / 10,
      reliable: false,
      reading: scored.length
        ? 'Not enough settled trades of both kinds to correlate anything yet.'
        : 'No settled trade carries a confluence score yet — the field was added after these were opened.',
    };
  }

  const scores = scored.map((trade) => trade.confidence ?? 0);
  const overall = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - overall) ** 2, 0) / scores.length;
  const sd = Math.sqrt(variance);

  // Every call scored identically: no spread, so no relationship to measure.
  if (sd === 0) {
    return {
      r: null,
      sample: scored.length,
      missing,
      meanWinning: Math.round((meanWinning ?? 0) * 10) / 10,
      meanLosing: Math.round((meanLosing ?? 0) * 10) / 10,
      reliable: false,
      reading: 'Every settled call carried the same score, so there is no spread to correlate.',
    };
  }

  const p = wins.length / scored.length;
  const r = (((meanWinning ?? 0) - (meanLosing ?? 0)) / sd) * Math.sqrt(p * (1 - p));
  const reliable = scored.length >= MIN_SAMPLE;

  const strength = Math.abs(r) < 0.1 ? 'no' : Math.abs(r) < 0.3 ? 'a weak' : Math.abs(r) < 0.5 ? 'a moderate' : 'a strong';
  const direction = r > 0 ? 'higher-confidence calls win more often' : 'higher-confidence calls win less often';

  return {
    r: Math.round(r * 1000) / 1000,
    sample: scored.length,
    missing,
    meanWinning: Math.round((meanWinning ?? 0) * 10) / 10,
    meanLosing: Math.round((meanLosing ?? 0) * 10) / 10,
    reliable,
    reading: reliable
      ? `${strength} relationship — ${direction}.`
      : `${strength} relationship on ${scored.length} trades, which is too few to act on. Treat it as a placeholder until there are ${MIN_SAMPLE}.`,
  };
}

/**
 * What each scratched trade did next.
 *
 * Replays the candles after the close, in order, and reports which of the two
 * original levels the tape reached first. The window ends where the trade's own
 * lifetime would have ended — comparing against an unbounded future would credit
 * the strategy with moves it would never have held for.
 *
 * A close older than the candle window is reported as `unknown` rather than
 * folded into `neither`. The two mean opposite things: one is "it did not get
 * there", the other is "this record cannot say".
 */
async function replayAfterScratch(trade: ClosedTrade): Promise<BreakevenCase['after']> {
  const strategy = trade.strategy;

  const set = await getKlines(trade.symbol, INTERVAL[strategy], LOOKBACK[strategy]).catch(() => undefined);
  if (!set?.candles.length) return 'unknown';

  const closedAt = Date.parse(trade.closedAt);
  const deadline = Date.parse(trade.openedAt) + MAX_LIFETIME_MS[strategy];

  const oldest = set.candles[0]?.openTime ?? Number.POSITIVE_INFINITY;
  // The scratch happened before the tape we can see begins.
  if (oldest > closedAt) return 'unknown';

  const long = trade.side === 'buy';
  // Records written before the stop could move carry no initial level.
  const originalStop = trade.initialStopLoss ?? trade.stopLoss;

  for (const candle of set.candles) {
    if (candle.openTime < closedAt) continue;
    if (candle.openTime > deadline) break;

    const hitStop = long ? candle.low <= originalStop : candle.high >= originalStop;
    const hitTarget = long ? candle.high >= trade.takeProfit : candle.low <= trade.takeProfit;

    /*
     * Stop checked first when a bar touched both. Intrabar order is unknowable,
     * and the reading that flatters least is the one that keeps this analysis
     * honest about a rule change it is being used to justify.
     */
    if (hitStop) return 'stop';
    if (hitTarget) return 'target';
  }

  return 'neither';
}

export async function buildAnalytics(threshold: number): Promise<Analytics> {
  const [history, stats] = await Promise.all([loadHistory(), loadStats()]);

  const decided = history.filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss');
  const scratched = history.filter((trade) => trade.outcome === 'breakeven');

  /*
   * The running counters, not the history, are the source for the headline rate:
   * history is capped at the last hundred trades, so a rate computed from it
   * would quietly become a rolling window while claiming to be the record.
   */
  const wins = stats.wins;
  const losses = stats.losses;
  const breakeven = stats.breakeven;

  const rate: RateBreakdown = {
    wins,
    losses,
    breakeven,
    excludingBreakeven: pct(wins, wins + losses),
    includingBreakeven: pct(wins, wins + losses + breakeven),
    sample: wins + losses,
    reliable: wins + losses >= MIN_SAMPLE,
  };

  const cases = await Promise.all(
    scratched.map(async (trade) => ({
      base: trade.base,
      strategy: trade.strategy,
      side: trade.side,
      entry: trade.entry,
      originalStop: trade.initialStopLoss ?? trade.stopLoss,
      target: trade.takeProfit,
      closedAt: trade.closedAt,
      after: await replayAfterScratch(trade),
    })),
  );

  const wouldHaveWon = cases.filter((entry) => entry.after === 'target').length;
  const wouldHaveLost = cases.filter((entry) => entry.after === 'stop').length;
  const neither = cases.filter((entry) => entry.after === 'neither').length;
  const unknown = cases.filter((entry) => entry.after === 'unknown').length;
  const answerable = wouldHaveWon + wouldHaveLost;

  /*
   * Whether the split is distinguishable from a coin flip.
   *
   * A bare count threshold was not good enough here: on the first real dataset
   * this module produced 7 against 5, which a `>= 10` rule happily called
   * reliable while the margin sat comfortably inside one standard error. The
   * test is now the margin itself — the observed share must sit more than one
   * standard error away from 0.5 — which is a low bar, and this data does not
   * clear even that.
   */
  const share = answerable ? wouldHaveWon / answerable : 0.5;
  const standardError = answerable ? Math.sqrt(0.25 / answerable) : Infinity;
  const decisive = answerable >= 10 && Math.abs(share - 0.5) > standardError;

  // What the rate becomes if these resolve as replayed and nothing else changes.
  const projectedRate = pct(wins + wouldHaveWon, wins + wouldHaveWon + losses + wouldHaveLost);

  const direction = wouldHaveWon > wouldHaveLost
    ? `${wouldHaveWon} went on to reach the target against ${wouldHaveLost} that hit the original stop`
    : `${wouldHaveLost} went on to hit the original stop against ${wouldHaveWon} that reached the target`;

  const whatIf: BreakevenWhatIf = {
    scratched: cases.length,
    wouldHaveWon,
    wouldHaveLost,
    neither,
    unknown,
    wouldHaveWonPct: pct(wouldHaveWon, answerable),
    projectedRate,
    reliable: decisive,
    reading: !answerable
      ? 'No scratched trade can be replayed yet — either none have closed, or the candle window no longer covers them.'
      : decisive
        ? `Of ${answerable} scratched trades the tape can answer for, ${direction}. That margin is outside coin-flip range, so the threshold is worth moving.`
        : `Of ${answerable} scratched trades the tape can answer for, ${direction} — a margin inside one standard error of a coin flip, so it points a direction without proving one. ${neither} more went nowhere before expiry and would simply have expired.`,
    cases,
  };

  return {
    generatedAt: new Date().toISOString(),
    breakevenThreshold: threshold,
    rate,
    confidence: correlateConfidence(decided),
    whatIf,
  };
}

const SNAPSHOT_KEY = storeKey('analytics:snapshot');

/**
 * The snapshot every reader is served.
 *
 * `/stats_deep` is open to everyone now, and computing it per command would mean
 * replaying candles for every scratched trade on every tap — dozens of upstream
 * requests triggered by anyone with a keyboard. It is computed once when trades
 * close and read from the store thereafter.
 *
 * A stale snapshot is served rather than withheld, with its age printed. These
 * are figures about weeks of trading; twenty minutes old changes nothing about
 * how they should be read, and an empty panel would.
 */
export async function readSnapshot(): Promise<Analytics | null> {
  return getJson<Analytics | null>(SNAPSHOT_KEY, null);
}

/** Recomputes and stores it. Called from the cron, after trades settle. */
export async function refreshSnapshot(threshold: number): Promise<Analytics> {
  const analytics = await buildAnalytics(threshold);
  await setJson(SNAPSHOT_KEY, analytics);
  return analytics;
}

/**
 * Serves the snapshot, building one only if none exists.
 *
 * The first reader after a deploy pays for it; everyone after that does not.
 */
export async function analyticsForReader(threshold: number): Promise<Analytics> {
  return (await readSnapshot()) ?? refreshSnapshot(threshold);
}

/** The same figures, in the reader's language. */
export function formatAnalyticsFor(analytics: Analytics, locale: Locale): string {
  const t = dict(locale);
  const { rate, confidence, whatIf } = analytics;

  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(analytics.generatedAt)) / 60_000));

  const lines = [
    t.deepTitle,
    t.deepThreshold(Math.round(analytics.breakevenThreshold * 100)),
    '',
    t.deepRateHeading,
    rate.excludingBreakeven === null
      ? t.deepRateNone
      : t.deepRateExcl(rate.excludingBreakeven, rate.wins, rate.losses),
    rate.includingBreakeven === null ? '' : t.deepRateIncl(rate.includingBreakeven, rate.breakeven),
    rate.reliable ? '' : t.deepRateThin(rate.sample),
    '',
    t.deepConfidenceHeading,
    confidence.r === null
      ? `  <i>${t.deepConfidenceNone}</i>`
      : t.deepConfidence(confidence.r, confidence.sample, confidence.meanWinning ?? 0, confidence.meanLosing ?? 0),
    confidence.r !== null && !confidence.reliable ? `  <i>${t.deepConfidenceThin(confidence.sample)}</i>` : '',
    '',
    t.deepWhatIfHeading,
    t.deepWhatIfTarget(whatIf.wouldHaveWon),
    t.deepWhatIfStop(whatIf.wouldHaveLost),
    t.deepWhatIfNeither(whatIf.neither),
    whatIf.projectedRate === null || rate.excludingBreakeven === null
      ? ''
      : t.deepWhatIfProjected(whatIf.projectedRate, rate.excludingBreakeven),
    '',
    `  <i>${
      whatIf.wouldHaveWon + whatIf.wouldHaveLost === 0
        ? t.deepWhatIfNone
        : whatIf.reliable
          ? t.deepWhatIfClear(whatIf.wouldHaveWon, whatIf.wouldHaveLost)
          : t.deepWhatIfNoisy(whatIf.wouldHaveWon, whatIf.wouldHaveLost, whatIf.neither)
    }</i>`,
    // Printed only when it could matter — a fresh snapshot needs no apology.
    ageMinutes >= 5 ? `\n${t.deepStale(ageMinutes)}` : '',
  ];

  return lines.filter((line) => line !== '').join('\n');
}

/** The same figures as a message somebody can read on a phone. */
export function formatAnalytics(analytics: Analytics): string {
  const { rate, confidence, whatIf } = analytics;
  const NL = '\n';

  const lines = [
    '📐 <b>Deep stats</b>',
    `<i>Breakeven threshold: ${Math.round(analytics.breakevenThreshold * 100)}% of the way to target</i>`,
    '',
    '<b>Win rate</b>',
    rate.excludingBreakeven === null
      ? '  Nothing settled yet.'
      : `  Excluding breakeven: <b>${rate.excludingBreakeven}%</b>  (${rate.wins}W / ${rate.losses}L)`,
    rate.includingBreakeven === null
      ? ''
      : `  Counting breakeven as a non-win: <b>${rate.includingBreakeven}%</b>  (+${rate.breakeven} scratched)`,
    rate.reliable ? '' : `  <i>${rate.sample} settled trades — too few to draw a conclusion from.</i>`,
    '',
    '<b>Confidence vs outcome</b>',
    confidence.r === null
      ? `  <i>${confidence.reading}</i>`
      : `  r = <b>${confidence.r}</b> over ${confidence.sample} trades  (winners averaged ${confidence.meanWinning}, losers ${confidence.meanLosing})`,
    confidence.r === null ? '' : `  <i>${confidence.reading}</i>`,
    confidence.missing ? `  <i>${confidence.missing} older trades carry no score and are excluded.</i>` : '',
    '',
    '<b>What the scratched trades did next</b>',
    `  Reached the target anyway: <b>${whatIf.wouldHaveWon}</b>`,
    `  Hit the original stop:     <b>${whatIf.wouldHaveLost}</b>`,
    `  Neither, before expiry:    <b>${whatIf.neither}</b>`,
    whatIf.unknown ? `  Outside the candle window: <b>${whatIf.unknown}</b>` : '',
    whatIf.projectedRate === null
      ? ''
      : `  Rate had none been scratched: <b>${whatIf.projectedRate}%</b>  (against ${rate.excludingBreakeven}% now)`,
    '',
    `  <i>${whatIf.reading}</i>`,
  ];

  return lines.filter((line) => line !== '').join(NL);
}
