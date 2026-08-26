#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';

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
 *
 * Note `drop_pending_updates` below: anything sent to the bot before this runs
 * is discarded, not delivered. On a brand-new bot that is a stale queue worth
 * losing — but it also means a /start pressed while the webhook was still
 * unregistered never reaches the handler, and the person is left with a bot
 * that pushes alerts and answers nothing. Tell early testers to send /start
 * again after this, or they will report the bot as half-broken.
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

/*
 * The command menu is what puts the blue Menu button in the chat, and without it
 * people guess. Read from the same file the bot builds its own `/help` from, so
 * the button and the glossary cannot describe different bots.
 */
const specs = JSON.parse(
  await readFile(new URL('../src/data/commands.json', import.meta.url), 'utf8'),
);

const menu = await call('setMyCommands', {
  commands: specs.map((spec) => ({ command: spec.command, description: spec.menu })),
});
console.log(menu.ok ? `✔ Command menu published (${specs.length} commands)` : `⚠ Command menu failed: ${menu.description}`);

// The same list, in the shape @BotFather's /setcommands wants it pasted.
console.log('');
console.log('  To set it by hand instead — @BotFather -> /setcommands -> paste:');
console.log('');
for (const spec of specs) console.log(`  ${spec.command} - ${spec.menu}`);
