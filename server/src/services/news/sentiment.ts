import type { NewsItem, Sentiment } from '../../types/domain.js';
import { assetCatalog } from '../../data/assets.js';

/**
 * Lexicon scoring for real headlines.
 *
 * The fixtures this replaced carried hand-authored sentiment and impact
 * numbers. Live headlines arrive with neither, and the risk layer needs both,
 * so they are derived here — transparently and deterministically, rather than
 * spending an LLM call per headline just to label it.
 *
 * Weights are the vocabulary of market copy, not general English: "surge" and
 * "plunge" are strong, "considers" and "eyes" are noise.
 */
const BULLISH: Record<string, number> = {
  surge: 3, surges: 3, soar: 3, soars: 3, rally: 3, rallies: 3, jump: 2, jumps: 2,
  gain: 2, gains: 2, rise: 2, rises: 2, climb: 2, climbs: 2, up: 1, high: 1,
  record: 2, ath: 3, breakout: 3, adoption: 2, approval: 3, approves: 3, approved: 3,
  inflow: 3, inflows: 3, accumulate: 2, accumulation: 2, bullish: 3, upgrade: 2,
  partnership: 2, launch: 1, launches: 1, integration: 1, buys: 2, buying: 2,
  institutional: 1, etf: 1, treasury: 1, unlock: -1, greenlight: 3, wins: 2,
};

const BEARISH: Record<string, number> = {
  plunge: 3, plunges: 3, crash: 3, crashes: 3, tumble: 3, tumbles: 3, slump: 3,
  drop: 2, drops: 2, fall: 2, falls: 2, decline: 2, declines: 2, down: 1, low: 1,
  selloff: 3, dump: 2, liquidation: 3, liquidations: 3, liquidated: 3,
  hack: 4, hacked: 4, exploit: 4, exploited: 4, breach: 3, stolen: 3, scam: 3,
  lawsuit: 3, sues: 3, sued: 3, charges: 2, fraud: 3, ban: 3, bans: 3, banned: 3,
  crackdown: 3, probe: 2, investigation: 2, subpoena: 2, fine: 2, fined: 2,
  outflow: 3, outflows: 3, bearish: 3, warns: 2, warning: 2, risk: 1, fear: 2,
  bankruptcy: 4, insolvent: 4, collapse: 4, halt: 2, halts: 2, delisting: 3,
};

/** Words that mean the market is likely to actually move on this. */
const HIGH_IMPACT = [
  'fed', 'fomc', 'cpi', 'inflation', 'rate', 'sec', 'etf', 'treasury', 'regulation',
  'hack', 'exploit', 'liquidation', 'bankruptcy', 'lawsuit', 'ban', 'halving',
  'blackrock', 'microstrategy', 'tether', 'binance', 'coinbase', 'whale',
];

const BASES = assetCatalog().map((asset) => asset.base);

/** Extra tickers worth spotting that are not in the tradable catalogue. */
const ALIASES: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  ether: 'ETH',
  solana: 'SOL',
  ripple: 'XRP',
  dogecoin: 'DOGE',
  cardano: 'ADA',
  polkadot: 'DOT',
  chainlink: 'LINK',
  avalanche: 'AVAX',
  litecoin: 'LTC',
  shiba: 'SHIB',
  pepe: 'PEPE',
  tron: 'TRX',
  hedera: 'HBAR',
  stellar: 'XLM',
  cosmos: 'ATOM',
  aptos: 'APT',
  arbitrum: 'ARB',
  optimism: 'OP',
  uniswap: 'UNI',
  aave: 'AAVE',
  injective: 'INJ',
  bittensor: 'TAO',
  sui: 'SUI',
  near: 'NEAR',
};

const words = (text: string): string[] => text.toLowerCase().match(/[a-z]+/g) ?? [];

export interface Scored {
  sentiment: Sentiment;
  sentimentScore: number;
  impact: number;
  assets: string[];
}

/** Assets a headline is about, by ticker or by project name. */
export function detectAssets(text: string): string[] {
  const found = new Set<string>();
  const upper = text.toUpperCase();

  for (const base of BASES) {
    // Word boundaries: "OP" must not match "OPEN", "APT" must not match "ADAPT".
    if (new RegExp(`\\b${base}\\b`).test(upper)) found.add(base);
  }
  for (const [name, base] of Object.entries(ALIASES)) {
    if (text.toLowerCase().includes(name)) found.add(base);
  }
  return [...found].slice(0, 5);
}

/**
 * Scores one headline. `title` carries far more signal than the body, so it is
 * weighted double.
 */
export function scoreHeadline(title: string, body = ''): Scored {
  const titleWords = words(title);
  const bodyWords = words(body).slice(0, 120);

  let raw = 0;
  const tally = (list: string[], weight: number) => {
    for (const word of list) {
      raw += (BULLISH[word] ?? 0) * weight;
      raw -= (BEARISH[word] ?? 0) * weight;
    }
  };
  tally(titleWords, 2);
  tally(bodyWords, 1);

  // tanh keeps a headline stuffed with adjectives from pinning the scale.
  const sentimentScore = Number(Math.tanh(raw / 8).toFixed(2));
  const sentiment: Sentiment =
    sentimentScore > 0.15 ? 'bullish' : sentimentScore < -0.15 ? 'bearish' : 'neutral';

  const haystack = `${title} ${body}`.toLowerCase();
  const hits = HIGH_IMPACT.filter((term) => haystack.includes(term)).length;
  const impact = Math.max(
    18,
    Math.min(96, Math.round(28 + hits * 14 + Math.abs(sentimentScore) * 30)),
  );

  return { sentiment, sentimentScore, impact, assets: detectAssets(`${title} ${body}`) };
}

/** Applies the scoring to a partially built item. */
export const withScore = (
  item: Omit<NewsItem, 'sentiment' | 'sentimentScore' | 'impact' | 'assets'>,
): NewsItem => ({ ...item, ...scoreHeadline(item.headline, item.summary) });
