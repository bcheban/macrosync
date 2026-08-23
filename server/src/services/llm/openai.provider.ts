import { env } from '../../config/env.js';
import type { Locale, MarketContext, NewsItem } from '../../types/domain.js';
import { buildUserPrompt, InsightBodySchema, systemPromptFor, type InsightBody } from './prompt.js';

export const openaiAvailable = (): boolean => Boolean(env.openaiApiKey);

/**
 * Placeholder OpenAI adapter — raw REST so the project carries no second SDK.
 * Swap in the official `openai` package if you standardise on it.
 */
export async function analyseWithOpenAi(
  news: NewsItem,
  context: MarketContext,
  locale: Locale = 'en',
): Promise<InsightBody> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${systemPromptFor(locale)}\n\nRespond with JSON only, matching: {posture, thesis, scenarios:[{trigger,response,severity}], riskControls:[], invalidation, confidence}`,
        },
        { role: 'user', content: buildUserPrompt(news, context) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty completion');

  return InsightBodySchema.parse(JSON.parse(content));
}
