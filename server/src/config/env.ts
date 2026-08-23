import 'dotenv/config';
import { DEFAULT_SYMBOLS } from '../data/assets.js';

const parseList = (value: string | undefined, fallback: string[]): string[] =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    : fallback;

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  /** Public Binance REST base. No key required for the endpoints we touch. */
  binanceBase: process.env.BINANCE_API_BASE ?? 'https://api.binance.com',
  /** Set to `false` to force the deterministic simulator (useful offline / in CI). */
  useLiveMarketData: (process.env.USE_LIVE_MARKET_DATA ?? 'true') !== 'false',
  marketTimeoutMs: Number(process.env.MARKET_TIMEOUT_MS ?? 4000),

  /** Default watchlist. The client may request any subset of the asset catalog. */
  symbols: parseList(process.env.SYMBOLS, DEFAULT_SYMBOLS),
  /** Upper bound on symbols per request — one kline fetch per symbol adds up. */
  maxSymbolsPerRequest: Number(process.env.MAX_SYMBOLS_PER_REQUEST ?? 16),

  /** LLM placeholder — when no key is present the heuristic risk engine is used. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  llmProvider: (process.env.LLM_PROVIDER ?? 'auto') as 'auto' | 'anthropic' | 'openai' | 'heuristic',
} as const;

export type Env = typeof env;
