import { env } from '../../config/env.js';
import type { NewsItem } from '../../types/domain.js';
import { cache } from '../../utils/cache.js';
import { FETCHERS, resolveProvider, type NewsProvider } from './providers.js';

let lastProvider: NewsProvider | undefined;
let lastError: string | undefined;
let lastFetchedAt: number | undefined;

export const newsStatus = () => ({
  provider: lastProvider ?? resolveProvider(),
  configured: resolveProvider(),
  feeds: resolveProvider() === 'rss' ? env.newsFeeds.length : null,
  lastError: lastError ?? null,
  lastFetchedAt: lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null,
});

/** Same story from two outlets, or the same outlet twice — keep one. */
function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];

  for (const item of items) {
    // Compare on the first words of the headline: outlets rewrite the tail.
    const fingerprint = item.headline
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .slice(0, 6)
      .join(' ');
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(item);
  }
  return out;
}

/**
 * Current headlines from a real newsroom.
 *
 * Cached for `NEWS_TTL_MS` (five minutes by default) because headlines move far
 * slower than prices and every provider here is rate limited — the cache is
 * what keeps a polling dashboard from becoming a scraper. The previous payload
 * is served if a refresh fails, so a provider blip never empties the feed.
 */
export async function getNews(limit = 8): Promise<NewsItem[]> {
  const provider = resolveProvider();
  const key = `news:${provider}:${limit}`;

  try {
    const items = await cache.wrap(key, env.newsTtlMs, async () => {
      const fetched = await FETCHERS[provider](limit);
      if (!fetched.length) throw new Error(`${provider} returned no articles`);

      lastProvider = provider;
      lastError = undefined;
      lastFetchedAt = Date.now();

      return dedupe(fetched)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, limit);
    });
    return items;
  } catch (error) {
    lastError = (error as Error).message;
    console.warn(`[news] ${provider} failed:`, lastError);

    // Stale headlines beat no headlines; the AI layer still has something real.
    const stale = cache.stale<NewsItem[]>(key);
    if (stale?.length) return stale;
    return [];
  }
}
