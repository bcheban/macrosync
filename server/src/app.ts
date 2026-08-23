import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { api } from './routes/index.js';

/**
 * The Express application, with no server attached.
 *
 * Kept separate from `index.ts` so the same app can be run as a long-lived
 * process locally and wrapped as a serverless handler in deployment — the
 * request handling is identical either way.
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  app.use(express.json());

  /*
   * Mounted twice on purpose. Running standalone, requests arrive as
   * `/api/health`. Behind a platform rewrite that maps `/api/*` onto a single
   * function, the prefix may already have been consumed, so the same routes
   * also answer at the root. Matching both keeps one code path for both
   * deployment shapes.
   */
  app.use('/api', api);
  app.use('/', api);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  });

  return app;
}

export const app = createApp();

export default app;
