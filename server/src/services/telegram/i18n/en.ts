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

  welcomeIntro: '📡 <b>MacroSync</b> — an automated futures radar.',
  welcomeBody:
    'It scans the liquid USDT perpetuals on MEXC around the clock, and when a setup confirms you get the call: entry, stop, target, the reasoning in one sentence, and the leverage at which liquidation still sits clear of the stop.',
  welcomeSubscribed:
    'You are subscribed. Nothing else is needed — but the commands below make the alerts yours rather than generic.',
  helpIntro: '📡 <b>MacroSync</b> — an automated futures radar for MEXC perpetuals.',

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
  alertStop: 'Stop',
  alertTarget: 'Target',
  alertRiskReward: 'Risk / reward',
  alertConfidence: 'Confidence',
  alertLeverage: 'Max safe leverage',
  alertLeverageNote: 'liquidation stays past the stop',
  alertRisk: (pct: string) => `Risk ${pct}% of book`,

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
  statsNone: '📊 No trades on the record yet. The first confirmed call opens one.',
  statsOnlyOpen: (open: number) =>
    `📊 No settled trades yet — ${open} still open. The record starts when the first one closes.`,
  statsRate: (rate: number, wins: number, losses: number, expired: string) =>
    `📊 <b>Win rate ${rate}%</b> — ${wins}W / ${losses}L${expired}`,
  statsExpired: (n: number) => ` · ${n} expired`,
  statsOpen: (n: number) => `📈 ${n} trade${n === 1 ? '' : 's'} open right now`,
  statsFootnote:
    '<i>Counts target and stop only. Expired, superseded and breakeven calls stay out of the denominator.</i>',

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
  statsButton: '📊 Stats',
} as const;

export type Dictionary = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};
