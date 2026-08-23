# MacroSync — Macro-Synced Signal & Risk Terminal

A crypto trading dashboard built around a single premise: **technical analysis breaks
when the news hits.** Indicators can only describe what already happened, so they are
structurally blind to a rate decision that lands in forty minutes.

MacroSync exists to close that gap — it keeps the chart in sync with the macro calendar.
It puts three things on one screen:

1. **Strategy Signals** — technical setups computed live from Binance candles, separated by
   Scalping (5m), Day Trading (1h) and Swing (4h).
2. **News Countdown Radar** — a hero timer ticking down to the next macro or political catalyst,
   with the expected impact and an explicit warning when a setup's horizon overlaps the release.
3. **AI Actionable Insights** — headlines translated by an LLM into *risk-management scenarios*
   rather than trade calls. The model is instructed never to say buy or sell; it outputs
   conditional posture: `Bearish tone + high volatility → tighten stops to 0.8× ATR, cut size 50%,
   no new leveraged longs until the print clears.`

Two cross-cutting features shape the UI: a **28-asset universe** with a switcher that re-scopes
every panel at once, and full **English / Ukrainian localization** — including the sentences the
signal engine and the AI risk layer generate.

---

## Stack

| Layer     | Choice                                                                    |
| --------- | ------------------------------------------------------------------------- |
| Frontend  | React 19 · TypeScript · Vite · Tailwind CSS v4 · Framer Motion · Lucide    |
| i18n      | i18next · react-i18next · browser language detector (EN · UA)              |
| SEO       | Static + runtime meta, OG image, `robots.txt`, generated `sitemap.xml`      |
| Analytics | GA4 via `gtag`, injected on idle and gated on consent signals              |
| Backend   | Node · Express 5 · TypeScript (ESM) · Zod                                 |
| Market    | Binance public REST (`/api/v3/klines`, `/api/v3/ticker/24hr`) — no API key |
| News      | Mock fixtures (`server/src/data/news.ts`, `server/src/data/calendar.ts`)   |
| AI        | Anthropic (`claude-opus-5`) or OpenAI, with a deterministic rule engine as the default fallback |

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
├── server/
│   └── src/
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
