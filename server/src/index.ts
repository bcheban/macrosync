import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { assetCatalog } from './data/assets.js';
import { api } from './routes/index.js';

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
app.use(express.json());

app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', detail: error.message });
});

app.listen(env.port, () => {
  console.log(`\n  ▲ MacroSync API  →  http://localhost:${env.port}/api`);
  console.log(`    market data: ${env.useLiveMarketData ? 'Binance public REST (simulator fallback)' : 'simulator'}`);
  console.log(`    universe:    ${assetCatalog().length} assets · default watchlist ${env.symbols.join(', ')}\n`);
});
