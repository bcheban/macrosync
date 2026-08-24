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
    streaming: 'MEXC live stream',
    exchangeData: 'MEXC data',
    disconnected: 'Exchange unreachable',
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
      radar: 'Radar',
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

  liveTrades: {
    title: 'Live Trades',
    subtitle: 'What the alert bot is tracking right now',
    long: 'Long',
    short: 'Short',
    entry: 'Entry',
    record: '{{rate}}% · {{decided}} settled',
    empty:
      'No trades open. The scanner sweeps the liquid MEXC pairs every few minutes and opens one here the moment a call is confirmed.',
  },

  signals: {
    title: 'Strategy Signals',
    live: '{{count}} actionable',
    error: 'Signal engine unreachable — {{message}}',
    empty: 'No signals for this selection',
    onboarding:
      'Pick an asset above to see live MEXC signals — indicators computed from real candles, with a warning when today’s macro calendar lands inside the trade’s horizon.',
    step1: 'Choose assets in the header',
    step2: 'Pick a strategy timeframe',
    step3: 'Read the plan and the macro warning',
    allAssets: 'All',
    focusAria: 'Focus on one asset',
    emptyHint:
      'The engine returns no setup for the current selection. Try another strategy timeframe, or widen the asset universe in the header.',
    emptyFocus: 'No {{asset}} signal on this timeframe',
    emptyFocusHint: 'The other tracked assets may still have setups — switch back to All to see them.',
    showAll: 'Show all assets',
    confluence: 'Confluence',
    plan: 'Trade plan',
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
    /**
     * The one-sentence conclusion, keyed by verdict and by the read that drove
     * it. Descriptive on purpose: it names what the tape is doing, not what it
     * will do next.
     */
    verdict: {
      label: { buy: 'BUY', sell: 'SELL', wait: 'WAIT' },
      side: { buy: 'Long', sell: 'Short', wait: 'No position' },
      buy: {
        trend: 'EMA {{fast}} has pulled above EMA {{slow}} on the {{timeframe}} and the other reads agree — an uptrend that has confirmed, not one being guessed at.',
        momentum: 'MACD is expanding upward on the {{timeframe}} while price holds its trend — momentum is what is carrying this one.',
        reversion: 'RSI {{rsi}} is washed out and momentum has started to turn — this is a snap-back entry, not a trend chase.',
        volume: 'Volume at {{ratio}}× its 20-bar average is confirming the move up — real participation behind the price, not a drift.',
      },
      sell: {
        trend: 'EMA {{fast}} has rolled under EMA {{slow}} on the {{timeframe}} and the other reads agree — a downtrend that has confirmed.',
        momentum: 'MACD is expanding downward on the {{timeframe}} while price stays under its trend — momentum is driving this one lower.',
        reversion: 'RSI {{rsi}} is stretched and momentum has started to roll over — a fade of an overextended move, not a breakdown.',
        volume: 'Volume at {{ratio}}× its 20-bar average is behind the move down — sellers are actually there.',
      },
      wait: {
        trend: 'EMA {{fast}} and EMA {{slow}} are too close to call a direction on the {{timeframe}} — nothing to act on until the trend picks a side.',
        momentum: 'MACD has not committed on the {{timeframe}} — the setup may be building, but it has not confirmed.',
        reversion: 'RSI {{rsi}} sits mid-range with no stretch to fade — no edge either way right now.',
        volume: 'Volume at {{ratio}}× its average is not backing either side — wait for participation before acting.',
      },
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
    summary: '{{currency}} · {{region}} · {{level}} expected impact',
    scheduleSource: 'Economic calendar',
    noEvent: 'No scheduled catalyst',
    noEventHint: 'The calendar has nothing left this week. Technical setups carry their usual weight until the next print is published.',
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

  /** Plain-language explanations for the terms a first-time visitor will stall on. */
  glossary: {
    liveTrades:
      'The trades behind the Telegram alerts. Each one opened when a call was confirmed and closes when price reaches its target or its stop — the win rate counts those two outcomes only. Tap a row to chart that asset.',
    signalsLabel: 'What are strategy signals?',
    signals:
      'Each card is one asset on one timeframe. Indicators are computed from live MEXC candles — nothing is predicted, they only describe what the tape has already done. If a macro release lands inside the trade’s horizon, the card says so.',
    confluenceLabel: 'What is confluence?',
    confluence:
      '0–100: how much four independent reads agree — trend (EMA), momentum (MACD), stretch (RSI) and participation (volume). High means they point the same way, not that the trade will work.',
    levelsLabel: 'Entry, stop and target',
    levels:
      'Entry is the current price. The stop is a multiple of ATR, so a volatile asset gets a wider stop rather than a fixed percentage. The target is a multiple of the risk taken — R:R 2.2 means you risk 1 to make 2.2.',
    atrLabel: 'What is ATR?',
    atr: 'Average True Range: how far this asset typically travels in one bar, as a percent of price. It is the volatility budget a stop has to respect.',
    rsiLabel: 'What is RSI?',
    rsi: 'Relative Strength Index, 0–100. Above ~70 the move is stretched, below ~30 it is washed out. Middle readings say little on their own.',
    impactLabel: 'What is the impact number?',
    impact:
      'Our estimate, 0–99, of how much volatility this release usually injects — built from the calendar’s own impact rating, weighted up for US prints. It is a gauge, not a published figure.',
    insightsLabel: 'How the AI layer works',
    insights:
      'Real headlines from live newsrooms, turned into risk posture: what to do about exposure, stops and sizing around the story. It is instructed never to give a direction. Without an API key a deterministic rule engine produces the same shape of answer.',
    volatilityLabel: 'What is the volatility regime?',
    volatility:
      'Average ATR across the assets you track. Higher regimes mean wider stops and smaller position sizes for the same risk.',
    watchlistLabel: 'About these prices',
    watchlist:
      'Streamed straight from MEXC over a websocket, so they match the exchange tick for tick. The 24h change is reconciled against MEXC’s own ticker.',
  },

  eventQueue: {
    tier: {
      high: 'High impact',
      medium: 'Moderate impact',
      low: 'Low impact',
    },
    showLow: 'Show {{count}} low-impact prints',
    hideLow: 'Hide low-impact prints',
    empty: 'Nothing scheduled for the rest of the week. The calendar feed refreshes as next week is published.',
    tipLabel: 'How the calendar is filtered',
    tip: 'Scheduled economic releases, rated by how hard they usually move markets. Low-impact regional surveys are hidden — US prints get top billing because crypto trades against the dollar.',
    title: 'Event Queue',
    subtitle: 'Scheduled macro & political catalysts',
  },

  /**
   * Event names come from the calendar feed already in English, so there is
   * nothing to translate here — other locales add entries keyed by the slug of
   * the title (see `uk.ts`), and anything missing falls back to the feed.
   */
  events: {},


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

  telegram: {
    cta: 'Signal alerts in Telegram',
    ctaShort: 'Telegram',
    title: '🔔 Get instant signal alerts',
    subtitle: 'Every confirmed BUY or SELL, pushed to Telegram the moment it fires.',
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
