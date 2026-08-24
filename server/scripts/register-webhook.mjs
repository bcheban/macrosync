#!/usr/bin/env node
import 'dotenv/config';

/**
 * Points Telegram at this deployment's webhook.
 *
 * Run once per deployment URL, and again whenever the secret changes.
 *
 *   npm run telegram:webhook --workspace server -- https://your-app.vercel.app
 *
 * The URL argument is optional; `PUBLIC_BASE_URL` is used when it is omitted.
 * Registration is the whole configuration — Telegram stops polling and starts
 * POSTing, so nothing else needs to run for the bot to respond.
 */

const API = 'https://api.telegram.org';
const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const base = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

if (!token) fail('TELEGRAM_BOT_TOKEN is not set.');
if (!base) fail('Pass the deployment URL as an argument, or set PUBLIC_BASE_URL.');
if (!/^https:\/\//.test(base)) fail('Telegram only delivers to https, and only on ports 443, 80, 88 or 8443.');
if (!secret) {
  fail(
    'TELEGRAM_WEBHOOK_SECRET is not set.\n' +
      '  Generate one:  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n' +
      '  Then set it in the environment here AND on the deployment — the endpoint\n' +
      '  rejects every update while it is unset, which is deliberate: the URL is\n' +
      '  public, and this header is what separates Telegram from anyone else.',
  );
}

const url = `${base}/api/telegram/webhook`;

const call = async (method, body) => {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return response.json();
};

const result = await call('setWebhook', {
  url,
  secret_token: secret,
  // Nothing else is acted on, and asking for less means less to validate.
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});

if (!result.ok) fail(`Telegram refused it: ${result.description ?? 'unknown error'}`);
console.log(`✔ Webhook registered: ${url}`);

const info = await call('getWebhookInfo');
const i = info.result ?? {};
console.log(`  pending updates : ${i.pending_update_count ?? 0}`);
console.log(`  custom cert     : ${i.has_custom_certificate ? 'yes' : 'no'}`);
if (i.last_error_message) {
  console.log(`  ⚠ last error    : ${i.last_error_message} (${new Date((i.last_error_date ?? 0) * 1000).toISOString()})`);
}

// The command menu is what makes the bot discoverable; without it people guess.
const menu = await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Subscribe to signal alerts' },
    { command: 'stats', description: 'Win rate and open trades' },
    { command: 'mute', description: 'Two hours of quiet' },
    { command: 'unmute', description: 'Turn alerts back on' },
    { command: 'stop', description: 'Unsubscribe' },
  ],
});
console.log(menu.ok ? '✔ Command menu published' : `⚠ Command menu failed: ${menu.description}`);
