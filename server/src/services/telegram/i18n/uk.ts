import type { Dictionary } from './en.js';

/** Українська. Терміни лишаються ті, якими торгують, а не кальковані. */
export const uk: Dictionary = {
  chooseLanguage: '🌍 <b>Обери мову</b>\n\nУсі сповіщення й меню будуть нею.',
  languageSet: '🌍 Мову встановлено: <b>українська</b>.',

  welcomeIntro: '📡 <b>MacroSync</b> — автоматичний ф’ючерсний радар.',
  welcomeBody:
    'Він цілодобово сканує ліквідні безстрокові контракти USDT на MEXC, і коли сетап підтверджується, ти отримуєш сигнал: вхід, стоп, ціль, причину одним реченням і плече, за якого ліквідація лишається за стопом.',
  welcomeSubscribed:
    'Ти підписаний. Більше нічого не потрібно — але команди нижче зроблять сповіщення саме твоїми, а не загальними.',
  helpIntro: '📡 <b>MacroSync</b> — автоматичний радар безстрокових контрактів MEXC.',

  commandsHeading: '<b>Команди</b>',
  alsoHeading: '<b>Ще</b>',
  disclaimerLong:
    '<i>Безстрокові контракти MEXC. Це вихід моделі за публічними ринковими даними — не фінансова порада, і жодна заявка за тебе не виставляється.</i>',
  disclaimerShort: '<i>Не фінансова порада. Жодна заявка за тебе не виставляється.</i>',

  settingsTitle: '⚙️ <b>Налаштування</b>',
  settingsStrategies: '<b>Стратегії</b> — які сетапи до тебе доходять',
  settingsChannels: '<b>Сповіщення</b> — про які моменти повідомляти',
  settingsLanguage: '<b>Мова</b>',
  settingsHint: 'Натисни будь-що, щоб увімкнути або вимкнути.',

  strategyScalping: '⚡ Скальпінг',
  strategyDay: '📅 Дейтрейдинг',
  strategySwing: '🌊 Свінг',
  strategyScalpingHint: 'бари 5х, від 15 хвилин до 2 годин',
  strategyDayHint: 'бари 1г, від 2 до 12 годин',
  strategySwingHint: 'бари 4г, від 1 до 4 днів',

  channelSignals: '🟢 Нові сигнали',
  channelUpdates: '🛡 Оновлення',
  channelResults: '🏁 Результати',
  channelSignalsHint: 'сповіщення про вхід',
  channelUpdatesHint: 'стоп перенесено в беззбиток',
  channelResultsHint: 'спрацювала ціль або стоп',

  settingsAllOff:
    '<i>Усе вимкнено. Підписка лишається, але нічого не надходитиме, доки щось не увімкнеш назад.</i>',
  settingsStranded:
    '⚠️ <i>Результати вимкнені, а нові сигнали — ні: тобі скажуть, коли входити, і не скажуть, коли все скінчилось. Закривай позиції на власний розсуд.</i>',
  settingsSaved: 'Збережено',

  alertLong: 'ЛОНГ',
  alertShort: 'ШОРТ',
  alertEntry: 'Вхід',
  alertStop: 'Стоп',
  alertTarget: 'Ціль',
  alertRiskReward: 'Ризик / прибуток',
  alertConfidence: 'Впевненість',
  alertLeverage: 'Макс. безпечне плече',
  alertLeverageNote: 'ліквідація лишається за стопом',
  alertRisk: (pct) => `Ризик ${pct}% депозиту`,

  sizingMargin: (margin, leverage, risk, balance) =>
    `💰 <b>Маржа ${margin}</b> за ${leverage}x — ризикуєш <b>${risk}</b> з ${balance}`,
  sizingCapped: (riskPct) =>
    `⚠️ <i>Обмежено твоїм балансом: повний розмір під ризик ${riskPct}% потребує більше застави, ніж є на рахунку.</i>`,

  breakevenTitle: (base) => `🛡 <b>${base}</b> — половина шляху до цілі`,
  breakevenFrom: (side, entry) => `<i>${side} від ${entry}</i>`,
  breakevenMoved: (entry) => `Стоп перенесено на вхід: <code>${entry}</code>`,
  breakevenWas: (was) => `<i>Було ${was}. Далі ця угода вже не може нічого коштувати.</i>`,

  closeWin: '✅ <b>Ціль досягнуто</b>',
  closeLoss: '❌ <b>Вибило по стопу</b>',
  closeBreakeven: '🛡 <b>Закрито в нуль</b>',
  closeExit: 'Вихід',
  closeResult: 'Результат',

  statsNone: '📊 Записів ще немає. Перший підтверджений сигнал відкриє їх.',
  statsOnlyOpen: (open) =>
    `📊 Закритих угод ще немає — ${open} у роботі. Запис почнеться, коли закриється перша.`,
  statsRate: (rate, wins, losses, expired) =>
    `📊 <b>Вінрейт ${rate}%</b> — ${wins}П / ${losses}З${expired}`,
  statsExpired: (n) => ` · ${n} протерміновано`,
  statsOpen: (n) => `📈 Зараз відкрито угод: ${n}`,
  statsFootnote:
    '<i>Рахуються лише ціль і стоп. Протерміновані, заміщені та нульові сигнали лишаються поза знаменником.</i>',

  balanceInvalid: '⚠️ <b>Невірний формат.</b>',
  balanceHowTo:
    'Щоб налаштувати розмір позиції, надішли свій депозит і відсоток від нього, яким готовий ризикнути в одній угоді.',
  balanceExample1: '— депозит $1000, ризик 1%',
  balanceExample2: '— ризик за замовчуванням 1%',
  balanceExample3: '— скинути',
  balanceTooLarge: 'Цей депозит схожий на друкарську помилку — якщо ні, рахуй розмір вручну.',
  balanceRiskTooLarge:
    'Ризикувати більш ніж 20% рахунку в одній угоді — не те, що цей бот тобі порахує.',
  balanceCleared: '💰 Скинуто. Сповіщення надходитимуть без розміру позиції, доки не задаси його знову.',
  balanceSaved: (balance, riskPct) => `💰 Збережено: <b>${balance}</b> за ризику <b>${riskPct}%</b>.`,
  balanceSavedBody: (perTrade) =>
    `Кожне сповіщення тепер нестиме маржу для позиції, яка втрачає <b>${perTrade}</b>, якщо спрацює стоп.`,
  balanceSavedNote: '<i>Лише розрахунок. За тебе нічого не виставляється, і це не порада.</i>',

  muted: (hours) => `🔕 Тиша на ${hours} год. Надішли /unmute, щоб зняти раніше.`,
  unmuted: '🔔 Сповіщення знову увімкнено.',
  stopped: '👋 Відписано. Надішли /start, коли захочеш повернути.',
  muteButton: (hours) => `🔕 Тиша ${hours}г`,
  statsButton: '📊 Статистика',
};
