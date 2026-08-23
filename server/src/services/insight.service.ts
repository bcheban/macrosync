import { env } from '../config/env.js';
import { getHeadlineEvent } from '../data/calendar.js';
import { getNews } from '../data/news.js';
import type { AiInsight, Locale, MarketContext, NewsItem, VolatilityRegime } from '../types/domain.js';
import { cache } from '../utils/cache.js';
import { getVolatilitySnapshot } from './signal.engine.js';
import { analyseWithAnthropic, anthropicAvailable } from './llm/anthropic.provider.js';
import { analyseWithHeuristics } from './llm/heuristic.provider.js';
import { analyseWithOpenAi, openaiAvailable } from './llm/openai.provider.js';
import { toLocalizedBody, type LocalizedInsightBody } from './llm/prompt.js';

const regimeFor = (avgAtrPct: number): VolatilityRegime =>
  avgAtrPct >= 2.4 ? 'extreme' : avgAtrPct >= 1.4 ? 'high' : avgAtrPct >= 0.8 ? 'elevated' : 'low';

export async function getMarketContext(): Promise<MarketContext> {
  const { avgAtrPct, breadth } = await getVolatilitySnapshot();
  const event = getHeadlineEvent();
  return {
    avgAtrPct,
    breadth,
    volatility: regimeFor(avgAtrPct),
    nextEvent: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      minutesAway: Math.max(0, Math.round((Date.parse(event.startsAt) - Date.now()) / 60_000)),
      importance: event.importance,
    },
  };
}

type Provider = AiInsight['generatedBy'];

function resolveProvider(): Provider {
  if (env.llmProvider === 'anthropic') return 'anthropic';
  if (env.llmProvider === 'openai') return 'openai';
  if (env.llmProvider === 'heuristic') return 'heuristic';
  if (anthropicAvailable()) return 'anthropic';
  if (openaiAvailable()) return 'openai';
  return 'heuristic';
}

/**
 * One headline → one risk breakdown. Any provider failure degrades silently to
 * the deterministic engine so the feed is never empty in a demo or a demo-day.
 *
 * The model providers are asked to answer in `locale`; the heuristic engine is
 * locale-independent because it emits translation keys the client resolves.
 */
async function analyse(
  news: NewsItem,
  context: MarketContext,
  locale: Locale,
): Promise<{ body: LocalizedInsightBody; generatedBy: Provider }> {
  const provider = resolveProvider();
  try {
    if (provider === 'anthropic') {
      return { body: toLocalizedBody(await analyseWithAnthropic(news, context, locale)), generatedBy: 'anthropic' };
    }
    if (provider === 'openai') {
      return { body: toLocalizedBody(await analyseWithOpenAi(news, context, locale)), generatedBy: 'openai' };
    }
  } catch (error) {
    console.warn(`[insights] ${provider} unavailable, using heuristic engine:`, (error as Error).message);
  }
  return { body: analyseWithHeuristics(news, context), generatedBy: 'heuristic' };
}

export async function getInsights(limit = 6, locale: Locale = 'en'): Promise<AiInsight[]> {
  return cache.wrap(`insights:${locale}:${limit}`, 60_000, async () => {
    const context = await getMarketContext();
    const news = getNews(limit);

    return Promise.all(
      news.map(async (item) => {
        const { body, generatedBy } = await analyse(item, context, locale);
        return {
          id: `insight-${item.id}`,
          newsId: item.id,
          headline: item.headline,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          assets: item.assets,
          sentiment: item.sentiment,
          volatility: context.volatility,
          posture: body.posture,
          thesis: body.thesis,
          scenarios: body.scenarios,
          riskControls: body.riskControls,
          invalidation: body.invalidation,
          confidence: Math.round(body.confidence),
          generatedBy,
          generatedAt: new Date().toISOString(),
        } satisfies AiInsight;
      }),
    );
  });
}

export const invalidateInsights = (): void => cache.invalidate('insights:');
