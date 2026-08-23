/**
 * English source of truth.
 *
 * Three kinds of key live here:
 *  - plain UI copy,
 *  - `events.*` / `news.*` — keyed by fixture id, so server payloads translate
 *    by identity while the API keeps shipping English as a fallback,
 *  - `signals.rationale.*` / `insights.heuristic.*` — the exact keys the
 *    deterministic engines emit. Renaming one here means renaming it in
 *    `server/src/services` too.
 */
export const en = {
  brand: {
    tagline: 'Macro-Synced Signal & Risk Terminal',
    pitch: 'Technical signals, a macro-news countdown radar and AI risk management for crypto traders.',
  },

  common: {
    refresh: 'Refresh data',
    showLess: 'Show less',
    retry: 'Retry',
    all: 'All',
    clear: 'Clear',
    close: 'Close',
    controls: 'Dashboard controls',
    search: 'Search',
  },

  language: {
    label: 'Language',
    en: 'English',
    uk: 'Українська',
    enShort: 'EN',
    ukShort: 'UA',
  },

  topbar: {
    volatility: 'Volatility',
    breadth: 'Breadth {{value}}%',
    binanceLive: 'Binance live',
    simulatedFeed: 'Simulated feed',
    atr: 'ATR {{value}}%',
    status: 'Market status',
  },

  volatility: {
    low: 'low',
    elevated: 'elevated',
    high: 'high',
    extreme: 'extreme',
  },

  assets: {
    title: 'Asset universe',
    subtitle: 'Scopes the ticker tape, watchlist and signal grid',
    trigger_one: '{{count}} asset',
    trigger_other: '{{count}} assets',
    selected: '{{count}} of {{max}} selected',
    selectGroup: 'Select group',
    limit: 'Up to {{max}} assets can be tracked at once.',
    empty: 'No asset matches "{{query}}".',
    searchPlaceholder: 'Search BTC, Solana…',
    reset: 'Reset to default',
    groups: {
      all: 'All',
      majors: 'Majors',
      layer1: 'Layer 1',
      layer2: 'Layer 2',
      defi: 'DeFi',
      meme: 'Memecoins',
      ai: 'AI & DePIN',
    },
    names: {},
  },

  ticker: {
    label: 'Live prices',
  },

  watchlist: {
    title: 'Watchlist',
    subtitle: '24h change · quote volume',
    volume: 'Vol {{value}}',
    empty: 'No assets selected.',
  },

  signals: {
    title: 'Strategy Signals',
    live: '{{count}} live',
    error: 'Signal engine unreachable — {{message}}',
    empty: 'Pick at least one asset to compute signals.',
    confluence: 'Confluence',
    entry: 'Entry',
    stop: 'Stop',
    target: 'Target',
    riskReward: 'R:R',
    risk: 'Risk',
    rsi: 'RSI',
    atr: 'ATR',
    volume: 'Vol',
    strategies: {
      scalping: 'Scalping',
      day: 'Day Trading',
      swing: 'Swing',
    },
    strategyAria: 'Trading strategy',
    subtitles: {
      scalping: 'EMA 9/21 · RSI 7 · 5m bars — intraday momentum bursts',
      day: 'EMA 21/55 · RSI 14 · 1h bars — session-length trends',
      swing: 'EMA 34/89 · RSI 14 · 4h bars — multi-day positioning',
    },
    direction: {
      long: 'Long bias',
      short: 'Short bias',
      neutral: 'No edge',
    },
    status: {
      live: 'Live',
      forming: 'Forming',
      cooling: 'Cooling',
    },
    /** Emitted by `server/src/services/signal.engine.ts`. */
    rationale: {
      trendFlat: 'EMA {{fast}}/{{slow}} flat — no directional edge from trend',
      trendAbove: 'EMA {{fast}} is above EMA {{slow}} by {{spread}}%',
      trendBelow: 'EMA {{fast}} is below EMA {{slow}} by {{spread}}%',
      macdPositiveExpanding: 'MACD histogram positive and expanding on the {{timeframe}}',
      macdPositiveFlat: 'MACD histogram positive but flat on the {{timeframe}}',
      macdNegativeExpanding: 'MACD histogram negative and expanding on the {{timeframe}}',
      macdNegativeFlat: 'MACD histogram negative but flat on the {{timeframe}}',
      rsiStretched: 'RSI {{rsi}} — stretched, chase risk elevated',
      rsiWashedOut: 'RSI {{rsi}} — washed out, snap-back risk elevated',
      rsiNeutral: 'RSI {{rsi}} sits in the neutral band',
      volume: 'Volume {{ratio}}× its 20-bar average',
    },
    eventWarning: "{{event}} lands in {{minutes}}m — inside this setup's horizon",
  },

  countdown: {
    badge: 'News Countdown Radar',
    impact: 'Impact',
    days: 'Days',
    hours: 'Hours',
    minutes: 'Min',
    seconds: 'Sec',
    forecast: 'Forecast',
    previous: 'Previous',
    affects: 'Affects {{assets}}',
    riskWindow: 'Risk window open',
    importance: '{{level}} impact · {{region}}',
    warning:
      'Technical setups lose reliability inside this window — momentum and mean-reversion models have no input for a print that has not happened yet. Size down, widen or remove stops that sit inside the expected release range, and treat every signal below as provisional.',
    categories: {
      monetary: 'Central bank',
      macro: 'Macro data',
      political: 'Political',
      crypto: 'Crypto native',
    },
  },

  importance: {
    high: 'high',
    medium: 'medium',
    low: 'low',
  },

  eventQueue: {
    title: 'Event Queue',
    subtitle: 'Scheduled macro & political catalysts',
  },

  /** Keyed by `MacroEvent.id` from `server/src/data/calendar.ts`. */
  events: {
    'fomc-rate-decision': {
      title: 'FOMC Interest Rate Decision',
      detail: 'Federal funds target range + statement. Dot plot on quarterly meetings.',
    },
    'fed-chair-presser': {
      title: 'Fed Chair Press Conference',
      detail: 'Unscripted Q&A — historically the widest intraday range of the session.',
    },
    'us-cpi': {
      title: 'US CPI (YoY)',
      detail: 'Headline and core inflation print. Primary driver of rate-cut repricing.',
    },
    'us-nfp': {
      title: 'US Non-Farm Payrolls',
      detail: 'Labour market strength — moves the dollar and, by extension, crypto beta.',
    },
    'ecb-decision': {
      title: 'ECB Monetary Policy Decision',
      detail: 'Euro-area rates. Second-order impact through the EUR/USD channel.',
    },
    'sec-policy-hearing': {
      title: 'Senate Banking Hearing — Digital Assets',
      detail: 'Political headline risk. Single sentences here have moved alt-caps 8%+.',
    },
    'g7-statement': {
      title: 'G7 Leaders — Joint Statement on Tariffs',
      detail: 'Geopolitical tape bomb risk; timing is announced but content is not.',
    },
    'btc-options-expiry': {
      title: 'BTC & ETH Options Expiry (Deribit)',
      detail: 'Large open-interest roll-off. Pinning into expiry, gamma release after.',
    },
    'etf-flows': {
      title: 'US Spot ETF Net Flow Print',
      detail: 'Daily creations/redemptions across issuers — the clean spot-demand read.',
    },
    'boj-decision': {
      title: 'Bank of Japan Policy Decision',
      detail: 'Carry-trade unwind risk — the 2024 playbook for sudden crypto air pockets.',
    },
  },

  /** Keyed by `NewsItem.id` from `server/src/data/news.ts`. */
  news: {
    'news-fed-hawkish': {
      headline: 'Fed officials signal patience on cuts as services inflation stays sticky',
    },
    'news-etf-inflows': {
      headline: 'Spot BTC ETFs log fourth straight day of net inflows, $611M added',
    },
    'news-senate-hearing': {
      headline: 'Senate committee schedules surprise hearing on digital-asset market structure',
    },
    'news-exchange-outflows': {
      headline: 'Exchange balances hit a six-year low as long-term holders keep accumulating',
    },
    'news-liquidations': {
      headline: '$340M in leveraged positions liquidated during 20-minute volatility spike',
    },
    'news-l2-upgrade': {
      headline: 'Major L2 ships fee-reduction upgrade; Ethereum blob usage jumps 22%',
    },
    'news-memecoin-rotation': {
      headline: 'Memecoin volumes rotate back into SHIB as majors consolidate',
    },
    'news-tariffs': {
      headline: 'New tariff package leaks ahead of G7 statement, risk assets wobble',
    },
  },

  insights: {
    title: 'AI Actionable Insights',
    subtitle: 'Headlines translated into risk posture — never directional calls',
    error: 'Insight service unreachable — {{message}}',
    riskScenarios: 'Risk scenarios',
    riskControls: 'Risk controls',
    invalidation: 'Invalidation',
    conviction: '{{value}}% conviction',
    volatilityTag: 'Vol: {{level}}',
    more_one: '{{count}} more scenario',
    more_other: '{{count}} more scenarios',
    provider: {
      anthropic: 'Claude',
      openai: 'GPT',
      heuristic: 'Rule engine',
    },
    sentiment: {
      bullish: 'Bullish tone',
      bearish: 'Bearish tone',
      neutral: 'Mixed tone',
    },
    posture: {
      defensive: 'Defensive posture',
      neutral: 'Neutral posture',
      constructive: 'Constructive posture',
    },
    /** Volatility wording used inside generated sentences. */
    volLabel: {
      low: 'compressed volatility',
      elevated: 'elevated volatility',
      high: 'high volatility',
      extreme: 'extreme volatility',
    },
    leverageCap: {
      low: '5x',
      elevated: '3x',
      high: '2x',
      extreme: '1x (spot only)',
    },
    /** Emitted by `server/src/services/llm/heuristic.provider.ts`. */
    heuristic: {
      majors: 'majors',
      trigger: {
        bearishTone: 'Bearish tone + {{volLabel}}',
        constructiveTone: 'Constructive tone + {{volLabel}}',
        ambiguous: 'Ambiguous headline + {{volLabel}}',
        eventCountdown: '{{event}} in {{minutes}}m',
        highImpact: 'High headline impact + thin order-book depth',
        broadBreadth: 'Broad participation across majors',
        narrowBreadth: 'Narrow breadth — leadership concentrated in one name',
      },
      response: {
        bearishTone:
          'Tighten stops to {{stop}} ATR on {{assets}}, cut position size by {{size}}% and add no new leveraged longs until the tape stabilises.',
        constructiveHeavy:
          'Let existing exposure work but do not add into strength — trail stops at {{stop}} ATR and keep new risk below half of normal size.',
        constructiveCalm:
          'Scale risk back toward normal in {{assets}}, trail stops at {{stop}} ATR and pre-define the give-back you will accept before adding.',
        ambiguous:
          'Treat this as noise until price confirms: hold current exposure, avoid fresh risk in {{assets}} and let the {{stop}} ATR stop do the deciding.',
        eventCountdown:
          'Flatten or hedge short-horizon positions before the print. Widen limit orders, expect 2–4× normal slippage in the first 60 seconds and re-enter only after the first {{settle}} minutes of post-release range is set.',
        highImpact:
          'Assume liquidity gaps: replace market orders with staged limits, cap single-ticket size at 25% of visible depth and disable any stop that would trigger inside the spread.',
        broadBreadth:
          'Correlation is high, so treat separate positions as one bet: aggregate risk across the book before sizing anything new.',
        narrowBreadth:
          'Rotation risk is elevated. Cap alt exposure and keep dry powder for the majors where depth is deepest.',
      },
      control: {
        maxRisk: 'Max risk per position: {{pct}} of account equity.',
        stopDistance: 'Stop distance: {{stop}} ATR(14) on the trading timeframe — never a fixed percentage.',
        leverageCap: 'Leverage cap while this regime holds: {{cap}}.',
        eventBlackout: 'No new intraday risk inside the {{minutes}}m window before {{event}}.',
        reevaluate: 'Re-evaluate exposure at every 4h close while the headline is still driving flow.',
      },
      invalidation: {
        bearish:
          'A reclaim of the pre-headline range on rising volume would mean the market has absorbed the news — the defensive posture can be relaxed.',
        bullish:
          'A failure to hold the post-headline low on falling volume means the bid is not real — step back to a defensive posture.',
        neutral:
          'A decisive break of the session range in either direction on 1.5× average volume invalidates the wait-and-see stance.',
      },
      thesis: {
        bearish: {
          heavy: 'Bearish headline landing into {{volLabel}} — the risk here is position size and slippage, not direction.',
          calm: 'Bearish headline landing into {{volLabel}} — the risk here is complacency: the regime can flip on the next print.',
        },
        constructive: {
          heavy:
            'Constructive headline landing into {{volLabel}} — the risk here is position size and slippage, not direction.',
          calm: 'Constructive headline landing into {{volLabel}} — the risk here is complacency: the regime can flip on the next print.',
        },
        mixed: {
          heavy: 'Mixed headline landing into {{volLabel}} — the risk here is position size and slippage, not direction.',
          calm: 'Mixed headline landing into {{volLabel}} — the risk here is complacency: the regime can flip on the next print.',
        },
      },
    },
  },

  time: {
    secondsAgo: '{{count}}s ago',
    minutesAgo: '{{count}}m ago',
    hoursAgo: '{{count}}h ago',
    daysAgo: '{{count}}d ago',
    inMinutes: '{{minutes}}m',
    inHours: '{{hours}}h {{minutes}}m',
    inDays: '{{days}}d {{hours}}h',
  },

  footer: {
    lead: '{{brand}} is a research tool, not a broker.',
    body: 'Nothing here is financial advice. Signals are model output over public market data, the calendar and news feed are mock fixtures for this MVP, and the AI layer produces risk-management scenarios only — never entries or exits. Always size positions against what you can afford to lose.',
  },
} as const;

/**
 * The shape every other locale must fill: same tree, plain `string` leaves.
 * The index signature lets a locale add plural categories English does not have
 * (Ukrainian needs `_few` / `_many` alongside `_one` / `_other`).
 */
export type Localized<T> = {
  [K in keyof T]: T[K] extends string ? string : Localized<T[K]>;
} & Record<string, unknown>;

export type Translation = Localized<typeof en>;
