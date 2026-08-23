import type { I18nText, MarketContext, NewsItem, RiskScenario } from '../../types/domain.js';
import type { LocalizedInsightBody } from './prompt.js';

const VOL_LABEL = {
  low: 'compressed volatility',
  elevated: 'elevated volatility',
  high: 'high volatility',
  extreme: 'extreme volatility',
} as const;

const STOP_MULTIPLE = { low: '1.5x', elevated: '1.2x', high: '0.8x', extreme: '0.5x' } as const;
const SIZE_HAIRCUT = { low: 0, elevated: 25, high: 50, extreme: 70 } as const;
const LEVERAGE_CAP = { low: '5x', elevated: '3x', high: '2x', extreme: '1x (spot only)' } as const;
const MAX_RISK = { low: '1%', elevated: '1%', high: '0.5%', extreme: '0.25%' } as const;

const NS = 'insights.heuristic';

/** Builds an `I18nText` under the heuristic namespace. */
const line = (key: string, params: Record<string, string | number>, text: string): I18nText => ({
  key: `${NS}.${key}`,
  params,
  text,
});

/**
 * Deterministic stand-in for the LLM. It follows exactly the same contract as
 * the model providers, so the dashboard behaves identically with or without an
 * API key — and it keeps the demo honest: risk scenarios, never trade calls.
 *
 * Unlike the model providers this engine is language-agnostic: it emits
 * translation keys plus parameters, so one payload renders in EN or UA.
 */
