import type { NewsItem, Sentiment } from '../types/domain.js';

/**
 * Mock news feed. Timestamps are relative to "now" so the feed always looks
 * fresh. Replace `getNews()` with a CryptoPanic / NewsAPI / RSS adapter — the
 * AI insight pipeline only depends on the `NewsItem` shape.
 */
interface NewsTemplate extends Omit<NewsItem, 'publishedAt'> {
  minutesAgo: number;
}

const TEMPLATES: NewsTemplate[] = [
  {
    id: 'news-fed-hawkish',
    headline: 'Fed officials signal patience on cuts as services inflation stays sticky',
    summary:
      'Two voting members said in prepared remarks that the committee can "afford to wait", pushing the market-implied cut probability for the next meeting from 68% to 41%.',
    source: 'Reuters',
    url: 'https://www.reuters.com/markets/',
    assets: ['BTC', 'ETH', 'SOL'],
    sentiment: 'bearish',
    sentimentScore: -0.58,
    impact: 82,
    minutesAgo: 24,
  },
  {
    id: 'news-etf-inflows',
    headline: 'Spot BTC ETFs log fourth straight day of net inflows, $611M added',
    summary:
      'Issuer data shows sustained institutional bid, with the largest fund absorbing roughly 5,900 BTC over the stretch — well above daily miner issuance.',
    source: 'Bloomberg',
    url: 'https://www.bloomberg.com/crypto',
    assets: ['BTC', 'ETH'],
    sentiment: 'bullish',
    sentimentScore: 0.64,
    impact: 71,
    minutesAgo: 68,
  },
  {
    id: 'news-senate-hearing',
    headline: 'Senate committee schedules surprise hearing on digital-asset market structure',
    summary:
      'The session was added to the calendar with 48 hours notice. Draft language circulating among staffers touches custody rules and stablecoin reserve disclosure.',
    source: 'The Block',
    url: 'https://www.theblock.co/',
    assets: ['SOL', 'SHIB', 'ETH'],
    sentiment: 'bearish',
    sentimentScore: -0.35,
    impact: 66,
    minutesAgo: 112,
  },
  {
    id: 'news-exchange-outflows',
    headline: 'Exchange balances hit a six-year low as long-term holders keep accumulating',
    summary:
      'On-chain data shows another 18,400 BTC leaving centralised venues this week. Thin exchange float historically amplifies both directions of a macro shock.',
    source: 'Glassnode',
    url: 'https://insights.glassnode.com/',
    assets: ['BTC'],
    sentiment: 'bullish',
    sentimentScore: 0.42,
    impact: 54,
    minutesAgo: 176,
  },
  {
    id: 'news-liquidations',
    headline: '$340M in leveraged positions liquidated during 20-minute volatility spike',
    summary:
      'Perp funding flipped negative across majors after a cascade triggered by a single 900 BTC market sell. Order-book depth is still ~30% below its weekly average.',
    source: 'Coinglass',
    url: 'https://www.coinglass.com/',
    assets: ['BTC', 'ETH', 'SOL', 'SHIB'],
    sentiment: 'bearish',
    sentimentScore: -0.71,
    impact: 88,
    minutesAgo: 9,
  },
  {
    id: 'news-l2-upgrade',
    headline: 'Major L2 ships fee-reduction upgrade; Ethereum blob usage jumps 22%',
    summary:
      'Rollup activity is rotating back onto Ethereum settlement. Fee burn ticked higher for the first time in three weeks.',
    source: 'CoinDesk',
    url: 'https://www.coindesk.com/tech',
    assets: ['ETH'],
    sentiment: 'bullish',
    sentimentScore: 0.38,
    impact: 45,
    minutesAgo: 241,
  },
  {
    id: 'news-memecoin-rotation',
    headline: 'Memecoin volumes rotate back into SHIB as majors consolidate',
    summary:
      'SHIB spot volume is up 61% week-over-week while realised volatility on BTC compresses to a two-month low — a classic late-cycle risk rotation.',
    source: 'Kaiko',
    url: 'https://www.kaiko.com/',
    assets: ['SHIB', 'DOGE'],
    sentiment: 'bullish',
    sentimentScore: 0.29,
    impact: 48,
    minutesAgo: 305,
  },
  {
    id: 'news-tariffs',
    headline: 'New tariff package leaks ahead of G7 statement, risk assets wobble',
    summary:
      'Equity futures and crypto sold off in tandem on the headline. Cross-asset correlation between BTC and the Nasdaq has climbed back above 0.6.',
    source: 'Financial Times',
    url: 'https://www.ft.com/markets',
    assets: ['BTC', 'ETH'],
    sentiment: 'bearish',
    sentimentScore: -0.49,
    impact: 74,
    minutesAgo: 392,
  },
];

export function getNews(limit = 8, from = Date.now()): NewsItem[] {
  return TEMPLATES.map(({ minutesAgo, ...item }) => ({
    ...item,
    publishedAt: new Date(from - minutesAgo * 60_000).toISOString(),
  }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export const sentimentOf = (score: number): Sentiment =>
  score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';
