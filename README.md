<div align="center">

# MacroSync

### Macro-Synced Signal &amp; Risk Terminal

**Technical analysis breaks when the news hits.** Indicators only describe what already
happened, so they are structurally blind to a rate decision that lands in forty minutes.
MacroSync keeps the chart in sync with the macro calendar.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=for-the-badge)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white&style=for-the-badge)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white&style=for-the-badge)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white&style=for-the-badge)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.19+-5FA04E?logo=nodedotjs&logoColor=white&style=for-the-badge)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white&style=for-the-badge)](https://expressjs.com)
[![Upstash Redis](https://img.shields.io/badge/Upstash-Redis-00E9A3?logo=upstash&logoColor=white&style=for-the-badge)](https://upstash.com)
[![Telegram](https://img.shields.io/badge/Telegram-Bot_API-229ED9?logo=telegram&logoColor=white&style=for-the-badge)](https://core.telegram.org/bots/api)
[![Tests](https://img.shields.io/badge/tests-50_passing-3FB950?logo=nodedotjs&logoColor=white&style=for-the-badge)](#tech-stack)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white&style=for-the-badge)](https://vercel.com)

</div>

---

## What it does

1. **Strategy Signals** — technical setups computed live from MEXC candles, separated by
   Scalping (5m), Day Trading (1h) and Swing (4h), narrowable to any single asset. Each card
   states one verdict — BUY, SELL or WAIT — and one sentence explaining it.
2. **News Countdown Radar** — a hero timer ticking down to the next macro or political catalyst,
   with the expected impact and an explicit warning when a setup's horizon overlaps the release.
3. **AI Actionable Insights** — headlines translated by an LLM into *risk-management scenarios*
   rather than trade calls. The model is instructed never to say buy or sell; it outputs
   conditional posture: `Bearish tone + high volatility → tighten stops to 0.8× ATR, cut size 50%,
   no new leveraged longs until the print clears.`
4. **An autonomous Telegram bot** — a scheduled scan sweeps the liquid MEXC board on rotation,
   broadcasts confirmed calls to anyone who sent `/start`, and keeps a ledger of every one it
   published. When a call reaches its target or its stop the channel is told, and the running win
   rate is the record of what it got right. The open trades appear on the dashboard too, grouped
   by strategy and one tap from their chart.

Everything on the screen is live: prices and candles from **MEXC**, headlines from real newsrooms,
indicators computed from those candles. Three cross-cutting features shape the product: an asset
switcher spanning a **curated 28 plus every liquid pair the scanner reaches**, which re-scopes
every panel at once; **prices straight from the exchange socket**; and full **English / Ukrainian
localization** — down to the sentences the signal engine and the AI risk layer generate.

---

## Tech stack

### Frontend

<img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" align="left" height="24" /> &nbsp;
Renders the whole dashboard. Everything is a function component driven by hooks — there is no
class component and no external state library; shared state lives in one small context
(`AssetScope`) and everything else is local or derived.

<br />

<img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" align="left" height="24" /> &nbsp;
The API contract. `types/domain.ts` is mirrored between server and client, so a change to a
payload shape breaks the build on both sides rather than at runtime. Locale files are typed too:
a missing translation key is a compile error, not a `[missing]` string in the UI.

<br />

<img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" align="left" height="24" /> &nbsp;
Dev server and production bundler. It also hosts a small custom plugin (`web/vite/seo.ts`) that
generates `robots.txt` and `sitemap.xml` at build time and injects absolute canonical URLs into
the HTML.

<br />

<img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" align="left" height="24" /> &nbsp;
The entire design system, with no config file — tokens live in `@theme` inside `index.css`, and
the glassmorphism primitives (`glass`, `glass-overlay`, `edge-light`) are custom `@utility`
rules. Breakpoint prefixes carry all the responsive behaviour.

<br />

<img src="https://img.shields.io/badge/Framer_Motion-12-0055FF?logo=framer&logoColor=white" align="left" height="24" /> &nbsp;
Motion that carries meaning: the shared-element `layoutId` pill on every tab strip, the
digit-roll on the countdown, card entrance/exit in the signal grid, and the mobile sheet's
slide-over. All of it collapses under `prefers-reduced-motion`.

<br />

<img src="https://img.shields.io/badge/i18next-25-26A69A?logo=i18next&logoColor=white" align="left" height="24" /> &nbsp;
English and Ukrainian, including *generated* copy. The deterministic engines emit translation
keys with parameters rather than sentences, so signal rationale and risk scenarios are
translated client-side; the LLM is simply asked to answer in the active language.

<br />

<img src="https://img.shields.io/badge/Lucide-icons-F56565?logo=lucide&logoColor=white" align="left" height="24" /> &nbsp;
Every icon in the interface. Tree-shaken per import, so only the ~25 glyphs actually used reach
the bundle.

### Backend

<img src="https://img.shields.io/badge/Node.js-20.19+-5FA04E?logo=nodedotjs&logoColor=white" align="left" height="24" /> &nbsp;
The runtime for the API — ESM throughout. It runs as a long-lived process locally and as a
serverless function in deployment, from the same source.

<br />

<img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" align="left" height="24" /> &nbsp;
The HTTP layer: nine routes, one router. The app is exported without a listener
(`server/src/app.ts`) precisely so the same instance can be wrapped as a serverless handler.

<br />

<img src="https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white" align="left" height="24" /> &nbsp;
Schema for the LLM's structured output. The model is bound to it, so the risk breakdown arrives
already shaped — the route never parses prose or guards against a malformed field.

<br />

<img src="https://img.shields.io/badge/MEXC-market_data-1972F5?logoColor=white" align="left" height="24" /> &nbsp;
The single source of price truth, used twice. The server pulls candles and 24h stats over REST to
compute indicators; the browser subscribes to MEXC's `miniTicker` stream directly, so the number on
screen is the exchange's own, to the last decimal. No key, and no invented data if it is down.

<br />

<img src="https://img.shields.io/badge/Claude-Opus_5-D97757?logo=anthropic&logoColor=white" align="left" height="24" /> &nbsp;
The risk analyst. Given a headline plus the live volatility regime it returns posture, scenarios,
controls and an invalidation — never a direction. Swappable for OpenAI, and a deterministic rule
engine covers the no-key case with the identical contract.

### Tooling

<img src="https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white" align="left" height="24" /> &nbsp;
Two packages (`server`, `web`) under one lockfile, so a single `npm ci` reproduces the whole
toolchain and the shared domain contract stays in step.

<br />

<img src="https://img.shields.io/badge/Vercel-serverless-000000?logo=vercel&logoColor=white" align="left" height="24" /> &nbsp;
One project hosts both halves: static output for the dashboard, the Express app as a function on
`/api` of the same origin — no second host, no CORS, no API base URL to configure.

<br />

<img src="https://img.shields.io/badge/Upstash-Redis-00E9A3?logo=upstash&logoColor=white" align="left" height="24" /> &nbsp;
The little state that must outlive a serverless invocation: who is subscribed, which alerts have
gone out, which trades are open, and where the radar's cursor is. Over Upstash's REST API rather
than a TCP client — there is no connection to keep warm in a function that may be cold on every
request. Falls back to an in-memory map when unconfigured, so a local run and an un-provisioned
deploy still work; they simply forget between invocations.

<br />

<img src="https://img.shields.io/badge/node:test-50_tests-5FA04E?logo=nodedotjs&logoColor=white" align="left" height="24" /> &nbsp;
The trade ledger, the radar's rotation, the alert dispatch path and the level arithmetic, under test
with **zero added dependencies** — Node's own runner, executed directly through `tsx`. These are the
parts where a quiet bug is actively misleading rather than merely broken, and several of the cases
in there exist because they caught something: a failed send starting a 90-minute silence, an owner
who could never be unsubscribed, a short priced with a target below zero.

<br />

<img src="https://img.shields.io/badge/GA4-analytics-E37400?logo=googleanalytics&logoColor=white" align="left" height="24" /> &nbsp;
Product analytics, injected on idle after first paint so it never competes with the app bundle,
and skipped entirely when unconfigured or when the browser sends Do Not Track.

<br />

<img src="https://img.shields.io/badge/Telegram-Bot_API-229ED9?logo=telegram&logoColor=white" align="left" height="24" /> &nbsp;
A two-way bot over plain `fetch` — no SDK. Outbound, it broadcasts confirmed calls to a subscriber
roster behind a transition check and a per-asset cooldown, so a score flapping across its threshold
cannot spam the channel while a genuine reversal still goes out immediately. Inbound, a webhook
handles `/start`, mutes and inline buttons, verified by the `secret_token` Telegram echoes on every
call.

---

## Quick start

```bash
# from the repo root — npm workspaces install both apps
npm install

# optional: configure the API (works fine with zero configuration)
cp server/.env.example server/.env          # PowerShell: Copy-Item server\.env.example server\.env

# run the Express API (:4000) and the Vite dev server (:5173) together
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` → `http://localhost:4000`, so there is no
CORS setup to do in development.

No API keys are required. Without them the dashboard runs on live MEXC market data, real newsroom
RSS and the built-in deterministic risk engine. Keys only add the LLM risk analyst, a hosted news
provider and Telegram alerts.

### Other scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Both apps, colour-tagged output                       |
| `npm run dev:server`| API only                                              |
| `npm run dev:web`   | Dashboard only                                        |
| `npm run build`     | Type-checked production build of both workspaces      |
| `npm start`         | Run the compiled API from `server/dist`               |
| `npm run typecheck` | `tsc --noEmit` across both workspaces                 |
| `npm test`          | The server test suite — Node's runner through `tsx`    |
| `npm run telegram:webhook --workspace server -- <url>` | Points Telegram at a deployment and publishes the command menu |
| `npm run og:image --workspace web` | Re-renders the social card from `web/scripts/og-image.html` |

---

## Configuration

Everything lives in `server/.env` (see `server/.env.example`). Every value has a sane default.

| Variable                | Default                 | Notes                                                       |
| ----------------------- | ----------------------- | ----------------------------------------------------------- |
| `PORT`                  | `4000`                  | API port                                                    |
| `CORS_ORIGIN`           | `http://localhost:5173` | Comma-separated list, or `*`                                |
| `SYMBOLS`               | 8 majors + SHIB         | Default watchlist, drawn from the asset catalogue           |
| `MAX_SYMBOLS_PER_REQUEST` | `16`                  | Cap per request — one kline fetch per symbol                |
| `MEXC_API_BASE`         | `https://api.mexc.com`  | Public market data, no key                                  |
| `MARKET_CONCURRENCY`    | `6`                     | Parallel upstream calls — public endpoints are rate limited  |
| `UPSTREAM_COOLDOWN_MS`  | `20000`                 | Skip upstream for this long after a failure                 |
| `RATE_LIMIT_COOLDOWN_MS`| `60000`                 | Longer pause when MEXC answers 429/418                      |
| `NEWS_PROVIDER`         | `auto`                  | `cryptopanic` · `cryptocompare` · `newsdata` · `rss`         |
| `TELEGRAM_BOT_TOKEN`    | —                       | Enables signal alerts — see *Telegram alerts*                |
| `TELEGRAM_CHAT_ID`      | —                       | Where alerts are posted                                     |
| `TELEGRAM_COOLDOWN_MS`  | `5400000`               | Quiet period per asset; reversals ignore it                 |
| `CRON_SECRET`           | —                       | Guards `/api/cron/signals`; the route 404s while unset       |
| `CRON_STRATEGIES`       | all three               | Which strategies the scheduled run evaluates                |
| `RADAR_ENABLED`         | `true`                  | Scan the exchange rather than the dashboard's asset list     |
| `RADAR_UNIVERSE_SIZE`   | `150`                   | Cap on the volume-ranked universe                            |
| `RADAR_MIN_VOLUME_USD`  | `1000000`               | Liquidity floor; usually binds before the cap                |
| `RADAR_BATCH_SIZE`      | `18`                    | Pairs evaluated per run; the cursor sweeps the rest          |
| `RADAR_UNIVERSE_TTL_MS` | `21600000`              | How long a ranking is reused before rebuilding               |
| `ALERTS_MAX_PER_RUN`    | `4`                     | Budget for the whole run; lowest conviction is dropped first |
| `ALERTS_SEND_GAP_MS`    | `1200`                  | Pacing, to stay under Telegram's per-chat rate limit         |
| `ALERTS_SEND_RETRIES`   | `3`                     | Attempts before a message is abandoned for the run           |
| `TELEGRAM_WEBHOOK_SECRET` | —                     | Guards `/api/telegram/webhook`; the route 404s while unset    |
| `PUBLIC_BASE_URL`       | —                       | Where Telegram delivers, for the registration script          |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | —        | Upstash Redis; injected by the Vercel integration           |
| `ALERTS_TEST_SECRET`    | —                       | Guards `/api/alerts/test`                                   |
| `LLM_PROVIDER`          | `auto`                  | `auto` · `anthropic` · `openai` · `heuristic`                |
| `ANTHROPIC_API_KEY`     | —                       | Enables the Claude risk analyst                             |
| `ANTHROPIC_MODEL`       | `claude-opus-5`         |                                                             |
| `OPENAI_API_KEY`        | —                       | Alternative provider                                        |

The dashboard has its own configuration in `web/.env` (see `web/.env.example`):

| Variable                 | Default                | Notes                                                           |
| ------------------------ | ---------------------- | --------------------------------------------------------------- |
| `VITE_SITE_URL`          | `https://macrosync.io` | Absolute origin — canonical URLs, OG tags, sitemap, `hreflang`   |
| `VITE_GA_MEASUREMENT_ID` | —                      | GA4 id, e.g. `G-XXXXXXXXXX`. Empty disables analytics completely |
| `VITE_TELEGRAM_BOT_URL`  | —                      | Link for the alert CTA; the button hides while unset             |
| `VITE_API_BASE`          | `/api`                 | Set when the API is on another origin                            |

**If the exchange is unreachable** the API returns nothing rather than inventing prices — there is
no simulated fallback. The header says `Exchange unreachable` and `GET /api/health` reports the last
upstream error and how long the cooldown has left. Note that MEXC, like most exchanges, restricts
some jurisdictions: a deploy in a blocked region will see this even though the code is fine, which
is why the API function is pinned to `fra1` in `vercel.json`.

---

## API

| Method | Route                          | Returns                                                    |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/health`                  | Upstream, store, radar, bot roster, trade ledger, cron runs |
| GET    | `/api/assets`                  | Curated catalogue **plus** the radar's pairs — the switcher |
| GET    | `/api/market/tickers`          | 24h stats + 48-point sparkline per symbol                  |
| GET    | `/api/strategies`              | Strategy definitions (timeframe, stop multiple, R:R)       |
| GET    | `/api/signals?strategy=day`    | Signals; omit `strategy` for all three                     |
| GET    | `/api/events?limit=6`          | Upcoming calendar + the `headline` event for the countdown |
| GET    | `/api/news?limit=8`            | Raw news feed                                              |
| GET    | `/api/insights?limit=6&lang=uk`| AI risk breakdowns + market context                        |
| POST   | `/api/insights/refresh`        | Busts the insight cache and regenerates                    |
| GET    | `/api/context`                 | Volatility regime, breadth, next event                     |
| GET    | `/api/signals/active`          | Open trades from the ledger, priced — the Live Trades card |
| POST   | `/api/cron/signals`            | The scheduled scan. `Bearer $CRON_SECRET`; 404s while unset |
| POST   | `/api/telegram/webhook`        | Telegram updates. Guarded by `secret_token`; 404s while unset |
| POST   | `/api/alerts/test`             | Sends one real signal to prove the path. `?secret=`        |

The last three **404 rather than 401 while their secret is unset** — an unconfigured deploy denies
that they exist at all, so nothing is triggerable by anyone who reads the source.

`/api/market/tickers` and `/api/signals` both accept `?symbols=BTCUSDT,ETHUSDT`, validated against
the curated catalogue *and* whatever the radar currently covers — so a coin the scan found can be
charted, while anything the exchange does not list is still dropped. The list is capped at
`MAX_SYMBOLS_PER_REQUEST`. `?lang=en|uk` on `/api/insights` only selects the language the **model**
writes in; see *Localization* below.

---

## How the pieces work

### Signal engine — `server/src/services/signal.engine.ts`

Each strategy is a profile (timeframe, EMA pair, RSI period, ATR stop multiple, reward ratio,
base risk). For every symbol the engine pulls 180 candles and blends four independent reads into
a score in `[-100, 100]`:

| Component        | Weight cap | Reads                                       |
| ---------------- | ---------- | ------------------------------------------- |
| Trend            | ±40        | EMA fast vs. EMA slow spread                |
| Momentum         | ±30        | MACD histogram as a share of price          |
| Mean reversion   | ±20        | RSI distance from 50 (pushes *against*)     |
| Participation    | ±18        | Volume vs. its 20-bar average               |

Above the profile's threshold the signal becomes directional; below it, `No edge`. Stops are ATR
multiples (never fixed percentages), targets are a multiple of the risk taken, and the suggested
position risk shrinks as ATR expands. Each card shows the three strongest components as plain
sentences, so a trader can see *why* a signal fired.

If a high-impact calendar event falls inside the strategy's holding horizon, the signal carries an
`eventWarning` — this is the connective tissue between the technical and news halves of the app.

### Countdown radar — `server/src/services/calendar.service.ts`

Real prints from ForexFactory's public weekly feed: dates, impact ratings,
forecasts and prior readings, none of them inferred.

This replaced a fixture that computed dates by rolling an anchor forward and — worse — carried
hand-written `forecast` and `previous` values. A trading dashboard stating "Forecast 4.00%–4.25%"
as fact when nobody published that number is the most damaging kind of wrong, so the rule here is
that anything the feed does not supply is simply absent: no description prose, no list of "affected
assets", no forecast the market has not made.

Events are keyed by a slug of the print's name (`core-pce-price-index-m-m`) so ids survive the
feed's weekly rollover and translations stay attached; `uk.ts` translates the recurring indicators
and anything else falls back to the feed's own wording. The feed covers one rolling week, so late
in the week the queue runs short — the hero then renders an explicit "nothing scheduled" state
rather than an empty countdown.

### AI risk layer — `server/src/services/insight.service.ts`

```
news item + market context ──► provider ──► { posture, thesis, scenarios[], riskControls[], invalidation, confidence }
                                  │
                    anthropic ────┤ structured outputs (Zod schema, guaranteed shape)
                    openai ───────┤ JSON mode
                    heuristic ────┘ deterministic rules — always available, no key needed
```

The system prompt (`server/src/services/llm/prompt.ts`) forbids directional advice and requires
every scenario to be *conditional*: a market condition paired with a defensive response. The
heuristic engine follows the same contract, so the product behaves identically with or without a
key — and any provider failure degrades silently instead of emptying the feed.

### Market data — MEXC

Prices, candles and 24h statistics all come from MEXC's public API. Two paths, on purpose:

- **Server, REST** — `/api/v3/klines` feeds the indicator engine and `/api/v3/ticker/24hr` the
  watchlist. Requests go through a concurrency gate (sixteen tracked symbols would otherwise mean
  sixteen simultaneous calls), a TTL cache that de-duplicates concurrent callers, and a circuit
  breaker that treats an explicit 429/418 as a longer ban than an ordinary failure.
- **Browser, WebSocket** — `useLivePrices` subscribes to `spot@public.miniTicker.v3.api.pb`
  directly. A REST snapshot behind a ten-second cache cannot match an exchange tick for tick; this
  can, and it also means the price is right regardless of what the server can reach.

Two things worth knowing if you touch this code:

- **MEXC's interval codes are not Binance's.** The hourly bar is `60m`; `1h` is rejected with
  `-1121 Invalid interval`.
- **`priceChangePercent` is a fraction.** MEXC returns `0.0014` where other exchanges return
  `0.14`. Rendering it raw shows every asset as flat.
- **The websocket is protobuf only.** Every `spot@public.*.v3.api@…` JSON channel is now rejected;
  only the `.pb` variants push data. Rather than ship a schema compiler for one message,
  `lib/mexc-stream.ts` walks the wire format and reads the four fields it needs by number — the
  layout is documented in that file, confirmed against the live socket.
- The socket's own `rate` field is computed over a different window than REST's
  `priceChangePercent`, so only the price is taken from it; the 24h change is recomputed against
  the REST open, which keeps it reconciled with what MEXC's own ticker shows.

**There is no simulated fallback.** If the exchange is unreachable the API returns nothing and the
header says so, because a dashboard that invents a plausible price is worse than one that admits it
has none. `GET /api/health` reports the last upstream error and how long the cooldown has left.

### News — real newsrooms

Headlines come from a live feed and the AI risk layer processes nothing else. Providers are
resolved in order of what is configured: CryptoPanic → CryptoCompare → NewsData.io → RSS.

RSS is the default because it is the only one left that works without an account — CryptoPanic
answers 403 to anonymous requests, CryptoCompare/CoinDesk 401, and CoinGecko's news endpoint is
PRO-only. Four newsrooms are read in parallel (Cointelegraph, Decrypt, The Block, CoinDesk), merged,
de-duplicated by headline fingerprint, and sorted by publication time. One dead feed costs its own
items and nothing else.

Live headlines arrive with no sentiment or impact attached, and the risk engine needs both, so
`services/news/sentiment.ts` derives them from a market-vocabulary lexicon — transparent and
deterministic, rather than spending a model call per headline just to label it. Asset detection
matches tickers **case-sensitively**: several are ordinary English words, and matching loosely
tagged "Bitcoin near current levels" as a NEAR story.

Headlines are cached for five minutes, and a failed refresh serves the previous payload rather than
emptying the feed.

### Autonomous alerts — `/api/cron/signals`

Alerting used to hang off the signal read path, which meant the bot only spoke while somebody had
the dashboard open — on serverless, nothing runs between requests. A scheduled endpoint owns it now:

1. recompute every tracked strategy and alert on calls that just confirmed
2. settle any open trade that reached its target or its stop, and announce it

It is **idempotent**: running it twice in a row sends nothing the second time, because the alert
guards and the trade ledger both live in the store. Strategies are evaluated sequentially on
purpose — all three across a whole batch in parallel is exactly the burst MEXC rate limits.

```bash
curl -X POST "https://your-app.vercel.app/api/cron/signals"   -H "Authorization: Bearer $CRON_SECRET"
```

```jsonc
{ "ok": true,
  "scanned": ["BTC", "ETH", "SOL", "XRP", "PUMP", "TRUMP", "BNB", "PYTH", "..."],
  "radar": { "offset": 0, "universeSize": 61, "runsPerSweep": 4 },
  "evaluated": { "scalping": 18, "day": 18, "swing": 18 },
  "alerts": { "sent": 2, "failed": 0, "dropped": 0 },
  "closed": [], "open": 3, "winRate": 0, "tookMs": 3412 }
```

The route 404s while `CRON_SECRET` is unset, so an unconfigured deploy cannot be triggered by
anyone who reads the source.

#### Global radar — `server/src/services/radar/`

The scan deliberately does **not** follow the dashboard's asset list. That list is one person's
choice of what to watch; the scheduled run has no person attached to it, and tying the two together
capped the bot at eight coins. With a ninety-minute quiet period per pair, eight coins is a channel
that falls silent within the hour — which is exactly what happened.

So the radar asks the exchange what exists. One request returns all ~2,100 pairs MEXC quotes; they
are filtered to spot USDT markets, ranked by 24h turnover, and swept a batch at a time with a cursor
in Redis carrying over between runs. Consecutive five-minute runs add up to a full sweep.

Three filters decide what is a market rather than noise:

| Filter | Removes | Why |
| --- | --- | --- |
| Shape | Leveraged tokens (`BTC3L`), non-USDT pairs | A derivative of a pair is not a market |
| Peg | Anything sitting at $1.00 that moved under 1% all day | Catches dollar tokens no name list knows |
| Liquidity | Turnover below `RADAR_MIN_VOLUME_USD` | Below roughly $1M/day the spread can exceed the edge |

The floor is the one that binds. MEXC lists about 1,700 tradable USDT pairs but only ~60 turn over
$1M a day, so `RADAR_UNIVERSE_SIZE=150` is a ceiling that is rarely reached. Lowering the floor
widens the net into thinner markets — a deliberate trade, not an oversight.

At 18 pairs per run a full sweep takes four runs, so a five-minute schedule covers the whole board
every twenty minutes and each run finishes in three to four seconds.

#### Subscribers — `server/src/services/telegram/subscribers.service.ts`

The bot posts to a roster, not to a chat id. Anyone who sends `/start` is added to a Redis set and
receives every subsequent call; `TELEGRAM_CHAT_ID` is still honoured, seeded into that roster **once**
so a fresh deploy alerts its operator before anybody has subscribed.

Seeding once rather than merging the owner in on every read is the whole subtlety. Injecting them at
send time made the owner the one recipient who could never be removed — if they blocked the bot,
every run would keep trying to reach them, for ever.

Each recipient is isolated during a broadcast. One person blocking the bot cannot cost the rest of
the roster their alert: Telegram's `403 bot was blocked` (and `chat not found`, and `user is
deactivated`) drops that chat from the set and the loop carries on. That is attrition, not a fault,
so it is not counted as a delivery failure — recording it as one would make a healthy roster look
broken.

| Command | Effect |
| --- | --- |
| `/start` | Subscribe. Also lifts a mute — starting again reads as "talk to me" |
| `/stats` | Win rate, record and open trades |
| `/mute` · 🛑 button | Two hours of quiet for that one person |
| `/unmute` | Lift it early |
| `/stop` | Unsubscribe |

Mutes are per-recipient and stored as a key with a TTL, so Redis expiring it *is* the unmute — there
is nothing scheduled and nothing to clean up. A muted subscriber is skipped, never dropped.

A call still opens a trade when every subscriber is muted. Muting a phone is a delivery preference,
not a change to the call, and letting it stop the ledger would leave the win rate with holes wherever
the only subscriber wanted an evening off.

#### Webhook — `POST /api/telegram/webhook`

Telegram delivers updates by POSTing to a public URL, so the endpoint is reachable by anyone who
guesses it. `setWebhook` accepts a `secret_token` which Telegram then echoes in
`X-Telegram-Bot-Api-Secret-Token` on every call, and checking that header is the only thing between
this handler and a stranger forging subscriptions or button presses. **The route 404s while
`TELEGRAM_WEBHOOK_SECRET` is unset** rather than running open.

It answers 200 to everything it accepts, whatever happened inside: Telegram redelivers a non-200, and
an update that fails once fails identically every time — so an error here becomes a retry loop rather
than a fix.

Registering it:

```bash
# 1. Generate a secret and set it in BOTH places
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
vercel env add TELEGRAM_WEBHOOK_SECRET production

# 2. Point Telegram at the deployment (also publishes the command menu)
npm run telegram:webhook --workspace server -- https://your-app.vercel.app
```

The script prints `getWebhookInfo` afterwards, including `last_error_message` — which is where a
wrong URL or a secret that only got set locally shows up.

#### Delivery — `server/src/services/telegram/`

A notifier that fails quietly is worse than one that fails loudly, and this one used to do the
former in two ways, both now fixed and both covered by tests:

- **State was committed before the send.** A rejected message still started the pair's ninety-minute
  quiet period, so nothing arrived and nothing retried. State is now written only after Telegram
  confirms delivery; a failure leaves the pair eligible on the next run.
- **Only the HTTP status was checked.** The Bot API can answer `200` with `{"ok": false}`, which was
  counted as delivered — a message nobody received, with a trade opened against it. The body is now
  authoritative.

Rate limits are honoured rather than absorbed: a `429` is retried after the delay Telegram itself
asks for, sends are paced roughly one per second, and a `4xx` is treated as permanent because
retrying malformed HTML or a wrong chat id cannot succeed. Delivery counters live in Redis, so
`/api/health` reports what actually happened rather than resetting to zero on every cold start.

Because a wide radar can confirm many calls at once, a run sends its highest-conviction calls up to
`ALERTS_MAX_PER_RUN` and **reports the rest as `dropped`** — a cap that hid what it discarded would
read as a quiet market.

That budget covers the **whole run, across every strategy**. Alerting once per strategy instead made
it a per-strategy cap — three times the messages intended — and let each strategy rank its calls in
isolation, so a marginal scalp could go out ahead of a much stronger swing. On a five-minute
schedule the budget sets the ceiling directly: four per run is at most 48 messages an hour, and far
fewer in practice once the per-pair quiet period fills in.

#### Live trades on the dashboard — `GET /api/signals/active`

The ledger and the website used to be separate worlds: Telegram knew which calls were open and the
site did not, so the two could describe the same moment differently. `/api/signals/active` returns
the open trades with a live price, the unrealised move, and how far each has travelled from entry
toward its target — negative when it has gone the other way, unclamped, because a trade most of the
way to its stop is exactly what somebody looking at this panel needs to see.

They are priced from the exchange-wide ticker feed. One request covers every open trade no matter how
many there are, where per-symbol lookups would be one round trip each on a panel that polls.

The **Live Trades** card groups them by strategy and every row selects that asset, so a call that
arrives on the phone is one tap from its chart. That last part needed a fix underneath: the scan
reaches sixty-odd pairs while the dashboard's curated catalogue knew twenty-eight, and symbol
validation rejected the difference — a trade the bot opened on a coin outside the catalogue could be
announced in Telegram and then be un-chartable on the site that announced it. `/api/assets` now
serves the catalogue **plus** whatever the radar currently covers, under a `radar` group, and
validation accepts both while still refusing anything the exchange does not list.

#### Win rate — `server/src/services/trades/`

Every alert opens a trade. Each scheduled run replays the candles **since entry** and settles the
ones that touched a level — checking the last price would miss a wick that happened between two
runs, so this uses the actual highs and lows.

When a single bar touched both levels the **stop wins**: intrabar order is unknowable from candles,
and counting it as a win would flatter the record. One open trade per asset+strategy, so a reversal
cannot leave two contradictory trades running against each other.

Five outcomes are recorded, but only two move the rate:

| Outcome | Counts | Meaning |
| --- | --- | --- |
| `win` / `loss` | yes | The target or the stop came first |
| `expired` | no | Never reached either level inside its horizon (~3x the advertised duration) |
| `superseded` | no | Replaced by a reversal on the same pair |
| `voided` | no | Its levels were not prices, so it could never have resolved |

Counting an expired call as a loss would be as dishonest as counting it as a win, so both are kept
out of the denominator and reported separately — otherwise the rate would quietly measure only the
decisive calls, which is the most flattering possible sample.

`voided` exists because of a real defect rather than a hypothetical one. The engine used to size a
stop from ATR and a target from the stop with no ceiling, so on an asset whose ATR approached its own
price a short's target landed **below zero** — live, on SOLY: entry 3.623, stop 5.421, target −0.334.
Such a call can never reach its target and can still reach its stop, so it could only ever lose. Left
alone it would have been recorded as a loss in every case. The engine now refuses those setups and
the ledger voids any already on the books; three were cleared from production the run after the fix
shipped. It could not have appeared while the scan covered eight majors — widening the universe found
it.

> The rate measures whether the target or the stop came first. It is not a P&L: it assumes a fill at
> the stated entry, no fees and no slippage. Treat it as a scoreboard for the engine, not a return.

Covered by `server/src/services/trades/trades.service.test.ts` — eleven cases over a scripted
exchange: target, stop, short direction, both levels in one bar, a level touched before entry,
expiry, supersession, duplicate suppression and re-settlement. `npm test`.

#### Provisioning storage (Upstash Redis)

Without it everything still runs, but the ledger and the alert guards live in memory and reset on
every cold start — the win rate would restart at zero and alerts could repeat.

1. Vercel dashboard → your project → **Storage** → **Create Database** → **Upstash for Redis** (in
   the Marketplace section). The free tier is far larger than this needs.
2. Choose a region near your function — `fra1` if you kept the pin in `vercel.json`.
3. Connect it to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   automatically; the code also accepts Upstash's own `UPSTASH_REDIS_REST_*` names.
4. Redeploy, then confirm: `GET /api/health` → `"store": { "backend": "redis", "persistent": true }`.

#### Scheduling the run

Vercel Cron on the Hobby plan only fires once a day, which is useless for this, so use an external
pinger. [cron-job.org](https://cron-job.org) is free and enough:

1. Create a cronjob with URL `https://your-app.vercel.app/api/cron/signals`
2. **Method:** POST
3. **Schedule:** every 5 minutes
4. **Headers:** `Authorization: Bearer <your CRON_SECRET>`
5. Enable failure notifications so a silent bot does not go unnoticed

UptimeRobot, EasyCron or a GitHub Actions `schedule:` workflow all work the same way. Five minutes
is a sensible floor: the scalping timeframe is 5m bars, so a faster poll cannot see anything new.

### Telegram alerts — `server/src/services/telegram/`

Confirmed calls are pushed to a Telegram chat as they fire. The notifier is inert unless both
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, and it never throws — a Telegram outage
cannot affect the request that produced the signal.

**Two guards decide what is worth a message**, and both matter:

- **Transition.** Only a verdict that *changed into* BUY or SELL alerts. A call that has been
  standing for an hour is not news.
- **Cooldown** (90 minutes per asset+strategy by default). A score sitting on its threshold flips
  between BUY and WAIT bar to bar, and the scalping tab polls every fifteen seconds — without this
  the channel would receive the same call dozens of times an hour.

A genuine **reversal ignores the cooldown**: BUY → SELL is the tape turning over, not threshold
flapping, and anyone holding the previous call needs it immediately.

Alert state lives in the shared store, so the guards survive a cold start, and delivery is driven by
`/api/cron/signals` rather than by dashboard traffic — see *Autonomous alerts* above. With no Redis
provisioned both fall back to memory and the old caveats return; `/api/health` says which.

#### Setting up the bot

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the
   prompts. It replies with a token like `8100000000:AAF…` — that is `TELEGRAM_BOT_TOKEN`.
2. **Pick where alerts go.**
   - *A channel:* create it, add the bot as an **administrator** with permission to post, and use
     `@your_channel_name` as `TELEGRAM_CHAT_ID`. Public channels work by username; private ones need
     the numeric id from step 3.
   - *A group:* add the bot to the group, then get the numeric id from step 3.
   - *Yourself:* send the bot any message first — a bot cannot open a conversation — then step 3.
3. **Find the numeric chat id.** After sending one message to the bot (or posting in the group),
   open:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   and read `result[0].message.chat.id`. Group and channel ids are negative, e.g. `-1001234567890`.
4. **Set both variables** in `server/.env` locally, or in the Vercel project for deployment. Set
   `VITE_TELEGRAM_BOT_URL` too (e.g. `https://t.me/your_bot`) so the site's call-to-action appears —
   it renders nothing while unset, rather than showing a dead button.
5. **Check it.** `GET /api/health` reports `telegram.configured`, how many messages have been sent,
   and the last error if one failed.

### Asset universe — `server/src/data/assets.ts`

One catalogue defines the *curated* universe: 28 MEXC spot pairs grouped into
`majors · layer1 · layer2 · defi · meme · ai`. Every symbol is verified against MEXC's own
`/api/v3/ticker/24hr`, so a listing that is retired or renamed is caught in the catalogue rather
than at request time.

It is no longer the whole story. The scheduled scan covers far more than 28 pairs, and the two
lists had drifted apart — a trade the bot opened on a coin outside the catalogue was announced in
Telegram and then could not be charted on the site that announced it. `GET /api/assets` now serves
the catalogue **plus** whatever the radar currently covers, the latter under a `radar` group because
grouping is editorial and a ticker is all the exchange provides. See *Global radar* above.

`GET /api/assets` exposes the merged list; `AssetScopeProvider` (`web/src/state/AssetScope.tsx`) holds
the user's slice of it and every panel reads from that one place, so the header switcher re-scopes
the ticker tape, the watchlist and the signal grid together. The selection is persisted to
`localStorage` and validated against the live catalogue on load, so a retired ticker cannot get
stuck there.

### SEO — `web/vite/seo.ts` · `web/src/hooks/useDocumentMeta.ts`

The dashboard is client-rendered, so indexing is handled from both ends:

- **Static head** — `index.html` ships the title, description, Open Graph and Twitter
  cards, JSON-LD and a `<noscript>` summary. Social scrapers never execute JavaScript, so
  anything they need has to be in the served HTML. The build plugin resolves `%SITE_URL%` /
  `%OG_IMAGE%` and injects `canonical` + `hreflang` links from one config value.
- **Runtime head** — `useDocumentMeta` re-writes title, description, OG/Twitter tags,
  canonical, `hreflang` and JSON-LD whenever the language changes, and updates the same
  JSON-LD block the static HTML shipped rather than appending a second one.
- **One URL per language** — English is the canonical `/`, Ukrainian is `/?lang=uk`. The
  language detector reads that parameter first, and the switcher writes it back with
  `history.replaceState`, so every `hreflang` alternate resolves to the language it
  advertises.
- **`robots.txt` and `sitemap.xml`** are generated at build time from the same site config
  (and served in dev too, so they can be checked locally). The sitemap lists both locales
  with `xhtml:link` alternates.
- **OG image** — `web/public/og-image.png` (1200x630) is rasterised from
  `web/scripts/og-image.html` by headless Chrome: `npm run og:image --workspace web`. The
  card is authored in the app's own design language, so it never drifts from the product.

### Analytics — `web/src/lib/analytics.ts`

GA4, deliberately off the critical path: the tag is injected from JS after first paint on
`requestIdleCallback` rather than blocking `<head>`, loaded `async`, and events fired before
it lands are queued by `dataLayer`. Nothing is requested at all when
`VITE_GA_MEASUREMENT_ID` is unset or the browser sends Do Not Track.

`send_page_view` is off; page views are emitted explicitly, one per language, since the two
locales are distinct URLs. Product events: `language_change`, `strategy_change`,
`asset_toggle`, `asset_group_select`, `manual_refresh`, `mobile_controls_open`.

### Responsive layout

| Breakpoint | Header                                          | Body                          |
| ---------- | ----------------------------------------------- | ----------------------------- |
| `< md`     | brand · refresh · control sheet                 | single column                 |
| `md`       | + data-source badge, asset & language switchers | signals two-up                |
| `lg`       | + tagline                                       | sticky sidebar splits off     |
| `xl`/`2xl` | + volatility, then breadth                      | signal grid widens to four-up |

Nothing is dropped on the way down: what leaves the bar moves into `MobileControls`, a real
modal dialog (portal, focus trap, focus restore, `Escape`, backdrop dismiss, scroll lock)
holding market status, the asset picker and the language switcher. `AssetPicker` is one
component shared by the desktop popover and the sheet, so behaviour cannot drift between
breakpoints.

Two details worth knowing: the sheet **must** be portalled, because the header's
`backdrop-filter` makes it the containing block for `position: fixed` children and would
otherwise clip the overlay to the height of the bar; and the countdown units switch from a
flex row to a four-column grid below `sm`, because fixed-width tiles overflow a 360px screen.

### Text overflow and layout stability

Ukrainian copy runs 30-40% longer than English, so the layout is built to absorb it:

- `overflow-wrap: break-word` is set once on `body` (it inherits), and `html, body` carry
  `overflow-x: clip` — no translation can introduce a horizontal scrollbar.
- Every flex/grid child that contains text carries `min-w-0`, without which a long token
  refuses to shrink and pushes its siblings out of the container.
- `truncate` for single-line values (event titles, asset names, badges), `line-clamp-2/3`
  for prose (signal rationale, insight headlines, section subtitles), `text-safe` for
  model-generated strings that might contain an unbroken token.
- Where a length difference would move unrelated content, the space is **reserved**: the
  hero title and detail use `min-h-[2lh]` / `min-h-[3lh]` so they occupy the same height in
  both languages, the language pill has a fixed width, and rows that would wrap differently
  (the hero badge strip, the strategy tabs) scroll horizontally on mobile instead.

Verified by measuring element geometry before and after a language switch: at 375px and
1440px the header, hero and countdown are pixel-identical across EN and UA.

### Localization — `web/src/i18n/`

English and Ukrainian, switchable from the header. The hard part is not the static UI copy — it is
the *generated* copy, and each producer is handled differently:

| Producer                        | Strategy                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| Static UI                       | Plain keys in `web/src/i18n/locales/{en,uk}.ts`                  |
| Signal rationale, rule engine   | The server emits `{ key, params, text }` — the client translates |
| Calendar events, news headlines | Translated by fixture id: `events.<id>.title`                    |
| LLM providers                   | The model is asked to answer in the active language              |

The `I18nText` envelope in `types/domain.ts` is what makes the deterministic engines translatable:

```jsonc
{
  "key": "insights.heuristic.trigger.bearishTone",
  "params": { "volLabel": "extreme volatility", "volLabelKey": "insights.volLabel.extreme" },
  "text": "Bearish tone + extreme volatility"   // English fallback, always present
}
```

Any param named `<name>Key` is itself a translation key for `<name>`, which is how a nested value —
a volatility label, an event title — stays translatable inside an interpolated sentence.
`renderI18nText()` in `web/src/i18n/useTx.ts` resolves the whole thing.

Adding a language: drop a `locales/<lang>.ts` typed as `Translation` (the type is derived from the
English bundle, so a missing key is a build error), register it in `web/src/i18n/index.ts`, and add
the code to `LOCALES` there and to the server's locale list in `server/src/routes/index.ts`.

---

## Project structure

```
macrosync/
├── api/index.mjs                   # Vercel serverless entry — re-exports the Express app
├── vercel.json                     # install/build/output + /api rewrite
├── server/
│   ├── scripts/register-webhook.mjs   # points Telegram at a deployment
│   ├── tsconfig.json                  # build config — excludes *.test.ts
│   ├── tsconfig.test.json             # typecheck config — includes them
│   └── src/
│       ├── app.ts                     # the Express app (no listener — reused by api/)
│       ├── config/env.ts              # typed configuration
│       ├── data/assets.ts             # the curated catalogue (28 MEXC pairs)
│       ├── routes/index.ts            # the whole REST surface
│       ├── services/
│       │   ├── market.service.ts      # MEXC REST + TTL cache + circuit breaker
│       │   ├── calendar.service.ts    # economic calendar, impact-filtered
│       │   ├── news/                  # provider-agnostic headlines + sentiment
│       │   ├── radar/                 # exchange-wide universe, ranking + cursor
│       │   ├── store/                 # Upstash Redis over REST, + memory fallback
│       │   ├── telegram/              # roster · broadcast · webhook · Bot API
│       │   ├── trades/                # the ledger behind the win rate
│       │   ├── signal.engine.ts       # strategy profiles → signals
│       │   ├── insight.service.ts     # provider selection + fallback
│       │   ├── llm/                   # prompt, anthropic, openai, heuristic
│       │   └── **/*.test.ts           # colocated — `npm test` runs them via tsx
│       ├── types/domain.ts            # the API contract
│       └── utils/{cache,indicators}.ts# TTL cache · EMA/RSI/MACD/ATR
└── web/
    ├── index.html                  # static head: OG/Twitter, JSON-LD, noscript
    ├── public/og-image.png         # 1200x630 social card (generated)
    ├── scripts/                    # og-image.html + its headless-Chrome renderer
    ├── vite/seo.ts                 # robots.txt + sitemap.xml + head URL injection
    └── src/
        ├── components/
        │   ├── countdown/             # CountdownRadar · RadarDial · CountdownUnit · EventQueue
        │   ├── insights/              # InsightsFeed · InsightCard
        │   ├── layout/                # TopBar · BackgroundFX · LanguageSwitcher · MobileControls · MarketStatus
        │   ├── market/                # TickerStrip · Watchlist · AssetSelector · AssetPicker
        │   ├── signals/               # SignalsPanel · StrategyTabs · SignalCard
        │   └── ui/                    # GlassCard · Badge · Meter · Sparkline · Skeleton
        ├── hooks/                     # usePolling · useCountdown · useDocumentMeta · useAnalytics
        ├── i18n/                      # init · locales/{en,uk} · useTx (server-payload translation)
        ├── lib/                       # api client · formatters · cn() · brand · site · analytics
        ├── state/AssetScope.tsx       # selected asset universe, shared by every panel
        ├── types/domain.ts            # mirror of the server contract
        └── index.css                  # the design system
```

`web/src/types/domain.ts` mirrors `server/src/types/domain.ts`. Keep them in sync, or extract a
shared workspace package when the contract stabilises.

---

## Deployment (Vercel)

The whole monorepo ships as **one Vercel project**: the dashboard as static output, the
Express API as a serverless function on the same origin. Nothing else has to be hosted, the
browser calls `/api` relative (so `VITE_API_BASE` is unnecessary) and there is no CORS hop.

`vercel.json` holds the configuration, so it lives in the repo rather than the dashboard UI:

```jsonc
{
  "framework": "vite",
  "installCommand": "npm ci",             // root lockfile → reproducible
  "buildCommand": "npm run build",        // server (tsc) then web (vite)
  "outputDirectory": "web/dist",
  "functions": { "api/index.mjs": { "includeFiles": "server/dist/**" } },
  "rewrites": [{ "source": "/api/:path*", "destination": "/api" }]
}
```

How the API half fits together:

- `server/src/app.ts` exports the Express app with no server attached; `server/src/index.ts`
  only adds `listen()` for local development and `npm start`.
- The router is mounted at **both** `/api` and `/`, so the function works whether or not the
  platform consumes the `/api` prefix during the rewrite.
- `api/index.mjs` re-exports the compiled app — an Express app already *is* a
  `(req, res)` handler. It imports `server/dist`, which `buildCommand` produces before Vercel
  packages the function, so the platform bundler never has to resolve the server's ESM `.js`
  specifiers back onto TypeScript sources. The `.mjs` extension makes it ESM without forcing
  `"type": "module"` on the repo root.

Project settings — **Root Directory must be empty (the repo root)** for `vercel.json` to
apply; leave the command fields blank so the file wins:

| Setting          | Value                   |
| ---------------- | ----------------------- |
| Framework Preset | Vite                    |
| Root Directory   | *(empty — repo root)*   |
| Build / Install / Output | *(blank — vercel.json)* |

### Two things that break the build

- **`NODE_ENV=production` as a project environment variable.** The whole toolchain
  (`typescript`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@types/*`) lives in
  `devDependencies`, so npm omits it and `tsc -b` fails with `TS2688: Cannot find type
  definition file for 'node'` and `TS7016: Could not find a declaration file for module
  'react/jsx-runtime'`. Vercel already sets `NODE_ENV=production` at *runtime*; never set it
  yourself as a build-time variable.
- **Node older than 20.19.** Vite 7 and `@vitejs/plugin-react` 5 require
  `^20.19.0 || >=22.12.0`. Both `package.json` files declare `"engines": { "node": ">=20.19" }`
  — keep them, especially if Root Directory is ever pointed at `web`, since Vercel then reads
  only `web/package.json`.

### Environment variables

`.env` is git-ignored, so these are configured in the Vercel project. Both halves now run in
the same project, so server and client variables live side by side:

| Variable                                        | Half   | Notes                                                       |
| ----------------------------------------------- | ------ | ----------------------------------------------------------- |
| `VITE_SITE_URL`                                 | client | Real origin. Wrong value ⇒ wrong canonical/OG/sitemap URLs  |
| `VITE_GA_MEASUREMENT_ID`                        | client | Omit to ship without analytics                               |
| `VITE_TELEGRAM_BOT_URL`                         | client | Link for the alert CTA; hides the button while unset          |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`        | server | Enable signal alerts — see *Telegram alerts*                  |
| `SYMBOLS`, `MAX_SYMBOLS_PER_REQUEST`, `MARKET_TIMEOUT_MS`, `MARKET_CONCURRENCY` | server | Optional — every one has a default |
| `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | server | Optional — without keys the deterministic risk engine is used |

Anything prefixed `VITE_` is **inlined into the public JavaScript bundle** at build time.
Never give an API key that prefix; Vercel's "Sensitive" flag hides a value in the dashboard,
not in the browser. The unprefixed server variables above are only read by the function.

---

## Design system

All tokens live in `web/src/index.css` under `@theme` — Tailwind v4 needs no config file.

- **Surfaces** — `void #05060A` → `abyss` → `carbon` → `graphite` → `steel`
- **Market semantics** — `bull #00FFA3`, `bear #FF3B5C`, `warn #FFB020`
- **Brand** — `accent #7C5CFF` (violet), `cyber #22D3EE`
- **Type** — Inter for UI, JetBrains Mono for every number, with `.tnum` tabular figures so digits
  never jitter as they tick
- **Glass** — the `glass` / `glass-soft` / `edge-light` utilities: layered translucency, 22px
  backdrop blur, a luminous top hairline and a coloured aura that blooms on hover
- **Motion** — Framer Motion for the tab pill (`layoutId`), digit rolls, card entrances and layout
  reflow; CSS keyframes for the radar sweep, marquee, pulses and drifting background auras.
  Everything collapses under `prefers-reduced-motion`.

Polling cadence matches the timeframe: prices every 10s, scalping signals 15s, day 30s, swing 60s,
insights 60s. Polling pauses while the tab is hidden, and the previous payload stays on screen
during a refresh so the dashboard never flashes empty.

---

## Roadmap / where to extend

- Backtest the signal thresholds — the win rate now records live outcomes, but the parameters
  behind them have still never been measured against history.
- Persist insights so the feed has history, and score past scenarios against what actually happened.
- Auth on the web side. Telegram already has per-person subscriptions and mutes, but the dashboard
  has no accounts, so a watchlist cannot follow somebody between the two.
- Per-recipient filters: a subscriber can mute everything or nothing, where most would want a
  strategy or a confidence floor.
- Grow the locale set — the `Translation` type makes a new language a mechanical, type-checked job.

---

## Disclaimer

Research tooling, not financial advice. Signals are model output over public market data; the
calendar and news feed are fixtures for this MVP; the AI layer produces risk-management scenarios
only — never entries or exits.
