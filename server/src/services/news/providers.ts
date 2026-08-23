import { env } from '../../config/env.js';
import type { NewsItem } from '../../types/domain.js';
import { withScore } from './sentiment.js';

export type NewsProvider = 'cryptopanic' | 'cryptocompare' | 'newsdata' | 'rss';

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.newsTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Several newsrooms reject the default fetch agent outright.
        'user-agent': 'MacroSyncBot/1.0 (+https://github.com/bcheban/macrosync)',
        ...headers,
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const fetchJson = async <T>(url: string): Promise<T> => JSON.parse(await fetchText(url)) as T;

/** Strips CDATA, tags and entities from an RSS field. */
function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block: string, name: string): string => {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return match?.[1] ? clean(match[1]) : '';
};

/** Stable id from the article URL, so the same story keeps its identity. */
const idFrom = (url: string, fallback: string): string => {
  const source = url || fallback;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `news-${(hash >>> 0).toString(36)}`;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'rss';
  }
};

/* -------------------------------------------------------------------------- */

/**
 * RSS from real newsrooms — the keyless default.
 *
 * Every hosted crypto-news API now refuses anonymous requests, so this is what
 * makes a fresh, factual feed possible with no configuration. Feeds are read in
 * parallel and merged; one dead feed costs its own items and nothing else.
 */
async function fromRss(): Promise<NewsItem[]> {
  const settled = await Promise.allSettled(
    env.newsFeeds.map(async (feed) => {
      const xml = await fetchText(feed);
      const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];

      return blocks.slice(0, 20).map((block) => {
        const link =
          tag(block, 'link') || /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] || '';
        const published = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
        const parsed = Date.parse(published);
        const headline = tag(block, 'title');

        return withScore({
          id: idFrom(link, headline),
          headline,
          summary: (tag(block, 'description') || tag(block, 'summary')).slice(0, 400),
          source: hostOf(link || feed),
          url: link,
          publishedAt: new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString(),
        });
      });
    }),
  );

  for (const result of settled) {
    if (result.status === 'rejected') {
      console.warn('[news] feed unavailable:', (result.reason as Error)?.message);
    }
  }

  /*
   * Everything the feeds returned, unsorted. Truncating here would pick the
   * "newest" headlines out of whichever feeds happened to resolve first rather
   * than out of all of them; the caller sorts by publication time and cuts.
   */
  return settled
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((item) => item.headline && item.url);
}

interface PanicPost {
  id: number;
  title: string;
  url: string;
  published_at: string;
  source?: { title?: string; domain?: string };
  currencies?: { code: string }[];
}

async function fromCryptoPanic(limit: number): Promise<NewsItem[]> {
  const payload = await fetchJson<{ results?: PanicPost[] }>(
    `https://cryptopanic.com/api/v1/posts/?auth_token=${env.cryptoPanicToken}&public=true&kind=news`,
  );

  return (payload.results ?? []).slice(0, limit * 2).map((post) => {
    const item = withScore({
      id: `news-cp-${post.id}`,
      headline: post.title,
      summary: '',
      source: post.source?.title ?? post.source?.domain ?? 'CryptoPanic',
      url: post.url,
      publishedAt: new Date(post.published_at).toISOString(),
    });
    // The provider's own currency tags beat anything inferred from the text.
    const tagged = (post.currencies ?? []).map((currency) => currency.code.toUpperCase());
    return tagged.length ? { ...item, assets: tagged.slice(0, 5) } : item;
  });
}

interface CompareArticle {
  id: string;
  title: string;
  body: string;
  url: string;
  published_on: number;
  source_info?: { name?: string };
  categories?: string;
}

async function fromCryptoCompare(limit: number): Promise<NewsItem[]> {
  const payload = await fetchJson<{ Data?: CompareArticle[] }>(
    `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&api_key=${env.cryptoCompareKey}`,
  );

  return (payload.Data ?? []).slice(0, limit * 2).map((article) =>
    withScore({
      id: `news-cc-${article.id}`,
      headline: article.title,
      summary: (article.body ?? '').slice(0, 400),
      source: article.source_info?.name ?? 'CryptoCompare',
      url: article.url,
      publishedAt: new Date(article.published_on * 1000).toISOString(),
    }),
  );
}

interface NewsDataArticle {
  article_id: string;
  title: string;
  description?: string;
  link: string;
  pubDate: string;
  source_id?: string;
}

async function fromNewsData(limit: number): Promise<NewsItem[]> {
  const payload = await fetchJson<{ results?: NewsDataArticle[] }>(
    `https://newsdata.io/api/1/news?apikey=${env.newsDataKey}&category=business&q=crypto%20OR%20bitcoin&language=en`,
  );

  return (payload.results ?? []).slice(0, limit * 2).map((article) =>
    withScore({
      id: `news-nd-${article.article_id}`,
      headline: article.title,
      summary: (article.description ?? '').slice(0, 400),
      source: article.source_id ?? 'NewsData',
      url: article.link,
      publishedAt: new Date(article.pubDate.replace(' ', 'T') + 'Z').toISOString(),
    }),
  );
}

/** Whichever provider is configured; RSS needs nothing and is the fallback. */
export function resolveProvider(): NewsProvider {
  if (env.newsProvider !== 'auto') return env.newsProvider;
  if (env.cryptoPanicToken) return 'cryptopanic';
  if (env.cryptoCompareKey) return 'cryptocompare';
  if (env.newsDataKey) return 'newsdata';
  return 'rss';
}

export const FETCHERS: Record<NewsProvider, (limit: number) => Promise<NewsItem[]>> = {
  cryptopanic: fromCryptoPanic,
  cryptocompare: fromCryptoCompare,
  newsdata: fromNewsData,
  rss: () => fromRss(),
};
