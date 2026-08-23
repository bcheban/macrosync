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
[![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?logo=vercel&logoColor=white&style=for-the-badge)](https://vercel.com)

</div>

---

## What it does

1. **Strategy Signals** — technical setups computed live from Binance candles, separated by
   Scalping (5m), Day Trading (1h) and Swing (4h), narrowable to any single asset.
2. **News Countdown Radar** — a hero timer ticking down to the next macro or political catalyst,
   with the expected impact and an explicit warning when a setup's horizon overlaps the release.
3. **AI Actionable Insights** — headlines translated by an LLM into *risk-management scenarios*
   rather than trade calls. The model is instructed never to say buy or sell; it outputs
   conditional posture: `Bearish tone + high volatility → tighten stops to 0.8× ATR, cut size 50%,
   no new leveraged longs until the print clears.`

Everything on the screen is live: prices and candles from **MEXC**, headlines from real newsrooms,
indicators computed from those candles. Three cross-cutting features shape the product: a
**28-asset universe** with a switcher that re-scopes every panel at once, **prices straight from
the exchange socket**, and full **English / Ukrainian localization** — down to the sentences the
signal engine and the AI risk layer generate.

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

<img src="https://img.shields.io/badge/GA4-analytics-E37400?logo=googleanalytics&logoColor=white" align="left" height="24" /> &nbsp;
Product analytics, injected on idle after first paint so it never competes with the app bundle,
and skipped entirely when unconfigured or when the browser sends Do Not Track.

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

No API keys are required. Without them the dashboard runs on live Binance data plus the
built-in deterministic risk engine.

### Other scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Both apps, colour-tagged output                       |
| `npm run dev:server`| API only                                              |
| `npm run dev:web`   | Dashboard only                                        |
| `npm run build`     | Type-checked production build of both workspaces      |
| `npm start`         | Run the compiled API from `server/dist`               |
| `npm run typecheck` | `tsc --noEmit` across both workspaces                 |
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
| `USE_LIVE_MARKET_DATA`  | `true`                  | `false` forces the offline simulator                        |
| `BINANCE_API_BASE`      | `data-api.binance.vision` | Market-data mirror — not geo-blocked for datacenter IPs   |
| `BINANCE_API_FALLBACK`  | `api.binance.com`       | Tried when the primary host fails                           |
| `UPSTREAM_COOLDOWN_MS`  | `30000`                 | Skip upstream for this long after every host fails          |
| `LLM_PROVIDER`          | `auto`                  | `auto` · `anthropic` · `openai` · `heuristic`                |
| `ANTHROPIC_API_KEY`     | —                       | Enables the Claude risk analyst                             |
| `ANTHROPIC_MODEL`       | `claude-opus-5`         |                                                             |
| `OPENAI_API_KEY`        | —                       | Alternative provider                                        |

The dashboard has its own configuration in `web/.env` (see `web/.env.example`):

| Variable                 | Default                | Notes                                                           |
| ------------------------ | ---------------------- | --------------------------------------------------------------- |
| `VITE_SITE_URL`          | `https://macrosync.io` | Absolute origin — canonical URLs, OG tags, sitemap, `hreflang`   |
| `VITE_GA_MEASUREMENT_ID` | —                      | GA4 id, e.g. `G-XXXXXXXXXX`. Empty disables analytics completely |
| `VITE_API_BASE`          | `/api`                 | Set when the API is on another origin                            |

**Why two hosts?** `api.binance.com` geo-blocks datacenter IPs, so an API deployed to a cloud
provider silently degrades to simulated prices — BTC at the hardcoded anchor instead of the real
rate. `data-api.binance.vision` is Binance's own market-data mirror: same payloads, no key, and
reachable from cloud IPs. The first host that answers wins; if none do, a cooldown stops every
subsequent symbol in the request from paying the full timeout.

**Offline / rate-limited?** The market service falls back to a seeded simulator automatically
when Binance is unreachable (some regions block the API). The UI labels the feed as
`Simulated feed` in the top bar, and everything else behaves identically. Force it with
`USE_LIVE_MARKET_DATA=false`.

---

## API

| Method | Route                          | Returns                                                    |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/health`                  | Status, live-data flag, tracked symbols, locales           |
| GET    | `/api/assets`                  | The tradable universe + groups — powers the asset switcher |
| GET    | `/api/market/tickers`          | 24h stats + 48-point sparkline per symbol                  |
| GET    | `/api/strategies`              | Strategy definitions (timeframe, stop multiple, R:R)       |
| GET    | `/api/signals?strategy=day`    | Signals; omit `strategy` for all three                     |
| GET    | `/api/events?limit=6`          | Upcoming calendar + the `headline` event for the countdown |
| GET    | `/api/news?limit=8`            | Raw news feed                                              |
| GET    | `/api/insights?limit=6&lang=uk`| AI risk breakdowns + market context                        |
| POST   | `/api/insights/refresh`        | Busts the insight cache and regenerates                    |
| GET    | `/api/context`                 | Volatility regime, breadth, next event                     |

`/api/market/tickers` and `/api/signals` both accept `?symbols=BTCUSDT,ETHUSDT` — unknown tickers
are dropped and the list is capped at `MAX_SYMBOLS_PER_REQUEST`. `?lang=en|uk` on `/api/insights`
only selects the language the **model** writes in; see *Localization* below.

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

### Countdown radar — `server/src/data/calendar.ts`

> **The one remaining fixture.** Prices, candles and news are live; the macro calendar is not.
> The events are real (FOMC, CPI, NFP, ECB, BoJ, options expiry) and their cadences are real, but
> the dates are computed by rolling a known anchor forward rather than read from an economic
> calendar feed — every provider of those (Trading Economics, Finnhub, FMP) requires a paid key.
> Swapping this module for a real feed touches nothing else; the API and UI only depend on the
> `MacroEvent` shape.


Calendar entries are templates with an anchor plus a cadence (FOMC every 42 days, CPI ~30, options
expiry weekly…). `nextOccurrence()` rolls each anchor forward until it lands in the future, so the
countdown is always live no matter when the project is run. Swap this module for a real calendar
feed (Trading Economics, Finnhub) without touching the API or the UI.

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

### Asset universe — `server/src/data/assets.ts`

One catalogue defines everything the platform can price: 28 Binance spot pairs grouped into
`majors · layer1 · layer2 · defi · meme · ai`. The same entries carry the anchor prices the offline
simulator walks from, so an offline demo stays believable from BTC at ~96,000 to PEPE at ~0.00001.

`GET /api/assets` exposes the catalogue; `AssetScopeProvider` (`web/src/state/AssetScope.tsx`) holds
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
│   └── src/
│       ├── app.ts                     # the Express app (no listener — reused by api/)
│       ├── config/env.ts              # typed configuration
│       ├── data/assets.ts             # the tradable universe + simulator anchors
│       ├── data/{calendar,news}.ts    # mock feeds — replace with real providers
│       ├── routes/index.ts            # the whole REST surface
│       ├── services/
│       │   ├── market.service.ts      # Binance + TTL cache + offline simulator
│       │   ├── signal.engine.ts       # strategy profiles → signals
│       │   ├── insight.service.ts     # provider selection + fallback
│       │   └── llm/                   # prompt, anthropic, openai, heuristic
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
| `SYMBOLS`, `MAX_SYMBOLS_PER_REQUEST`, `MARKET_TIMEOUT_MS`, `USE_LIVE_MARKET_DATA` | server | Optional — every one has a default |
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

- Replace the mock feeds with real providers (CryptoPanic, NewsAPI, Trading Economics).
- Stream prices over Binance WebSockets instead of REST polling.
- Persist insights so the feed has history, and score past scenarios against what actually happened.
- Add auth + per-user watchlists and alerting on countdown thresholds.
- Grow the locale set — the `Translation` type makes a new language a mechanical, type-checked job.

---

## Disclaimer

Research tooling, not financial advice. Signals are model output over public market data; the
calendar and news feed are fixtures for this MVP; the AI layer produces risk-management scenarios
only — never entries or exits.
