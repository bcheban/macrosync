/**
 * Vercel serverless entrypoint for the API.
 *
 * An Express app is already a `(req, res)` handler, so it can be exported
 * directly. It imports the *compiled* server (`server/dist`), which the root
 * build produces before Vercel packages this function — that keeps this file
 * plain JavaScript and avoids asking the platform's bundler to resolve the
 * server's ESM `.js` specifiers back onto TypeScript sources. The `.mjs`
 * extension makes it ESM without forcing `"type": "module"` on the repo root.
 *
 * `vercel.json` rewrites `/api/*` here, and the app answers on both `/api/...`
 * and `/...` so it does not matter whether the platform strips the prefix.
 */
import app from '../server/dist/app.js';

export default app;
