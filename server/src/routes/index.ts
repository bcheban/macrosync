import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { ASSET_GROUPS, assetCatalog, isKnownSymbol } from '../data/assets.js';
import { calendarStatus, getUpcomingEvents, getHeadlineEvent } from '../services/calendar.service.js';
import { getNews, newsStatus } from '../services/news/news.service.js';
import { getTickers, upstreamStatus } from '../services/market.service.js';
import { getInsights, getMarketContext, invalidateInsights } from '../services/insight.service.js';
import { getSignals, isStrategy, STRATEGY_PROFILES } from '../services/signal.engine.js';
import { alertsStatus, sendTestAlert } from '../services/telegram/alerts.service.js';
import { telegramStatus } from '../services/telegram/telegram.client.js';
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
    .filter((symbol) => isKnownSymbol(symbol))
    .slice(0, env.maxSymbolsPerRequest);
  /*
   * `undefined`, never an empty array: the caller reads this as "no preference"
   * and falls back to the default watchlist. Returning `[]` would ask the
   * services for nothing and hand the dashboard an empty grid.
   */
  return symbols.length ? symbols : undefined;
};

api.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    market: upstreamStatus(),
    news: newsStatus(),
    calendar: calendarStatus(),
    telegram: { ...telegramStatus(), ...alertsStatus() },
    marketTimeoutMs: env.marketTimeoutMs,
    maxSymbolsPerRequest: env.maxSymbolsPerRequest,
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

api.get(
  '/events',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 8);
    // Low-impact prints are hidden unless asked for; see calendar.service.ts.
    const includeLow = req.query.includeLow === 'true';

    const [page, headline] = await Promise.all([
      getUpcomingEvents({ limit: Number.isFinite(limit) ? limit : 8, includeLow }),
      getHeadlineEvent(),
    ]);

    // `headline` is absent when the feed's week has run out — the dashboard
    // renders that as "nothing scheduled" instead of an empty countdown.
    res.json({ events: page.events, counts: page.counts, ...(headline ? { headline } : {}) });
  }),
);

api.get(
  '/news',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 8);
    res.json({ news: await getNews(Number.isFinite(limit) ? limit : 8) });
  }),
);

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

/**
 * Proves the alert path without waiting for the market. Disabled entirely
 * unless `ALERTS_TEST_SECRET` is configured.
 */
api.post(
  '/alerts/test',
  route(async (req, res) => {
    const provided = typeof req.query.secret === 'string' ? req.query.secret : '';
    if (!env.alertsTestSecret || provided !== env.alertsTestSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const [signals, headline] = await Promise.all([
      getSignals('day', [...env.symbols]),
      getHeadlineEvent(),
    ]);
    res.json(await sendTestAlert(signals, headline));
  }),
);

api.get(
  '/context',
  route(async (_req, res) => {
    res.json(await getMarketContext());
  }),
);
