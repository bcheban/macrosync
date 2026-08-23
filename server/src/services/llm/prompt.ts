import { z } from 'zod';
import type { I18nText, Locale, MarketContext, NewsItem } from '../../types/domain.js';

/**
 * The single most important rule of this product: the model never issues
 * directional trade instructions. It translates a headline plus the current
 * volatility regime into *risk-management posture*.
 */
export const RISK_ANALYST_SYSTEM_PROMPT = `You are the risk desk of a crypto trading platform.

Your job is to convert a news headline plus live market context into RISK MANAGEMENT guidance.

Hard rules:
- NEVER output a directional instruction. No "buy", "sell", "long here", "short here", price targets or entries.
- Instead, describe how a trader should manage exposure, stops, sizing, and timing around the event.
- Every scenario must be conditional: a market condition paired with a defensive response.
  Example shape: "Bearish tone + expanding volatility -> tighten stops to 0.5x ATR, stand down new leveraged longs until the print clears."
- Be concrete and quantitative where possible (ATR multiples, % of book, time windows).
- Be terse. Traders read this in under ten seconds.
- Never invent facts that are not in the provided headline or context.`;

const LANGUAGE_INSTRUCTION: Record<Locale, string> = {
  en: '',
  uk: `
Language:
- Write EVERY string field in Ukrainian, using the vocabulary a Ukrainian trading desk actually uses.
- Keep ticker symbols (BTC, ETH), indicator names (RSI, ATR, EMA, MACD) and numeric formats in their standard Latin form.
- Do not translate the enum values \`posture\` and \`severity\` — emit them exactly as specified in English.`,
};

/** System prompt for one locale. English adds no instruction at all. */
export const systemPromptFor = (locale: Locale): string =>
  `${RISK_ANALYST_SYSTEM_PROMPT}${LANGUAGE_INSTRUCTION[locale] ?? ''}`;

export const InsightBodySchema = z.object({
  posture: z
    .enum(['defensive', 'neutral', 'constructive'])
    .describe('Overall risk posture implied by the headline and volatility regime.'),
  thesis: z.string().describe('One sentence on what this headline does to risk, not to price direction.'),
  scenarios: z
    .array(
      z.object({
        trigger: z.string().describe('The market condition, e.g. "Bearish tone + high realised volatility".'),
        response: z.string().describe('The risk-management response. Never a buy/sell call.'),
        severity: z.enum(['low', 'medium', 'high']),
      }),
    )
    .min(2)
    .max(4),
  riskControls: z.array(z.string()).min(2).max(4).describe('Concrete controls: sizing, stops, leverage, timing.'),
  invalidation: z.string().describe('What would make this read wrong.'),
  confidence: z.number().min(0).max(100),
});

/** What an LLM provider returns: prose already written in the requested locale. */
export type InsightBody = z.infer<typeof InsightBodySchema>;

/**
 * What the insight service works with. The deterministic engine fills in
 * translation keys; the LLM providers are normalised into the same shape with
 * `text` only.
 */
export interface LocalizedInsightBody {
  posture: InsightBody['posture'];
  thesis: I18nText;
  scenarios: { trigger: I18nText; response: I18nText; severity: 'low' | 'medium' | 'high' }[];
  riskControls: I18nText[];
  invalidation: I18nText;
  confidence: number;
}

/** Wraps LLM prose as an `I18nText` — no key, because it is already localized. */
const asText = (text: string): I18nText => ({ text });

export const toLocalizedBody = (body: InsightBody): LocalizedInsightBody => ({
  posture: body.posture,
  thesis: asText(body.thesis),
  scenarios: body.scenarios.map((scenario) => ({
    trigger: asText(scenario.trigger),
    response: asText(scenario.response),
    severity: scenario.severity,
  })),
  riskControls: body.riskControls.map(asText),
  invalidation: asText(body.invalidation),
  confidence: body.confidence,
});

/**
 * The prompt always describes the market in English — the model is told which
 * language to *answer* in by the system prompt, which keeps one canonical
 * description of the tape instead of one per locale.
 */
export function buildUserPrompt(news: NewsItem, context: MarketContext): string {
  const nextEvent = context.nextEvent
    ? `${context.nextEvent.title} in ${context.nextEvent.minutesAway} minutes (importance: ${context.nextEvent.importance})`
    : 'none scheduled';

  return `HEADLINE: ${news.headline}
SUMMARY: ${news.summary}
SOURCE: ${news.source}
PUBLISHED: ${news.publishedAt}
ASSETS: ${news.assets.join(', ')}
HEADLINE SENTIMENT: ${news.sentiment} (score ${news.sentimentScore}, estimated impact ${news.impact}/100)

MARKET CONTEXT
- Volatility regime: ${context.volatility} (average 1h ATR ${context.avgAtrPct}% of price)
- Breadth: ${Math.round(context.breadth * 100)}% of tracked majors trading above their trend baseline
- Next scheduled macro event: ${nextEvent}

Produce the risk-management breakdown.`;
}