export function analyseWithHeuristics(news: NewsItem, context: MarketContext): LocalizedInsightBody {
  const vol = context.volatility;
  const bearish = news.sentiment === 'bearish';
  const bullish = news.sentiment === 'bullish';
  const heavyTape = vol === 'high' || vol === 'extreme';

  const volParams = { volLabel: VOL_LABEL[vol], volLabelKey: `insights.volLabel.${vol}` };
  const assetList = news.assets.slice(0, 3).join(', ');
  // Falls back to a translatable "majors" when a headline names no ticker.
  const assetParams: Record<string, string> = assetList
    ? { assets: assetList }
    : { assets: 'majors', assetsKey: `${NS}.majors` };
  const assets = assetParams.assets;
  const stop = STOP_MULTIPLE[vol];

  const posture: LocalizedInsightBody['posture'] =
    bearish && heavyTape ? 'defensive' : bullish && !heavyTape ? 'constructive' : 'neutral';

  const scenarios: RiskScenario[] = [];

  if (bearish) {
    const size = SIZE_HAIRCUT[vol] || 20;
    scenarios.push({
      trigger: line('trigger.bearishTone', volParams, `Bearish tone + ${VOL_LABEL[vol]}`),
      response: line(
        'response.bearishTone',
        { ...assetParams, stop, size },
        `Tighten stops to ${stop} ATR on ${assets}, cut position size by ${size}% and add no new leveraged longs until the tape stabilises.`,
      ),
      severity: heavyTape ? 'high' : 'medium',
    });
  } else if (bullish) {
    scenarios.push({
      trigger: line('trigger.constructiveTone', volParams, `Constructive tone + ${VOL_LABEL[vol]}`),
      response: heavyTape
        ? line(
            'response.constructiveHeavy',
            { stop },
            `Let existing exposure work but do not add into strength — trail stops at ${stop} ATR and keep new risk below half of normal size.`,
          )
        : line(
            'response.constructiveCalm',
            { ...assetParams, stop },
            `Scale risk back toward normal in ${assets}, trail stops at ${stop} ATR and pre-define the give-back you will accept before adding.`,
          ),
      severity: heavyTape ? 'medium' : 'low',
    });
  } else {
    scenarios.push({
      trigger: line('trigger.ambiguous', volParams, `Ambiguous headline + ${VOL_LABEL[vol]}`),
      response: line(
        'response.ambiguous',
        { ...assetParams, stop },
        `Treat this as noise until price confirms: hold current exposure, avoid fresh risk in ${assets} and let the ${stop} ATR stop do the deciding.`,
      ),
      severity: 'low',
    });
  }

  if (context.nextEvent && context.nextEvent.minutesAway <= 240) {
    const { title, id, minutesAway, importance } = context.nextEvent;
    const settle = vol === 'extreme' ? 30 : 15;
    scenarios.push({
      trigger: line(
        'trigger.eventCountdown',
        { event: title, eventKey: `events.${id}.title`, minutes: minutesAway },
        `${title} in ${minutesAway}m`,
      ),
      response: line(
        'response.eventCountdown',
        { settle },
        `Flatten or hedge short-horizon positions before the print. Widen limit orders, expect 2-4x normal slippage in the first 60 seconds and re-enter only after the first ${settle} minutes of post-release range is set.`,
      ),
      severity: importance === 'high' ? 'high' : 'medium',
    });
  }

  if (news.impact >= 70) {
    scenarios.push({
      trigger: line('trigger.highImpact', {}, 'High headline impact + thin order-book depth'),
      response: line(
        'response.highImpact',
        {},
        'Assume liquidity gaps: replace market orders with staged limits, cap single-ticket size at 25% of visible depth and disable any stop that would trigger inside the spread.',
      ),
      severity: 'high',
    });
  }

  if (scenarios.length < 3) {
    const broad = context.breadth >= 0.6;
    scenarios.push({
      trigger: broad
        ? line('trigger.broadBreadth', {}, 'Broad participation across majors')
        : line('trigger.narrowBreadth', {}, 'Narrow breadth — leadership concentrated in one name'),
      response: broad
        ? line(
            'response.broadBreadth',
            {},
            'Correlation is high, so treat separate positions as one bet: aggregate risk across the book before sizing anything new.',
          )
        : line(
            'response.narrowBreadth',
            {},
            'Rotation risk is elevated. Cap alt exposure and keep dry powder for the majors where depth is deepest.',
          ),
      severity: 'medium',
    });
  }

  const blackout = context.nextEvent ? Math.min(context.nextEvent.minutesAway, 60) : 0;
  const riskControls: I18nText[] = [
    line('control.maxRisk', { pct: MAX_RISK[vol] }, `Max risk per position: ${MAX_RISK[vol]} of account equity.`),
    line(
      'control.stopDistance',
      { stop },
      `Stop distance: ${stop} ATR(14) on the trading timeframe — never a fixed percentage.`,
    ),
    line(
      'control.leverageCap',
      { cap: LEVERAGE_CAP[vol], capKey: `insights.leverageCap.${vol}` },
      `Leverage cap while this regime holds: ${LEVERAGE_CAP[vol]}.`,
    ),
    context.nextEvent
      ? line(
          'control.eventBlackout',
          {
            minutes: blackout,
            event: context.nextEvent.title,
            eventKey: `events.${context.nextEvent.id}.title`,
          },
          `No new intraday risk inside the ${blackout}m window before ${context.nextEvent.title}.`,
        )
      : line(
          'control.reevaluate',
          {},
          'Re-evaluate exposure at every 4h close while the headline is still driving flow.',
        ),
  ];

  const invalidation = bearish
    ? line(
        'invalidation.bearish',
        {},
        'A reclaim of the pre-headline range on rising volume would mean the market has absorbed the news — the defensive posture can be relaxed.',
      )
    : bullish
      ? line(
          'invalidation.bullish',
          {},
          'A failure to hold the post-headline low on falling volume means the bid is not real — step back to a defensive posture.',
        )
      : line(
          'invalidation.neutral',
          {},
          'A decisive break of the session range in either direction on 1.5x average volume invalidates the wait-and-see stance.',
        );

  const tone = bearish ? 'bearish' : bullish ? 'constructive' : 'mixed';
  const toneWord = tone === 'mixed' ? 'Mixed' : bearish ? 'Bearish' : 'Constructive';
  const thesis = line(
    `thesis.${tone}.${heavyTape ? 'heavy' : 'calm'}`,
    volParams,
    `${toneWord} headline landing into ${VOL_LABEL[vol]} — the risk here is ${
      heavyTape ? 'position size and slippage, not direction' : 'complacency: the regime can flip on the next print'
    }.`,
  );

  const confidence = Math.round(
    Math.min(94, 42 + news.impact * 0.35 + Math.abs(news.sentimentScore) * 22 + (heavyTape ? 6 : 0)),
  );

  return { posture, thesis, scenarios: scenarios.slice(0, 4), riskControls, invalidation, confidence };
}
