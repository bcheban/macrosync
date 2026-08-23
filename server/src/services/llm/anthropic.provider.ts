import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '../../config/env.js';
import type { Locale, MarketContext, NewsItem } from '../../types/domain.js';
import { buildUserPrompt, InsightBodySchema, systemPromptFor, type InsightBody } from './prompt.js';

let client: Anthropic | null = null;

const getClient = (): Anthropic => {
  // The SDK also resolves ANTHROPIC_API_KEY / an `ant auth login` profile itself.
  client ??= env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : new Anthropic();
  return client;
};

export const anthropicAvailable = (): boolean => Boolean(env.anthropicApiKey);

/**
 * Turns one headline into a structured risk breakdown using the Messages API.
 * Structured outputs guarantee the shape, so the route never has to parse prose.
 * The locale only changes the language of the prose, never the schema.
 */
export async function analyseWithAnthropic(
  news: NewsItem,
  context: MarketContext,
  locale: Locale = 'en',
): Promise<InsightBody> {
  const response = await getClient().messages.parse({
    model: env.anthropicModel,
    max_tokens: 2000,
    system: systemPromptFor(locale),
    messages: [{ role: 'user', content: buildUserPrompt(news, context) }],
    output_config: { format: zodOutputFormat(InsightBodySchema) },
  });

  if (!response.parsed_output) throw new Error('Anthropic returned no parsable insight');
  return response.parsed_output;
}
