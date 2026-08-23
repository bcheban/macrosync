import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { ASSET_GROUPS, assetCatalog, isKnownSymbol } from '../data/assets.js';
import { getUpcomingEvents, getHeadlineEvent } from '../data/calendar.js';
import { getNews } from '../data/news.js';
import { getTickers } from '../services/market.service.js';
import { getInsights, getMarketContext, invalidateInsights } from '../services/insight.service.js';
import { getSignals, isStrategy, STRATEGY_PROFILES } from '../services/signal.engine.js';
import type { Locale } from '../types/domain.js';

export const api = Router();

/** Wraps an async handler so rejections reach the error middleware. */
const route =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: (error?: unknown) => void) => {
    handler(req, res).catch(next);
  };

const LOCALES: Locale[] = ['en', 'uk'];

/** `?lang=uk` — only ever used to pick the language the LLM writes in. */
const parseLocale = (req: Request): Locale => {
  const raw = typeof req.query.lang === 'string' ? req.query.lang.slice(0, 2).toLowerCase() : '';
  return (LOCALES as string[]).includes(raw) ? (raw as Locale) : 'en';
};

/**
 * `?symbols=BTCUSDT,ETHUSDT` — unknown tickers are dropped rather than passed
 * upstream, and the list is capped because each symbol costs one kline fetch.
 */
const parseSymbols = (req: Request): string[] | undefined => {
  const raw = req.query.symbols;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const symbols = raw
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => isKnownSymbol(symbol));
  return symbols.length ? symbols.slice(0, env.maxSymbolsPerRequest) : undefined;
};

api.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    liveMarketData: env.useLiveMarketData,
    symbols: env.symbols,
    universe: assetCatalog().length,
    locales: LOCALES,
    time: new Date().toISOString(),
  });
});

/** The tradable universe the dashboard's asset switcher is built from. */
api.get('/assets', (_req, res) => {
  res.json({
    assets: assetCatalog(),
    groups: ASSET_GROUPS,
    defaults: env.symbols,
    maxPerRequest: env.maxSymbolsPerRequest,
  });
});

api.get(
  '/market/tickers',
  route(async (req, res) => {
    res.json({ tickers: await getTickers(parseSymbols(req) ?? [...env.symbols]) });
  }),
);

api.get('/strategies', (_req, res) => {
  res.json({
    strategies: Object.values(STRATEGY_PROFILES).map(({ strategy, label, timeframe, rewardRatio, stopAtr }) => ({
      strategy,
      label,
      timeframe,
      rewardRatio,
      stopAtr,
    })),
  });
});

api.get(
  '/signals',
  route(async (req, res) => {
    const raw = typeof req.query.strategy === 'string' ? req.query.strategy : '';
    if (raw && !isStrategy(raw)) {
      res.status(400).json({ error: `Unknown strategy "${raw}"` });
      return;
    }
    const strategy = isStrategy(raw) ? raw : undefined;
    res.json({ signals: await getSignals(strategy, parseSymbols(req) ?? [...env.symbols]) });
  }),
);

api.get('/events', (req, res) => {
  const limit = Number(req.query.limit ?? 8);
  res.json({ events: getUpcomingEvents(Number.isFinite(limit) ? limit : 8), headline: getHeadlineEvent() });
});

api.get('/news', (req, res) => {
  const limit = Number(req.query.limit ?? 8);
  res.json({ news: getNews(Number.isFinite(limit) ? limit : 8) });
});

api.get(
  '/insights',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 6);
    res.json({
      insights: await getInsights(Number.isFinite(limit) ? limit : 6, parseLocale(req)),
      context: await getMarketContext(),
    });
  }),
);

/** Forces a fresh pass through the LLM layer (handy while tuning prompts). */
api.post(
  '/insights/refresh',
  route(async (req, res) => {
    invalidateInsights();
    res.json({ insights: await getInsights(6, parseLocale(req)), context: await getMarketContext() });
  }),
);

api.get(
  '/context',
  route(async (_req, res) => {
    res.json(await getMarketContext());
  }),
);
