import type { Translation } from './en';

/**
 * Deutsch.
 *
 * Handelsbegriffe bleiben englisch, wo sie im deutschsprachigen Handel auch
 * englisch benutzt werden — Long, Short, Stop, Setup, Trend. Übersetzt wird,
 * was tatsächlich übersetzt gesprochen wird: Einstieg, Ziel, Hebel, Volumen.
 *
 * Die Ansprache ist das förmliche „Sie“ nicht — das Werkzeug redet mit einem
 * Trader, nicht mit einem Kunden, und das englische Original duzt implizit.
 */
export const de: Translation = {
  brand: {
    tagline: 'Makro-synchronisiertes Signal- und Risiko-Terminal',
    pitch: 'Technische Signale, ein Countdown-Radar für Makro-Nachrichten und KI-Risikomanagement für Krypto-Trader.',
  },

  common: {
    refresh: 'Daten aktualisieren',
    showLess: 'Weniger anzeigen',
    retry: 'Erneut versuchen',
    all: 'Alle',
    clear: 'Leeren',
    close: 'Schließen',
    controls: 'Dashboard-Steuerung',
    search: 'Suchen',
  },

  language: {
    label: 'Sprache',
    en: 'English',
    uk: 'Українська',
    de: 'Deutsch',
    enShort: 'EN',
    ukShort: 'UA',
    deShort: 'DE',
  },

  topbar: {
    volatility: 'Volatilität',
    breadth: 'Marktbreite {{value}}%',
    streaming: 'MEXC-Livestream',
    exchangeData: 'MEXC-Daten',
    disconnected: 'Börse nicht erreichbar',
    atr: 'ATR {{value}}%',
    status: 'Marktstatus',
  },

  volatility: {
    low: 'niedrig',
    elevated: 'erhöht',
    high: 'hoch',
    extreme: 'extrem',
  },

  assets: {
    hidden: '{{n}} weitere weiter unten im Volumen-Ranking — über die Suche erreichbar',
    title: 'Asset-Universum',
    subtitle: 'Bestimmt Kursband, Watchlist und Signal-Raster',
    trigger_one: '{{count}} Asset',
    trigger_other: '{{count}} Assets',
    selected: '{{count}} von {{max}} ausgewählt',
    selectGroup: 'Gruppe wählen',
    limit: 'Bis zu {{max}} Assets lassen sich gleichzeitig verfolgen.',
    empty: 'Kein Asset passt zu „{{query}}“.',
    searchPlaceholder: 'BTC, Solana suchen…',
    reset: 'Auf Standard zurücksetzen',
    groups: {
      all: 'Alle',
      majors: 'Majors',
      layer1: 'Layer 1',
      layer2: 'Layer 2',
      defi: 'DeFi',
      meme: 'Meme-Coins',
      ai: 'KI & DePIN',
      radar: 'Radar',
    },
    names: {},
  },

  ticker: {
    label: 'Live-Kurse',
  },

  watchlist: {
    title: 'Watchlist',
    subtitle: '24h-Veränderung · Umsatz',
    volume: 'Vol. {{value}}',
    empty: 'Keine Assets ausgewählt.',
  },

  calc: {
    deposit: 'Einlage',
    risk: 'Risiko pro Trade',
    atRisk: 'Betrag im Risiko',
    size: 'Positionsgröße',
    quantity: 'Menge',
    margin: 'Margin',
    capped: 'Auf deine Einlage begrenzt — die volle Größe braucht mehr Sicherheit, als sie hergibt.',
    stopNote: 'So bemessen, dass der Stop {{pct}}% entfernt genau das Risiko oben kostet.',
    toggle: 'Position berechnen',
    trail: 'Bei {{at}} liegt der Trade 1R vorn — ziehe den Stop auf {{to}} nach, einen ATR ({{atr}}%) dahinter. Sichert Gewinn, ohne die Position dem Rauschen zurückzugeben, das sie gerade überstanden hat.',
    tradeOn: 'Auf MEXC handeln',
  },

  liveTrades: {
    filterStrategy: 'Nach Strategie filtern',
    filterSide: 'Nach Richtung filtern',
    emptyFilter: 'Keine offenen Trades für diese Kombination. Lockere einen der Filter.',
    showMore: '{{count}} weitere anzeigen',
    showLess: 'Weniger anzeigen',
    chartError: 'Kerzen konnten nicht geladen werden',
    chartLoading: 'Kerzen werden geladen…',
    protected: 'Stop auf den Einstieg gezogen',
    hideChart: 'Chart schließen',
    showChart: 'Chart',
    columnEmpty: 'Nichts offen',
    title: 'Laufende Trades',
    subtitle: 'Was der Alert-Bot gerade verfolgt',
    long: 'Long',
    short: 'Short',
    entry: 'Einstieg',
    record: '{{rate}}% · {{decided}} abgeschlossen',
    exposure: 'Offenes Risiko',
    timeLeft: '⏳ {{pct}}% der Zeit verbraucht',
    exposureRisk_one: '{{count}} Position · 1R im Risiko',
    exposureRisk_other: '{{count}} Positionen · {{count}}R im Risiko',
    floating: 'unrealisiert',
    exposureFull: 'Limit erreicht — die Engine öffnet nichts mehr',
    empty:
      'Keine offenen Trades. Der Scanner geht die liquiden MEXC-Paare alle paar Minuten durch und eröffnet hier einen, sobald ein Signal bestätigt ist.',
  },

  journal: {
    title: 'Handelsjournal',
    priceMove: 'Kursbewegung',
    ofDeposit: 'vom Depot',
    whatIsR: 'Was ist R?',
    roiNote: '(1x, ohne Hebel — dieselben Trades wie die Kurve)',
    bySetup: 'Nach Strategie',
    grossAfterFees: '{{gross}} brutto, vor Gebühren',
    fullRecord: '{{wins}}G / {{losses}}V über {{count}} abgeschlossene Trades — die gesamte Bilanz',
    recentWindow: 'Die {{count}} jüngsten, Trade für Trade',
    thin: 'Noch zu wenige abgeschlossene Trades für eine Kurve. Die ersten schließen ein bis zwei Tage nach einem Scan.',
    footnote: 'Kumulierte Rendite in R — eine Einheit ist das Risiko, mit dem ein Trade eröffnet wurde. Umfasst die {{count}} jüngsten abgeschlossenen Trades — nur für diese hält das Protokoll noch Preise; für ältere lässt sich R nicht neu berechnen. Die vollständige Bilanz steht neben dem Live-Board. Ein Call, der weder Ziel noch Stop erreicht, ist weder Gewinn noch Verlust und bleibt draußen.',
  },

  signals: {
    zen: 'Fokus',
    zenShowAll: 'Alle Setups anzeigen',
    zenOff: 'Fokusmodus — Setups ausblenden, die noch keine Calls sind',
    zenOn: 'Fokusmodus an — nur Calls',
    emptyZen: 'Gerade keine Calls',
    emptyZenHint: 'Der Fokusmodus blendet {{count}} Setups aus, die die Engine beobachtet, aber nicht ruft. Schalte ihn aus, um sie zu sehen.',
    track: 'Verfolgen',
    chartShow: 'Chart',
    chartHide: 'Chart ausblenden',
    confidence: 'Konfidenz',
    confidenceLabel: 'Nach Konfidenz filtern',
    riskSimNote: 'Dollarwerte simulieren konstant ${{usd}} Risiko pro Trade.',
    toTarget: 'Zum TP',
    title: 'Strategie-Signale',
    showMore: '{{count}} weitere anzeigen',
    live: '{{count}} handelbar',
    error: 'Signal-Engine nicht erreichbar — {{message}}',
    empty: 'Keine Signale für diese Auswahl',
    onboarding:
      'Wähle oben ein Asset, um Live-Signale von MEXC zu sehen — Indikatoren aus echten Kerzen, mit einer Warnung, wenn der heutige Makro-Kalender in den Horizont des Trades fällt.',
    step1: 'Assets in der Kopfzeile wählen',
    step2: 'Zeitfenster der Strategie wählen',
    step3: 'Plan und Makro-Warnung lesen',
    allAssets: 'Alle',
    focusAria: 'Auf ein Asset fokussieren',
    emptyHint:
      'Die Engine findet für die aktuelle Auswahl kein Setup. Probiere ein anderes Zeitfenster oder erweitere das Asset-Universum in der Kopfzeile.',
    emptyFocus: 'Kein {{asset}}-Signal in diesem Zeitfenster',
    emptyFocusHint: 'Die anderen verfolgten Assets können trotzdem Setups haben — zurück auf „Alle“ schalten.',
    showAll: 'Alle Assets anzeigen',
    confluence: 'Konfluenz',
    plan: 'Trade-Plan',
    entry: 'Einstieg',
    stop: 'SL',
    target: 'TP',
    riskReward: 'CRV',
    risk: 'Risiko',
    details: 'Details',
    leverage: 'Max. Hebel',
    rsi: 'RSI',
    atr: 'ATR',
    volume: 'Vol.',
    strategies: {
      scalping: 'Scalping',
      day: 'Daytrading',
      swing: 'Swing',
    },
    strategyAria: 'Handelsstrategie',
    subtitles: {
      scalping: 'EMA 9/21 · RSI 7 · 5m-Kerzen — kurze Momentum-Schübe',
      day: 'EMA 21/55 · RSI 14 · 1h-Kerzen — Trends über eine Session',
      swing: 'EMA 34/89 · RSI 14 · 4h-Kerzen — Positionen über mehrere Tage',
    },
    direction: {
      long: 'Long-Neigung',
      short: 'Short-Neigung',
      neutral: 'Kein Vorteil',
    },
    status: {
      live: 'Live',
      forming: 'Bildet sich',
      cooling: 'Kühlt ab',
    },
    verdict: {
      label: { buy: 'KAUFEN', sell: 'VERKAUFEN', wait: 'WARTEN' },
      side: { buy: 'Long', sell: 'Short', wait: 'Keine Position' },
      buy: {
        trend:
          'EMA {{fast}} ist im {{timeframe}} über EMA {{slow}} gestiegen, und die übrigen Messwerte stimmen zu — ein bestätigter Aufwärtstrend, kein vermuteter.',
        momentum:
          'Der MACD weitet sich im {{timeframe}} nach oben aus, während der Kurs seinen Trend hält — hier trägt das Momentum.',
        reversion:
          'RSI {{rsi}} ist ausgewaschen und das Momentum beginnt zu drehen — ein Gegenbewegungs-Einstieg, kein Trendlauf.',
        volume:
          'Volumen bei {{ratio}}× seines 20-Kerzen-Schnitts bestätigt die Aufwärtsbewegung — echte Beteiligung, kein Dahintreiben.',
      },
      sell: {
        trend:
          'EMA {{fast}} ist im {{timeframe}} unter EMA {{slow}} gekippt, und die übrigen Messwerte stimmen zu — ein bestätigter Abwärtstrend.',
        momentum:
          'Der MACD weitet sich im {{timeframe}} nach unten aus, während der Kurs unter seinem Trend bleibt — das Momentum treibt hier nach unten.',
        reversion:
          'RSI {{rsi}} ist überdehnt und das Momentum beginnt zu kippen — ein Ausverkauf einer Übertreibung, kein Zusammenbruch.',
        volume:
          'Volumen bei {{ratio}}× seines 20-Kerzen-Schnitts steht hinter der Abwärtsbewegung — die Verkäufer sind tatsächlich da.',
      },
      wait: {
        trend:
          'EMA {{fast}} und EMA {{slow}} liegen im {{timeframe}} zu dicht beieinander für eine Richtung — nichts zu tun, bis der Trend sich entscheidet.',
        momentum:
          'Der MACD hat sich im {{timeframe}} nicht festgelegt — das Setup baut sich vielleicht auf, bestätigt ist es nicht.',
        reversion: 'RSI {{rsi}} liegt mittig ohne Überdehnung — im Moment kein Vorteil in beide Richtungen.',
        volume: 'Volumen bei {{ratio}}× seines Schnitts stützt keine Seite — auf Beteiligung warten.',
      },
    },
    rationale: {
      trendFlat: 'EMA {{fast}}/{{slow}} flach — kein Richtungsvorteil aus dem Trend',
      trendAbove: 'EMA {{fast}} liegt {{spread}}% über EMA {{slow}}',
      trendBelow: 'EMA {{fast}} liegt {{spread}}% unter EMA {{slow}}',
      macdPositiveExpanding: 'MACD-Histogramm im {{timeframe}} positiv und ausweitend',
      macdPositiveFlat: 'MACD-Histogramm im {{timeframe}} positiv, aber flach',
      macdNegativeExpanding: 'MACD-Histogramm im {{timeframe}} negativ und ausweitend',
      macdNegativeFlat: 'MACD-Histogramm im {{timeframe}} negativ, aber flach',
      rsiStretched: 'RSI {{rsi}} — überdehnt, erhöhtes Nachlaufrisiko',
      rsiWashedOut: 'RSI {{rsi}} — ausgewaschen, erhöhtes Rückschlagrisiko',
      rsiNeutral: 'RSI {{rsi}} liegt im neutralen Band',
      volume: 'Volumen {{ratio}}× des 20-Kerzen-Schnitts',
    },
    eventWarning: '{{event}} in {{minutes}} Min — innerhalb des Horizonts dieses Setups',
  },

  countdown: {
    badge: 'Nachrichten-Countdown-Radar',
    impact: 'Wirkung',
    days: 'Tage',
    hours: 'Std',
    minutes: 'Min',
    seconds: 'Sek',
    forecast: 'Prognose',
    previous: 'Vorher',
    summary: '{{currency}} · {{region}} · erwartete Wirkung {{level}}',
    scheduleSource: 'Wirtschaftskalender',
    noEvent: 'Kein geplanter Auslöser',
    noEventHint: 'In den nächsten sieben Tagen kein geplanter Katalysator. Der Kalender-Feed veröffentlicht eine Woche am Stück und wechselt sonntags, ein stiller Samstag heißt also meist, dass der Plan für nächste Woche noch nicht da ist. Bis dahin zählen technische Setups wie gewohnt.',
    riskWindow: 'Risikofenster offen',
    importance: 'Wirkung {{level}} · {{region}}',
    warning:
      'In diesem Fenster verlieren technische Setups an Verlässlichkeit — Momentum- und Rückkehrmodelle haben keine Eingabe für eine Zahl, die es noch nicht gibt. Positionsgrößen verkleinern, Stops innerhalb der erwarteten Veröffentlichungsspanne weiten oder entfernen, und jedes Signal unten als vorläufig behandeln.',
    categories: {
      monetary: 'Zentralbank',
      macro: 'Makrodaten',
      political: 'Politik',
      crypto: 'Krypto-eigen',
    },
  },

  importance: {
    high: 'hoch',
    medium: 'mittel',
    low: 'niedrig',
  },

  glossary: {
    rMultiple:
      '1R ist dein fester Einsatz pro Trade — der Betrag, den du verlierst, wenn der Stop-Loss auslöst. Ein Trade, der das Doppelte seines Risikos verdient hat, ist +2R; einer, der den Stop erwischt, −1R. So werden ein Swing mit weitem Stop und ein Scalp mit engem vergleichbar, unabhängig davon, wie viel jemand tatsächlich einsetzt.',
    confidenceBands:
      'Der Konfluenzwert hinter jedem Call, 0–100: wie stark Trend, Momentum, Mean Reversion und Volumen übereinstimmten. Die Bereiche sind halboffen, 70 gehört also zu 70–80 und nie zu beiden. Die Zeile darunter zeigt, womit jeder Bereich tatsächlich abgeschlossen hat, samt Stichprobengröße — eine Quote über neun Trades ist nicht dieselbe Art von Zahl wie eine über zweihundert, und genau darauf würde eine Neukalibrierung fußen. Werte unter 60 gehören zu keinem Bereich und werden nicht in den untersten gezählt.',
    leverage:
      'Der höchste Hebel, bei dem der Liquidationspreis noch deutlich hinter dem Stop liegt — berechnet aus der Erhaltungsmarge dieses Kontrakts, die auf der Börse zwischen 0,04% und 5% schwankt. Er sagt, dass nicht die Liquidation den Trade beendet. Über eine sinnvolle Positionsgröße sagt er nichts.',
    liveTrades:
      'Die Trades hinter den Telegram-Meldungen. Jeder wurde eröffnet, als ein Signal bestätigt war, und schließt, wenn der Kurs sein Ziel oder seinen Stop erreicht — die Trefferquote zählt nur diese beiden Ausgänge. Auf eine Karte tippen, um das Asset zu charten.',
    signalsLabel: 'Was sind Strategie-Signale?',
    signals:
      'Jede Karte ist ein Asset in einem Zeitfenster. Die Indikatoren stammen aus echten MEXC-Kerzen — nichts wird vorhergesagt, sie beschreiben nur, was der Markt bereits getan hat. Fällt eine Makro-Veröffentlichung in den Horizont des Trades, steht das auf der Karte.',
    confluenceLabel: 'Was ist Konfluenz?',
    confluence:
      '0–100: wie stark vier unabhängige Messwerte übereinstimmen — Trend (EMA), Momentum (MACD), Überdehnung (RSI) und Beteiligung (Volumen). Hoch heißt, sie zeigen in dieselbe Richtung, nicht dass der Trade aufgeht.',
    levelsLabel: 'Einstieg, SL und die TP-Leiter',
    levels:
      'Der Einstieg ist der aktuelle Kurs. Der Stop ist ein Vielfaches der ATR, damit ein volatiles Asset einen weiteren Stop bekommt statt eines festen Prozentsatzes. Das Ziel ist ein Vielfaches des eingegangenen Risikos — CRV 2,2 heißt, du riskierst 1, um 2,2 zu verdienen.',
    atrLabel: 'Was ist die ATR?',
    atr: 'Average True Range: wie weit sich dieses Asset in einer Kerze üblicherweise bewegt, in Prozent des Kurses. Sie ist das Volatilitätsbudget, das ein Stop einhalten muss.',
    rsiLabel: 'Was ist der RSI?',
    rsi: 'Relative Strength Index, 0–100. Über ~70 ist die Bewegung überdehnt, unter ~30 ausgewaschen. Werte in der Mitte sagen für sich genommen wenig.',
    impactLabel: 'Was bedeutet die Wirkungszahl?',
    impact:
      'Unsere Schätzung von 0–99, wie viel Volatilität diese Veröffentlichung üblicherweise auslöst — aufgebaut auf der Wirkungsbewertung des Kalenders, höher gewichtet für US-Zahlen. Ein Anhaltspunkt, keine veröffentlichte Kennzahl.',
    insightsLabel: 'Wie die KI-Ebene arbeitet',
    insights:
      'Echte Schlagzeilen aus Live-Redaktionen, übersetzt in eine Risikohaltung: was mit Exponierung, Stops und Größe rund um die Nachricht zu tun ist. Sie ist angewiesen, nie eine Richtung zu nennen. Ohne API-Schlüssel erzeugt eine deterministische Regel-Engine dieselbe Art von Antwort.',
    volatilityLabel: 'Was ist das Volatilitätsregime?',
    volatility:
      'Durchschnittliche ATR über die von dir verfolgten Assets. Höhere Regime bedeuten weitere Stops und kleinere Positionen für dasselbe Risiko.',
    watchlistLabel: 'Zu diesen Kursen',
    watchlist:
      'Direkt von MEXC über einen Websocket gestreamt, also tickgenau wie an der Börse. Die 24h-Veränderung stammt aus demselben Feed.',
  },

  eventQueue: {
    tier: {
      high: 'Hohe Wirkung',
      medium: 'Mittlere Wirkung',
      low: 'Geringe Wirkung',
    },
    showLow: '{{count}} Zahlen mit geringer Wirkung anzeigen',
    hideLow: 'Zahlen mit geringer Wirkung ausblenden',
    empty:
      'Für den Rest der Woche ist nichts angesetzt. Der Kalender aktualisiert sich, sobald die nächste Woche veröffentlicht ist.',
    tipLabel: 'Wie der Kalender gefiltert wird',
    tip: 'Angesetzte Wirtschaftsdaten, bewertet danach, wie stark sie Märkte üblicherweise bewegen. Regionale Umfragen mit geringer Wirkung sind ausgeblendet — US-Zahlen stehen oben, weil Krypto gegen den Dollar handelt.',
    title: 'Termin-Warteschlange',
    subtitle: 'Angesetzte Makro- und politische Auslöser',
  },

  events: {},

  insights: {
    title: 'Umsetzbare KI-Einschätzungen',
    subtitle: 'Schlagzeilen in Risikohaltung übersetzt — nie Richtungsaussagen',
    error: 'Einschätzungsdienst nicht erreichbar — {{message}}',
    riskScenarios: 'Risikoszenarien',
    riskControls: 'Risikokontrollen',
    invalidation: 'Widerlegung',
    conviction: '{{value}}% Überzeugung',
    volatilityTag: 'Vol.: {{level}}',
    more_one: '{{count}} weiteres Szenario',
    more_other: '{{count}} weitere Szenarien',
    provider: {
      anthropic: 'Claude',
      openai: 'GPT',
      heuristic: 'Regel-Engine',
    },
    sentiment: {
      bullish: 'Bullischer Ton',
      bearish: 'Bärischer Ton',
      neutral: 'Gemischter Ton',
    },
    posture: {
      defensive: 'Defensive Haltung',
      neutral: 'Neutrale Haltung',
      constructive: 'Konstruktive Haltung',
    },
    volLabel: {
      low: 'komprimierte Volatilität',
      elevated: 'erhöhte Volatilität',
      high: 'hohe Volatilität',
      extreme: 'extreme Volatilität',
    },
    leverageCap: {
      low: '5x',
      elevated: '3x',
      high: '2x',
      extreme: '1x (nur Spot)',
    },
    heuristic: {
      majors: 'Majors',
      trigger: {
        bearishTone: 'Bärischer Ton + {{volLabel}}',
        constructiveTone: 'Konstruktiver Ton + {{volLabel}}',
        ambiguous: 'Mehrdeutige Schlagzeile + {{volLabel}}',
        eventCountdown: '{{event}} in {{minutes}} Min',
        highImpact: 'Hohe Schlagzeilenwirkung + dünne Orderbuchtiefe',
        broadBreadth: 'Breite Beteiligung über die Majors',
        narrowBreadth: 'Enge Marktbreite — Führung auf einen Wert konzentriert',
      },
      response: {
        bearishTone:
          'Stops bei {{assets}} auf {{stop}} ATR straffen, Positionsgröße um {{size}}% kürzen und keine neuen gehebelten Longs, bis sich der Markt beruhigt.',
        constructiveHeavy:
          'Bestehende Positionen laufen lassen, aber nicht in die Stärke nachkaufen — Stops bei {{stop}} ATR nachziehen und neues Risiko unter der halben normalen Größe halten.',
        constructiveCalm:
          'Risiko in {{assets}} wieder Richtung normal fahren, Stops bei {{stop}} ATR nachziehen und vorab festlegen, welchen Rückgang du vor dem Nachkaufen akzeptierst.',
        ambiguous:
          'Bis zur Kursbestätigung als Rauschen behandeln: bestehende Positionen halten, kein frisches Risiko in {{assets}} und den {{stop}}-ATR-Stop entscheiden lassen.',
        eventCountdown:
          'Kurzfristige Positionen vor der Zahl glattstellen oder absichern. Limit-Orders weiter setzen, in den ersten 60 Sekunden 2–4× normalen Slippage erwarten und erst wieder einsteigen, wenn die ersten {{settle}} Minuten der Spanne nach der Veröffentlichung stehen.',
        highImpact:
          'Von Liquiditätslücken ausgehen: Market-Orders durch gestaffelte Limits ersetzen, Einzelticket auf 25% der sichtbaren Tiefe begrenzen und jeden Stop deaktivieren, der innerhalb des Spreads auslösen würde.',
        broadBreadth:
          'Die Korrelation ist hoch, also getrennte Positionen als eine Wette behandeln: Risiko über das ganze Buch zusammenrechnen, bevor etwas Neues dazukommt.',
        narrowBreadth:
          'Erhöhtes Rotationsrisiko. Alt-Exponierung begrenzen und Pulver für die Majors trocken halten, wo die Tiefe am größten ist.',
      },
      control: {
        maxRisk: 'Maximales Risiko pro Position: {{pct}} des Kontokapitals.',
        stopDistance: 'Stop-Abstand: {{stop}} ATR(14) im Handelszeitfenster — nie ein fester Prozentsatz.',
        leverageCap: 'Hebelgrenze, solange dieses Regime hält: {{cap}}.',
        eventBlackout: 'Kein neues Intraday-Risiko im Fenster von {{minutes}} Min vor {{event}}.',
        reevaluate: 'Exponierung zu jedem 4h-Schluss neu bewerten, solange die Schlagzeile den Fluss bestimmt.',
      },
      invalidation: {
        bearish:
          'Eine Rückeroberung der Spanne von vor der Schlagzeile bei steigendem Volumen hieße, der Markt hat die Nachricht verdaut — die defensive Haltung kann gelockert werden.',
        bullish:
          'Hält das Tief nach der Schlagzeile bei fallendem Volumen nicht, ist die Nachfrage nicht echt — zurück in die defensive Haltung.',
        neutral:
          'Ein entschiedener Bruch der Tagesspanne in eine der beiden Richtungen bei 1,5× durchschnittlichem Volumen hebt das Abwarten auf.',
      },
      thesis: {
        bearish: {
          heavy:
            'Bärische Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in Positionsgröße und Slippage, nicht in der Richtung.',
          calm: 'Bärische Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in der Sorglosigkeit: Das Regime kann mit der nächsten Zahl kippen.',
        },
        constructive: {
          heavy:
            'Konstruktive Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in Positionsgröße und Slippage, nicht in der Richtung.',
          calm: 'Konstruktive Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in der Sorglosigkeit: Das Regime kann mit der nächsten Zahl kippen.',
        },
        mixed: {
          heavy:
            'Gemischte Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in Positionsgröße und Slippage, nicht in der Richtung.',
          calm: 'Gemischte Schlagzeile trifft auf {{volLabel}} — das Risiko liegt hier in der Sorglosigkeit: Das Regime kann mit der nächsten Zahl kippen.',
        },
      },
    },
  },

  time: {
    secondsAgo: 'vor {{count}} Sek',
    minutesAgo: 'vor {{count}} Min',
    hoursAgo: 'vor {{count}} Std',
    daysAgo: 'vor {{count}} T',
    inMinutes: '{{minutes}} Min',
    inHours: '{{hours}} Std {{minutes}} Min',
    inDays: '{{days}} T {{hours}} Std',
  },

  telegram: {
    cta: 'Signal-Meldungen in Telegram',
    ctaShort: 'Telegram',
    title: '🔔 Signale sofort erhalten',
    subtitle: 'Jedes bestätigte KAUFEN oder VERKAUFEN, in dem Moment nach Telegram geschickt, in dem es auslöst.',
  },

  footer: {
    lead: '{{brand}} ist ein Analysewerkzeug, kein Broker.',
    body: 'Nichts hiervon ist Anlageberatung. Signale sind Modellausgaben auf öffentlichen Marktdaten, und die KI-Ebene erzeugt ausschließlich Risikomanagement-Szenarien — nie Ein- oder Ausstiege. Positionen immer so bemessen, wie du den Verlust verkraften kannst.',
  },
};
