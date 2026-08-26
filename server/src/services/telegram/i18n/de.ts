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

  // --- guide ----------------------------------------------------------------
  guideTitle: '\u{1F4DA} <b>Leitfaden</b>',
  guideIntro: 'Wähle ein Thema. Jedes ist kurz und beantwortet eine einzige Frage.',
  guideBack: '\u2190 Zurück',
  guideStrategies: '\u{1F4D6} Strategien',
  guideRisk: '\u{1F6E1} Risiko & CRV',
  guideLeverage: '\u{1F9EE} Hebel & Stops',

  guideStrategiesBody: [
    '\u{1F4D6} <b>Welche Strategie was bedeutet</b>',
    '',
    '\u26A1 <b>Scalping</b> — 5-Minuten-Kerzen, 15 Minuten bis 2 Stunden.',
    'Schnell, häufig, und es will deine Aufmerksamkeit. Falsch für jeden, der nicht auf den Bildschirm schauen kann.',
    '',
    '\u{1F4C5} <b>Daytrading</b> — Stundenkerzen, 2 bis 12 Stunden.',
    'Die mittlere Einstellung: eine Handvoll Signale am Tag, jedes mit Luft zum Atmen.',
    '',
    '\u{1F30A} <b>Swing</b> — 4-Stunden-Kerzen, 1 bis 4 Tage.',
    'Wenige Signale, weite Stops, langes Warten. Das, was sich mit einem Job verträgt.',
    '',
    '<i>Schalte aus, was du nicht handeln kannst. Ein Scalp, den du drei Stunden später siehst, ist kein Scalp mehr.</i>',
  ].join('\n'),

  guideRiskBody: [
    '\u{1F6E1} <b>Warum eine Trefferquote von 35% Geld verdient</b>',
    '',
    'Jedes Signal riskiert 1, um 2,2 zu verdienen. Dieses Verhältnis entscheidet über die Profitabilität — nicht, wie oft du richtig liegst.',
    '',
    'Auf 100 Trades bei 35%:',
    '  35 Gewinne \u00D7 2,2 = <b>+77</b>',
    '  65 Verluste \u00D7 1 = <b>\u221265</b>',
    '  unterm Strich <b>+12</b> Einheiten',
    '',
    'Die Break-even-Trefferquote bei einem CRV von 2,2 liegt bei <b>31%</b>. Darunter verlierst du, wie clever die Einstiege auch aussehen; darüber verdienst du, obwohl du meistens falsch liegst.',
    '',
    '<i>Das ist Arithmetik, kein Versprechen. Sie setzt voraus, dass du jedes Signal in der angegebenen Größe nimmst und den Stop hältst — die Verlierer auszulassen, die dir nicht gefallen, ist genau das, was die Rechnung kippen lässt.</i>',
  ].join('\n'),

  guideLeverageBody: [
    '\u{1F9EE} <b>Hebel und Stops</b>',
    '',
    'Jede Meldung trägt einen <b>maximal sicheren Hebel</b>. Er beantwortet genau eine Frage: bei welchem Hebel bleibt die Liquidation hinter dem Stop?',
    '',
    'Der Stop ist ein Vielfaches der ATR, damit eine volatile Münze einen weiteren Stop bekommt statt eines festen Prozentsatzes. Die Liquidation liegt etwa <code>1/Hebel</code> vom Einstieg entfernt, abzüglich der Erhaltungsmarge des Kontrakts — die auf der Börse zwischen 0,04% und 5% schwankt und deshalb je Kontrakt gelesen und nicht angenommen wird.',
    '',
    'Die Zahl hält die Liquidation <b>1,5\u00D7</b> weiter draußen als den Stop. Bei 1\u00D7 fallen sie zusammen, und die Liquidation gewinnt: Dein Stop wird zu deinem Preis ausgeführt, die Liquidation löst am Mark-Preis aus, der sich unabhängig bewegt und springen kann.',
    '',
    '\u26A0\uFE0F <i>Er sagt, dass die Liquidation den Trade nicht schließt. Über eine sinnvolle Größe sagt er nichts. Schick /balance, dann rechnet der Bot die Größe für dich aus.</i>',
  ].join('\n'),

  // --- deep stats -----------------------------------------------------------
  deepTitle: '\u{1F4D0} <b>Tiefenstatistik</b>',
  deepThreshold: (pct) => `<i>Der Stop wandert bei ${pct}% des Wegs zum Ziel auf den Einstieg</i>`,
  deepRateHeading: '<b>Trefferquote</b>',
  deepRateNone: '  Noch nichts abgeschlossen.',
  deepRateExcl: (rate, wins, losses) => `  Ohne Break-even: <b>${rate}%</b>  (${wins}G / ${losses}V)`,
  deepRateIncl: (rate, breakeven) =>
    `  Break-even als Nicht-Gewinn gezählt: <b>${rate}%</b>  (+${breakeven} glattgestellt)`,
  deepRateThin: (sample) => `  <i>${sample} abgeschlossene Trades — zu wenige für einen Schluss.</i>`,
  deepConfidenceHeading: '<b>Konfidenz gegen Ergebnis</b>',
  deepConfidence: (r, sample, won, lost) =>
    `  r = <b>${r}</b> über ${sample} Trades  (Gewinner im Schnitt ${won}, Verlierer ${lost})`,
  deepConfidenceNone: 'Noch kein abgeschlossener Trade trägt einen Konfluenz-Wert.',
  deepConfidenceThin: (sample) => `Zu wenige Trades (${sample}), um danach zu handeln — als Platzhalter lesen.`,
  deepWhatIfHeading: '<b>Was die glattgestellten Trades danach taten</b>',
  deepWhatIfTarget: (n) => `  Erreichten das Ziel doch: <b>${n}</b>`,
  deepWhatIfStop: (n) => `  Trafen den ursprünglichen Stop: <b>${n}</b>`,
  deepWhatIfNeither: (n) => `  Weder noch, vor Ablauf: <b>${n}</b>`,
  deepWhatIfProjected: (projected, now) =>
    `  Quote ohne Glattstellungen: <b>${projected}%</b>  (gegen ${now}% jetzt)`,
  deepWhatIfNone: 'Noch lässt sich kein glattgestellter Trade nachspielen.',
  deepWhatIfNoisy: (won, lost, neither) =>
    `${won} erreichten das Ziel gegen ${lost}, die den ursprünglichen Stop trafen — innerhalb einer Standardabweichung eines Münzwurfs, also eine Richtung ohne Beweis. Weitere ${neither} gingen nirgendwohin und wären schlicht verfallen.`,
  deepWhatIfClear: (won, lost) =>
    `${won} erreichten das Ziel gegen ${lost}, die den ursprünglichen Stop trafen — außerhalb der Zufallsspanne, die Schwelle ist es wert, bewegt zu werden.`,
  deepStale: (minutes) => `<i>Momentaufnahme von vor ${minutes} Min.</i>`,

  // --- shareable result card ------------------------------------------------
  cardWin: 'ZIEL ERREICHT',
  cardLoss: 'AUSGESTOPPT',
  cardScratch: 'BREAK-EVEN',
  cardRoi: 'ROI',
  cardRR: 'CRV',
  cardHeld: 'Gehalten',
  cardFooter: 'via @MacroSyncBot',
};
