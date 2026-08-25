import type { Dictionary } from './en.js';

/**
 * Deutsch.
 *
 * Trading-Begriffe bleiben, wo sie im Deutschen englisch gebraucht werden —
 * Long, Short, Stop-Loss, Hebel. "Trefferquote" statt "Win Rate", weil das die
 * Kennzahl ist, die deutschsprachige Broker so ausweisen.
 */
export const de: Dictionary = {
  chooseLanguage: '🌍 <b>Sprache wählen</b>\n\nAlle Meldungen und Menüs erscheinen darin.',
  languageSet: '🌍 Sprache auf <b>Deutsch</b> gesetzt.',

  welcomeIntro: '📡 <b>MacroSync</b> — ein automatischer Futures-Radar.',
  welcomeBody:
    'Er durchsucht rund um die Uhr die liquiden USDT-Perpetuals auf MEXC. Bestätigt sich ein Setup, bekommst du das Signal: Einstieg, Stop, Ziel, die Begründung in einem Satz und den Hebel, bei dem die Liquidation noch hinter dem Stop liegt.',
  welcomeSubscribed:
    'Du bist angemeldet. Mehr braucht es nicht — mit den Befehlen unten werden die Meldungen aber deine statt allgemeiner.',
  helpIntro: '📡 <b>MacroSync</b> — ein automatischer Radar für MEXC-Perpetuals.',

  commandsHeading: '<b>Befehle</b>',
  alsoHeading: '<b>Außerdem</b>',
  disclaimerLong:
    '<i>MEXC-Perpetuals. Modellausgabe auf öffentlichen Marktdaten — keine Anlageberatung, und es wird nie eine Order für dich platziert.</i>',
  disclaimerShort: '<i>Keine Anlageberatung. Es wird nie eine Order für dich platziert.</i>',

  settingsTitle: '⚙️ <b>Einstellungen</b>',
  settingsStrategies: '<b>Strategien</b> — welche Setups dich erreichen',
  settingsChannels: '<b>Benachrichtigungen</b> — welche Momente dich erreichen',
  settingsLanguage: '<b>Sprache</b>',
  settingsHint: 'Tippe etwas an, um es ein- oder auszuschalten.',

  strategyScalping: '⚡ Scalping',
  strategyDay: '📅 Daytrading',
  strategySwing: '🌊 Swing',
  strategyScalpingHint: '5m-Kerzen, 15 Minuten bis 2 Stunden',
  strategyDayHint: '1h-Kerzen, 2 bis 12 Stunden',
  strategySwingHint: '4h-Kerzen, 1 bis 4 Tage',

  channelSignals: '🟢 Neue Signale',
  channelUpdates: '🛡 Aktualisierungen',
  channelResults: '🏁 Ergebnisse',
  channelSignalsHint: 'Einstiegsmeldungen',
  channelUpdatesHint: 'Stop auf Break-even gezogen',
  channelResultsHint: 'Ziel oder Stop erreicht',

  settingsAllOff:
    '<i>Alles ist aus. Du bleibst angemeldet und hörst schlicht nichts, bis du etwas wieder einschaltest.</i>',
  settingsStranded:
    '⚠️ <i>Ergebnisse sind aus, neue Signale aber an: Du erfährst, wann du einsteigen sollst, und nie, wann es vorbei ist. Schließe deine Positionen selbst.</i>',
  settingsSaved: 'Gespeichert',

  alertLong: 'LONG',
  alertShort: 'SHORT',
  alertEntry: 'Einstieg',
  alertStop: 'Stop',
  alertTarget: 'Ziel',
  alertRiskReward: 'Chance / Risiko',
  alertConfidence: 'Konfidenz',
  alertLeverage: 'Max. sicherer Hebel',
  alertLeverageNote: 'Liquidation bleibt hinter dem Stop',
  alertRisk: (pct) => `Risiko ${pct}% des Depots`,

  sizingMargin: (margin, leverage, risk, balance) =>
    `💰 <b>Margin ${margin}</b> bei ${leverage}x — im Risiko <b>${risk}</b> von ${balance}`,
  sizingCapped: (riskPct) =>
    `⚠️ <i>Auf dein Guthaben begrenzt: Die volle Größe für ${riskPct}% Risiko braucht mehr Sicherheit, als das Konto hergibt.</i>`,

  breakevenTitle: (base) => `🛡 <b>${base}</b> — halber Weg zum Ziel`,
  breakevenFrom: (side, entry) => `<i>${side} ab ${entry}</i>`,
  breakevenMoved: (entry) => `Stop auf den Einstieg gezogen: <code>${entry}</code>`,
  breakevenWas: (was) => `<i>Vorher ${was}. Ab hier kann dich der Trade nichts mehr kosten.</i>`,

  closeWin: '✅ <b>Ziel erreicht</b>',
  closeLoss: '❌ <b>Ausgestoppt</b>',
  closeBreakeven: '🛡 <b>Auf Break-even geschlossen</b>',
  closeExit: 'Ausstieg',
  closeResult: 'Ergebnis',

  statsNone: '📊 Noch keine Trades erfasst. Das erste bestätigte Signal eröffnet die Bilanz.',
  statsOnlyOpen: (open) =>
    `📊 Noch nichts abgeschlossen — ${open} laufen. Die Bilanz beginnt, wenn der erste Trade schließt.`,
  statsRate: (rate, wins, losses, expired) =>
    `📊 <b>Trefferquote ${rate}%</b> — ${wins}G / ${losses}V${expired}`,
  statsExpired: (n) => ` · ${n} verfallen`,
  statsOpen: (n) => `📈 ${n} Trade${n === 1 ? '' : 's'} gerade offen`,
  statsFootnote:
    '<i>Gezählt werden nur Ziel und Stop. Verfallene, ersetzte und auf Break-even geschlossene Signale bleiben außerhalb des Nenners.</i>',

  balanceInvalid: '⚠️ <b>Ungültiges Format.</b>',
  balanceHowTo:
    'Für die Positionsgröße schick deine Einlage und den Prozentsatz davon, den du in einem Trade riskieren willst.',
  balanceExample1: '— 1.000 $ Einlage, 1% Risiko',
  balanceExample2: '— Risiko standardmäßig 1%',
  balanceExample3: '— zurücksetzen',
  balanceTooLarge: 'Diese Einlage sieht nach einem Tippfehler aus — falls nicht, rechne die Größe von Hand.',
  balanceRiskTooLarge:
    'Mehr als 20% eines Kontos in einem einzigen Trade zu riskieren, rechnet dieser Bot nicht für dich aus.',
  balanceCleared: '💰 Zurückgesetzt. Meldungen kommen ohne Positionsgröße, bis du wieder eine festlegst.',
  balanceSaved: (balance, riskPct) => `💰 Gespeichert: <b>${balance}</b> bei <b>${riskPct}%</b> Risiko.`,
  balanceSavedBody: (perTrade) =>
    `Jede Meldung trägt nun die Margin für eine Position, die <b>${perTrade}</b> verliert, wenn ihr Stop auslöst.`,
  balanceSavedNote: '<i>Nur Berechnung. Für dich wird nichts platziert, und Beratung ist es auch nicht.</i>',

  muted: (hours) => `🔕 ${hours} Stunden Ruhe. Schick /unmute, um früher aufzuheben.`,
  unmuted: '🔔 Meldungen sind wieder an.',
  stopped: '👋 Abgemeldet. Schick /start, wann immer du sie zurück willst.',
  muteButton: (hours) => `🔕 ${hours}h stumm`,
  statsButton: '📊 Statistik',
};
