import { app } from './app.js';
import { env } from './config/env.js';
import { assetCatalog } from './data/assets.js';

/** Standalone entrypoint: the local dev server and `npm start` in production. */
app.listen(env.port, () => {
  console.log(`\n  ▲ MacroSync API  →  http://localhost:${env.port}/api`);
  console.log(`    market:      MEXC public REST (${env.mexcBase})`);
  console.log(`    universe:    ${assetCatalog().length} assets · default watchlist ${env.symbols.join(', ')}\n`);
});
