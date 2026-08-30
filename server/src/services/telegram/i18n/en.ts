/**
 * The bot's English copy, and the shape every other language must match.
 *
 * Values are either a string or a function taking named parameters. Functions
 * rather than `{{placeholder}}` templates because a translator needs to move a
 * number to a different position in the sentence, and in German that is not
 * optional — the verb goes where the verb goes.
 */
export const en = {
  // --- onboarding -----------------------------------------------------------
  chooseLanguage: '🌍 <b>Choose your language</b>\n\nAll alerts and menus will use it.',
  languageSet: '🌍 Language set to <b>English</b>.',

  welcomeIntro: '📡 <b>Ayanox</b> — an automated futures radar.',
  welcomeBody:
    'It scans the liquid USDT perpetuals on MEXC around the clock, and when a setup confirms you get the call: entry, TP, SL, the reasoning in one sentence, and the leverage at which liquidation still sits clear of the stop.',
  welcomeSubscribed:
    'You are subscribed. The buttons below the keyboard are everything else — settings, the guide, a position calculator, and the record.',
  helpIntro: '📡 <b>Ayanox</b> — an automated futures radar for MEXC perpetuals.',

  /**
   * One line per command, in the reader's language.
   *
   * The list itself lives in `commands.json` — order, syntax, icon and which
   * are primary are the same in every language. Only the prose is here, so a
   * command added there fails to compile until all three files carry its line.
   * That is the point: a glossary that silently falls back to English reads as
   * a half-translated bot, which is worse than an obviously missing one.
   */
  commandHelp: {
    settings: "Choose which strategies you want — Scalping, Day Trading, Swing. Only what is ticked reaches you.",
    balance: "Set your account size and risk per trade to get a personalised margin in every signal. <code>/balance 1000 1</code> is a $1,000 deposit at 1% risk.",
    calc: "Position size, coin quantity and margin for any levels. Leave the levels out and it prices the newest open call against your saved deposit.",
    stats: "The global win rate and how the algorithm has actually performed.",
    watching: "The setups you tapped Track on. <code>/watching clear</code> drops all of them.",
    guide: "Short explainers you can browse: which strategy is which, why a 35% win rate makes money, and how the leverage figure is worked out.",
    stats_deep: "Win rate with and without break-even trades, whether confidence predicts outcome, and what the scratched trades did next.",
    help: "Show this instruction menu.",
    mute: "Two hours of quiet. You stay subscribed.",
    unmute: "Lift a mute early.",
    start: "Subscribe. Also lifts a mute.",
    stop: "Unsubscribe. Send /start whenever you want them back.",
  },
  commandsHeading: '<b>Commands</b>',
  alsoHeading: '<b>Also</b>',
  disclaimerLong:
    '<i>MEXC perpetuals. Model output over public market data — not financial advice, and no order is ever placed for you.</i>',
  disclaimerShort: '<i>Not financial advice. No order is ever placed for you.</i>',

  // --- settings -------------------------------------------------------------
  settingsTitle: '⚙️ <b>Settings</b>',
  settingsStrategies: '<b>Strategies</b> — which setups reach you',
  settingsChannels: '<b>Notifications</b> — which moments reach you',
  settingsLanguage: '<b>Language</b>',
  settingsHint: 'Tap anything to turn it on or off.',

  strategyScalping: '⚡ Scalping',
  strategyDay: '📅 Day trading',
  strategySwing: '🌊 Swing',
  strategyScalpingHint: '5m bars, 15 minutes to 2 hours',
  strategyDayHint: '1h bars, 2 to 12 hours',
  strategySwingHint: '4h bars, 1 to 4 days',

  channelSignals: '🟢 New signals',
  channelUpdates: '🛡 Updates',
  channelResults: '🏁 Results',
  channelSignalsHint: 'entry alerts',
  channelUpdatesHint: 'stop moved to breakeven',
  channelResultsHint: 'target or stop hit',

  settingsAllOff:
    '<i>Everything is off. You stay subscribed and simply hear nothing until you turn something back on.</i>',
  settingsStranded:
    '⚠️ <i>Results are off while new signals are on: you will be told when to enter and never told when it ends. Close your positions on your own terms.</i>',
  settingsSaved: 'Saved',

  // --- signals --------------------------------------------------------------
  alertLong: 'LONG',
  alertShort: 'SHORT',
  alertEntry: 'Entry',
  alertStop: 'SL',
  alertTarget: 'TP',
  alertRiskReward: 'Risk / reward',
  alertConfidence: 'Confidence',
  alertToTarget: 'Move to TP',
  alertUnleveraged: '1x, before leverage',
  alertLeverage: 'Max safe leverage',
  alertLeverageNote: 'liquidation stays past the SL — a ceiling, not a suggestion',
  alertRisk: (pct: string) => `Risk ${pct}% of deposit`,

  sizingMargin: (margin: string, leverage: number, risk: string, balance: string) =>
    `💰 <b>Margin ${margin}</b> at ${leverage}x — risking <b>${risk}</b> of ${balance}`,
  sizingCapped: (riskPct: number) =>
    `⚠️ <i>Capped at your balance: the full size for ${riskPct}% risk needs more collateral than the account holds.</i>`,

  // --- updates --------------------------------------------------------------
  breakevenTitle: (base: string) => `🛡 <b>${base}</b> — halfway to target`,
  breakevenFrom: (side: string, entry: string) => `<i>${side} from ${entry}</i>`,
  breakevenMoved: (entry: string) => `Stop moved to entry: <code>${entry}</code>`,
  breakevenWas: (was: string) => `<i>Was ${was}. From here the trade cannot cost you anything.</i>`,

  // --- results --------------------------------------------------------------
  closeWin: '✅ <b>Target hit</b>',
  closeLoss: '❌ <b>Stopped out</b>',
  closeBreakeven: '🛡 <b>Closed at breakeven</b>',
  closeExit: 'Exit',
  closeResult: 'Result',

  // --- stats ----------------------------------------------------------------
  // --- tracked setups -------------------------------------------------------
  watchAdded: (base: string, strategy: string) =>
    `👁 Watching <b>${base}</b> on ${strategy}.\n\nYou will hear from me once the engine turns that setup into a call — once, and then the watch is done. Tap the button again to re-arm it.`,
  watchAlready: (base: string) => `👁 Already watching <b>${base}</b> on that timeframe.`,
  watchFull: '👁 That is as many setups as one chat can watch at a time. Send /watching clear to start over.',
  watchNone: '👁 Nothing on watch. The Track button on a card adds one.',
  watchList: (rows: string[]) =>
    `👁 <b>On watch</b>\n\n${rows.map((row) => `· ${row}`).join('\n')}\n\n<i>/watching clear removes all of them.</i>`,
  watchCleared: (n: number) => `👁 Cleared ${n} watch${n === 1 ? '' : 'es'}.`,
  watchTriggered: (base: string, strategy: string) =>
    `👁 <b>${base}</b> — the ${strategy} setup you were watching is now a call.`,
  statsNone: '📊 No trades on the record yet. The first confirmed call opens one.',
  statsOnlyOpen: (open: number) =>
    `📊 No settled trades yet — ${open} still open. The record starts when the first one closes.`,
  /** The headline: what every settled trade adds up to, in units of risk. */
  statsNet: (r: string, usd: string, settled: number) =>
    `📊 <b>Net result ${r}</b> <i>(${usd} if risking $100 per trade)</i>\n<i>over ${settled} settled trades</i>`,
  /** Raw price movement summed across settled trades — no leverage, no sizing. */
  statsRoi: (pct: string) =>
    `📈 <b>Cumulative ROI ${pct}</b> <i>(1x, unleveraged price movement)</i>`,
  statsRate: (rate: number, wins: number, losses: number) =>
    `📊 <b>Win rate ${rate}%</b> — ${wins}W / ${losses}L`,
  /** Heading for the per-setup split. Only rendered when a setup has a record. */
  statsByStrategy: '<b>By setup</b>',
  statsStrategyRow: (label: string, rate: number, wins: number, losses: number) =>
    `${label} — <b>${rate}%</b> · ${wins}W / ${losses}L`,
  statsScopeNote: (shown: number, lifetime: number) =>
    `<i>Figures cover the most recent ${shown} decided trades. ${lifetime} have been decided since the record began; the older ones have rolled out of the detailed log.</i>`,
  statsOpen: (n: number) => `📈 ${n} trade${n === 1 ? '' : 's'} open right now`,
  /** The record cut by the confluence reading each call was made on. */
  statsByConfidence: '<b>By confidence</b>',
  statsConfidenceRow: (
    label: string,
    rate: number,
    wins: number,
    decided: number,
    r: string,
    usd: string,
    thin: boolean,
  ) =>
    thin
      ? `<code>${label}</code>  <i>${rate}% · ${wins}/${decided} · ${r} (${usd})</i> ⚠️`
      : `<code>${label}</code>  <b>${rate}%</b> · ${wins}/${decided} · ${r} (${usd})`,
  statsRiskNote: (usd: number) =>
    `💡 <i>Dollar figures are a simulation assuming exactly $${usd} is put at risk — the amount lost if SL is hit — on every single trade. 1R = that risk.</i>`,
  statsThinNote: (n: number) =>
    `<i>⚠️ fewer than ${n} settled trades — not yet evidence.</i>`,
/*
   * What counts, said as a rule rather than as a list of exclusions.
   *
   * It used to enumerate the three ways a call can end without a verdict, and
   * then a counter beside the win rate reported one of them. Neither belongs
   * here: an expired call is not an event in anyone's account, and printing a
   * tally of them next to wins and losses invites the reader to add all three
   * into one denominator that no figure on this message uses.
   */
  statsFootnote:
    '<i>A trade counts once it reaches TP or SL. Anything that ends without doing either is neither a win nor a loss, so it stays out of every figure above.</i>',

  // --- balance --------------------------------------------------------------
  balanceInvalid: '⚠️ <b>Invalid format.</b>',
  balanceHowTo:
    'To set up your position sizing, send your deposit and the percentage of it you are willing to risk on one trade.',
  balanceExample1: '— $1,000 deposit, 1% risk',
  balanceExample2: '— risk defaults to 1%',
  balanceExample3: '— reset',
  balanceTooLarge: 'That deposit looks like a typo — if it is not, size that one by hand.',
  balanceRiskTooLarge:
    'Risking more than 20% of an account on a single trade is not something this bot will size for you.',
  balanceCleared: '💰 Cleared. Alerts will arrive without a position size until you set one again.',
  balanceSaved: (balance: string, riskPct: number) =>
    `💰 Saved: <b>${balance}</b> at <b>${riskPct}%</b> risk.`,
  balanceSavedBody: (perTrade: string) =>
    `Every alert will now carry the margin for a position that loses <b>${perTrade}</b> if its stop fills.`,
  balanceSavedNote: '<i>Sizing only. Nothing is placed for you, and nothing here is advice.</i>',

  // --- mute / stop ----------------------------------------------------------
  muted: (hours: number) => `🔕 Quiet for ${hours} hours. Send /unmute to lift it early.`,
  unmuted: '🔔 Alerts are back on.',
  stopped: '👋 Unsubscribed. Send /start whenever you want them back.',
  muteButton: (hours: number) => `🔕 Mute ${hours}h`,
  openTerminal: '🖥 Open terminal',
  statsButton: '📊 Stats',

  // --- guide ----------------------------------------------------------------
  guideTitle: '📚 <b>Guide</b>',
  guideIntro: 'Pick a topic. Each one is short and answers a single question.',
  guideBack: '← Back',
  guideStrategies: '📖 Strategies',
  guideRisk: '🛡 Risk & R:R',
  guideLeverage: '🧮 Leverage & stops',

  guideStrategiesBody: [
    '📖 <b>Which strategy is which</b>',
    '',
    '⚡ <b>Scalping</b> — 5-minute bars, 15 minutes to 2 hours.',
    'Fast, frequent, and it wants your attention. Wrong for anyone who cannot watch a screen.',
    '',
    '📅 <b>Day trading</b> — hourly bars, 2 to 12 hours.',
    'The middle setting: a handful of calls a day, each with room to breathe.',
    '',
    '🌊 <b>Swing</b> — 4-hour bars, 1 to 4 days.',
    'Few calls, wide stops, and long waits. The one that suits a job.',
    '',
    '<i>Turn off what you cannot trade. A scalp you see three hours late is not a scalp.</i>',
  ].join('\n'),

  guideRiskBody: [
    '🛡 <b>Why a 35% win rate makes money</b>',
    '',
    'Every call risks 1 to make 2.2. That ratio is what decides profitability — not how often you are right.',
    '',
    'Over 100 trades at 35%:',
    '  35 wins × 2.2 = <b>+77</b>',
    '  65 losses × 1 = <b>−65</b>',
    '  net <b>+12</b> units',
    '',
    'The break-even win rate at 2.2 R:R is <b>31%</b>. Below it you lose however clever the entries look; above it you make money being wrong most of the time.',
    '',
    '<i>This is arithmetic, not a promise. It assumes you take every call at the stated size and hold the stop — skipping the losers you dislike is what turns the maths against you.</i>',
  ].join('\n'),

  guideLeverageBody: [
    '🧮 <b>Leverage and stops</b>',
    '',
    'Every alert carries a <b>max safe leverage</b>. It answers exactly one question: at what leverage does liquidation stay clear of the stop?',
    '',
    'The stop is a multiple of ATR, so a volatile coin gets a wider stop rather than a fixed percentage. Liquidation sits roughly <code>1/leverage</code> from entry, minus the contract maintenance margin — which runs from 0.04% to 5% across the board, so it is read per contract rather than assumed.',
    '',
    'The figure keeps liquidation <b>1.5×</b> further out than the stop. At 1× they coincide, and liquidation wins: your stop fills at your price, liquidation triggers off the mark price, which moves independently and can gap.',
    '',
    '⚠️ <i>It says liquidation will not close the trade. It says nothing about whether the size is sensible. Send /balance and the bot will work the size out for you.</i>',
  ].join('\n'),

  // --- deep stats -----------------------------------------------------------
  deepTitle: '📐 <b>Deep stats</b>',
  deepThreshold: (pct: number) => `<i>Break-even moves the stop at ${pct}% of the way to target</i>`,
  deepRateHeading: '<b>Win rate</b>',
  deepRateNone: '  Nothing settled yet.',
  deepRateExcl: (rate: number, wins: number, losses: number) =>
    `  Excluding break-even: <b>${rate}%</b>  (${wins}W / ${losses}L)`,
  deepRateIncl: (rate: number, breakeven: number) =>
    `  Counting break-even as a non-win: <b>${rate}%</b>  (+${breakeven} scratched)`,
  deepRateThin: (sample: number) => `  <i>${sample} settled trades — too few to draw a conclusion from.</i>`,
  deepConfidenceHeading: '<b>Confidence vs outcome</b>',
  deepConfidence: (r: number, sample: number, won: number, lost: number) =>
    `  r = <b>${r}</b> over ${sample} trades  (winners averaged ${won}, losers ${lost})`,
  deepConfidenceNone: 'No settled trade carries a confluence score yet.',
  deepConfidenceThin: (sample: number) => `Too few trades (${sample}) to act on — treat it as a placeholder.`,
  deepWhatIfHeading: '<b>What the scratched trades did next</b>',
  deepWhatIfTarget: (n: number) => `  Reached the target anyway: <b>${n}</b>`,
  deepWhatIfStop: (n: number) => `  Hit the original stop:     <b>${n}</b>`,
  deepWhatIfNeither: (n: number) => `  Neither, before expiry:    <b>${n}</b>`,
  deepWhatIfProjected: (projected: number, now: number) =>
    `  Rate had none been scratched: <b>${projected}%</b>  (against ${now}% now)`,
  deepWhatIfNone: 'No scratched trade can be replayed yet.',
  deepWhatIfNoisy: (won: number, lost: number, neither: number) =>
    `${won} went on to reach the target against ${lost} that hit the original stop — inside one standard error of a coin flip, so it points a direction without proving one. ${neither} more went nowhere and would simply have expired.`,
  deepWhatIfClear: (won: number, lost: number) =>
    `${won} reached the target against ${lost} that hit the original stop — outside coin-flip range, so the threshold is worth moving.`,
  deepStale: (minutes: number) => `<i>Snapshot from ${minutes} min ago.</i>`,

  // --- shareable result card ------------------------------------------------
  cardWin: 'TARGET HIT',
  cardLoss: 'STOPPED OUT',
  cardScratch: 'BREAK-EVEN',
  cardRoi: 'ROI',
  cardRR: 'R:R',
  cardHeld: 'Held',
  cardFooter: 'via @AyanoxTradeBot',

  // --- settings sub-menus ---------------------------------------------------
  settingsBack: '\u00AB Back to settings',
  settingsRootHint: 'Two things to set, and the language. Tap one.',
  settingsStrategiesButton: 'Strategies',
  settingsChannelsButton: 'Notification types',
  settingsStrategiesTitle: '\u{1F4CA} <b>Strategies</b> \u2014 which setups reach you',
  settingsChannelsTitle: '\u{1F514} <b>Notification types</b> \u2014 which moments reach you',
  settingsPickOne: '\u26A0\uFE0F <i>Nothing is on, so no calls will reach you. Tap a strategy to start.</i>',

  // --- deep link ------------------------------------------------------------
  tradeOnMexc: '\u{1F680} Trade on MEXC',

  // --- calculator -----------------------------------------------------------
  calcUsage: [
    '\u{1F9EE} <b>Position calculator</b>',
    '',
    'Send your deposit, the percent you will risk, and the levels:',
    '',
    '<code>/calc 1000 2 5.60 5.32</code>',
    '<i>deposit \u2014 risk% \u2014 entry \u2014 stop</i>',
    '',
    'Leave the levels out and it uses the account you saved with /balance against the most recent call:',
    '',
    '<code>/calc</code>  \u2014 saved deposit, latest signal',
    '<code>/calc 500 1</code>  \u2014 these numbers, latest signal',
  ].join('\n'),
  calcNoLevels: '\u26A0\uFE0F No open call to price against. Send entry and stop yourself: <code>/calc 1000 2 5.60 5.32</code>',
  calcNoAccount: '\u26A0\uFE0F No deposit saved. Send <code>/calc 1000 2</code>, or set one with /balance.',
  calcBadLevels: '\u26A0\uFE0F Entry and stop cannot be the same price, and neither can be zero.',
  calcTitleCustom: '\u{1F9EE} <b>Position</b>',
  calcTitle: (base: string) => `\u{1F9EE} <b>${base}</b> \u2014 position`,
  calcFromSignal: (base: string) => `<i>Levels from the open ${base} call.</i>`,
  calcAccount: (deposit: string, riskPct: number, risk: string) =>
    `Deposit <b>${deposit}</b> \u00B7 risking <b>${riskPct}%</b> = <b>${risk}</b>`,
  calcStopDistance: (pct: string) => `Stop is <b>${pct}%</b> from entry`,
  calcSize: (notional: string) => `\u{1F4E6} Position size: <b>${notional}</b>`,
  calcQty: (qty: string, base: string) => `\u{1FA99} Quantity: <b>${qty}</b> ${base}`,
  calcMargin: (margin: string, leverage: number) => `\u{1F4B0} Margin at ${leverage}x: <b>${margin}</b>`,
  calcCapped: '\u26A0\uFE0F <i>Capped at your deposit \u2014 the full size needs more collateral than the account holds.</i>',
  calcNote: '<i>Sizing only. Nothing is placed for you, and the stop is what makes this arithmetic true.</i>',

  // --- persistent keyboard --------------------------------------------------
  hubDeepStats: '\u{1F4CA} Deep stats',
  hubSettings: '\u2699\uFE0F Settings',
  hubCalculator: '\u{1F9EE} Calculator',
  hubGuide: '\u{1F4D6} Guide',
} as const;

/**
 * The shape every translation has to fill.
 *
 * Derived from the English file rather than declared beside it, so a key added
 * there fails to compile in the other two until they carry it. That is the
 * whole safety net: without it a missing translation surfaces as `undefined` in
 * somebody's chat, which reads as a broken bot rather than a missing string.
 *
 * Three cases, not two. A function keeps its arguments, a nested record keeps
 * its keys — that one is what lets `commandHelp` be a table the compiler checks
 * per command rather than one opaque blob — and everything else is a string.
 */
export type Dictionary = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : (typeof en)[K] extends object
      ? { [P in keyof (typeof en)[K]]: string }
      : string;
};
