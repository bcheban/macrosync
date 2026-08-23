import type { Translation } from './en';

/**
 * Ukrainian translation.
 *
 * Deliberate conventions: ticker symbols, indicator names (RSI, ATR, EMA, MACD)
 * and multipliers stay in Latin script — that is how a Ukrainian trading desk
 * writes them. Plural forms use i18next's one/few/many/other categories.
 */
export const uk: Translation = {
  brand: {
    tagline: 'Термінал сигналів і ризику, синхронізований з макро',
    pitch: 'Технічні сигнали, радар зворотного відліку макроновин та AI-контроль ризику для крипторинку.',
  },

  common: {
    refresh: 'Оновити дані',
    showLess: 'Згорнути',
    retry: 'Повторити',
    all: 'Усі',
    clear: 'Очистити',
    close: 'Закрити',
    controls: 'Керування панеллю',
    search: 'Пошук',
  },

  language: {
    label: 'Мова',
    en: 'English',
    uk: 'Українська',
    enShort: 'EN',
    ukShort: 'UA',
  },

  topbar: {
    volatility: 'Волатильність',
    breadth: 'Ширина ринку {{value}}%',
    streaming: 'MEXC наживо',
    exchangeData: 'Дані MEXC',
    disconnected: 'Біржа недоступна',
    atr: 'ATR {{value}}%',
    status: 'Стан ринку',
  },

  volatility: {
    low: 'низька',
    elevated: 'підвищена',
    high: 'висока',
    extreme: 'екстремальна',
  },

  assets: {
    title: 'Набір активів',
    subtitle: 'Визначає стрічку цін, список спостереження та сітку сигналів',
    trigger_one: '{{count}} актив',
    trigger_few: '{{count}} активи',
    trigger_many: '{{count}} активів',
    trigger_other: '{{count}} активів',
    selected: 'Обрано {{count}} з {{max}}',
    selectGroup: 'Обрати групу',
    limit: 'Одночасно можна відстежувати до {{max}} активів.',
    empty: 'Немає активів за запитом «{{query}}».',
    searchPlaceholder: 'Пошук BTC, Solana…',
    reset: 'Скинути до типових',
    groups: {
      all: 'Усі',
      majors: 'Основні',
      layer1: 'Layer 1',
      layer2: 'Layer 2',
      defi: 'DeFi',
      meme: 'Мемкоїни',
      ai: 'AI та DePIN',
    },
    // Only the names Ukrainian press actually localizes; the rest fall back to
    // the catalogue's proper nouns.
    names: {
      BTC: 'Біткоїн',
      ETH: 'Ефіріум',
    },
  },

  ticker: {
    label: 'Ціни наживо',
  },

  watchlist: {
    title: 'Список спостереження',
    subtitle: 'Зміна за 24 год · обсяг у котирувальній валюті',
    volume: 'Обсяг {{value}}',
    empty: 'Активи не обрані.',
  },

  signals: {
    title: 'Сигнали стратегій',
    live: 'Активних: {{count}}',
    error: 'Рушій сигналів недоступний — {{message}}',
    empty: 'Немає сигналів для цього набору',
    allAssets: 'Усі',
    focusAria: 'Фокус на одному активі',
    emptyHint:
      'Рушій не бачить сетапу для поточного набору. Спробуй інший таймфрейм стратегії або розшир набір активів у шапці.',
    emptyFocus: 'Немає сигналу по {{asset}} на цьому таймфреймі',
    emptyFocusHint: 'В інших активів сетапи можуть бути — повернись до «Усі», щоб побачити їх.',
    showAll: 'Показати всі активи',
    confluence: 'Збіг факторів',
    entry: 'Вхід',
    stop: 'Стоп',
    target: 'Ціль',
    riskReward: 'R:R',
    risk: 'Ризик',
    rsi: 'RSI',
    atr: 'ATR',
    volume: 'Обсяг',
    strategies: {
      scalping: 'Скальпінг',
      day: 'Внутрішньоденна',
      swing: 'Свінг',
    },
    strategyAria: 'Торгова стратегія',
    subtitles: {
      scalping: 'EMA 9/21 · RSI 7 · бари 5m — сплески імпульсу всередині дня',
      day: 'EMA 21/55 · RSI 14 · бари 1h — тренди довжиною в сесію',
      swing: 'EMA 34/89 · RSI 14 · бари 4h — позиції на кілька днів',
    },
    direction: {
      long: 'Ухил у лонг',
      short: 'Ухил у шорт',
      neutral: 'Немає переваги',
    },
    status: {
      live: 'Активний',
      forming: 'Формується',
      cooling: 'Згасає',
    },
    rationale: {
      trendFlat: 'EMA {{fast}}/{{slow}} без нахилу — тренд не дає переваги',
      trendAbove: 'EMA {{fast}} вище за EMA {{slow}} на {{spread}}%',
      trendBelow: 'EMA {{fast}} нижче за EMA {{slow}} на {{spread}}%',
      macdPositiveExpanding: 'Гістограма MACD додатна і розширюється на {{timeframe}}',
      macdPositiveFlat: 'Гістограма MACD додатна, але пласка на {{timeframe}}',
      macdNegativeExpanding: 'Гістограма MACD від’ємна і розширюється на {{timeframe}}',
      macdNegativeFlat: 'Гістограма MACD від’ємна, але пласка на {{timeframe}}',
      rsiStretched: 'RSI {{rsi}} — перегрів, ризик заходу навздогін зростає',
      rsiWashedOut: 'RSI {{rsi}} — перепроданість, ризик відскоку зростає',
      rsiNeutral: 'RSI {{rsi}} у нейтральній зоні',
      volume: 'Обсяг {{ratio}}× від середнього за 20 барів',
    },
    eventWarning: '{{event}} — через {{minutes}} хв, усередині горизонту цього сетапу',
  },

  countdown: {
    badge: 'Радар відліку новин',
    impact: 'Вплив',
    days: 'Дні',
    hours: 'Год',
    minutes: 'Хв',
    seconds: 'Сек',
    forecast: 'Прогноз',
    previous: 'Попереднє',
    summary: '{{currency}} · {{region}} · очікуваний вплив {{level}}',
    scheduleSource: 'Економічний календар',
    noEvent: 'Немає запланованих подій',
    noEventHint: 'На цьому тижні календар порожній. До публікації наступних даних технічні сетапи мають звичайну вагу.',
    riskWindow: 'Вікно ризику відкрите',
    importance: 'вплив {{level}} · {{region}}',
    warning:
      'Усередині цього вікна технічні сетапи втрачають надійність — імпульсні та контртрендові моделі не мають вхідних даних для публікації, якої ще не було. Зменшіть обсяг, приберіть або розсуньте стопи, що стоять у межах очікуваного діапазону реакції, і вважайте всі сигнали нижче попередніми.',
    categories: {
      monetary: 'Центробанк',
      macro: 'Макродані',
      political: 'Політика',
      crypto: 'Крипторинок',
    },
  },

  importance: {
    high: 'високий',
    medium: 'середній',
    low: 'низький',
  },

  eventQueue: {
    title: 'Черга подій',
    subtitle: 'Заплановані макро- та політичні каталізатори',
  },

  /**
   * Event names arrive from the calendar feed in English, keyed by a slug of
   * the title. Only the recurring indicators are translated; anything else
   * falls back to what the feed published.
   */
  events: {
    'cpi-m-m': { title: 'Індекс споживчих цін (м/м)' },
    'cpi-y-y': { title: 'Індекс споживчих цін (р/р)' },
    'core-cpi-m-m': { title: 'Базовий ІСЦ (м/м)' },
    'core-pce-price-index-m-m': { title: 'Базовий ціновий індекс PCE (м/м)' },
    'federal-funds-rate': { title: 'Ставка ФРС' },
    'fomc-statement': { title: 'Заява FOMC' },
    'fomc-press-conference': { title: 'Пресконференція FOMC' },
    'fomc-meeting-minutes': { title: 'Протокол засідання FOMC' },
    'non-farm-employment-change': { title: 'Зайнятість поза с/г (NFP)' },
    'unemployment-rate': { title: 'Рівень безробіття' },
    'unemployment-claims': { title: 'Заявки на допомогу з безробіття' },
    'prelim-gdp-q-q': { title: 'Попередній ВВП (кв/кв)' },
    'advance-gdp-q-q': { title: 'Перша оцінка ВВП (кв/кв)' },
    'retail-sales-m-m': { title: 'Роздрібні продажі (м/м)' },
    'ppi-m-m': { title: 'Індекс цін виробників (м/м)' },
    'main-refinancing-rate': { title: 'Основна ставка рефінансування ЄЦБ' },
    'ecb-press-conference': { title: 'Пресконференція ЄЦБ' },
    'boj-policy-rate': { title: 'Ставка Банку Японії' },
    'cb-consumer-confidence': { title: 'Індекс споживчої довіри CB' },
    'ism-manufacturing-pmi': { title: 'ISM PMI у виробництві' },
    'ism-services-pmi': { title: 'ISM PMI у послугах' },
  },


  insights: {
    title: 'AI-інсайти до дії',
    subtitle: 'Заголовки, перекладені в позицію щодо ризику — ніколи не в напрямок',
    error: 'Сервіс інсайтів недоступний — {{message}}',
    riskScenarios: 'Сценарії ризику',
    riskControls: 'Контроль ризику',
    invalidation: 'Що спростує',
    conviction: 'впевненість {{value}}%',
    volatilityTag: 'Волатильність: {{level}}',
    more_one: 'ще {{count}} сценарій',
    more_few: 'ще {{count}} сценарії',
    more_many: 'ще {{count}} сценаріїв',
    more_other: 'ще {{count}} сценаріїв',
    provider: {
      anthropic: 'Claude',
      openai: 'GPT',
      heuristic: 'Евристичний рушій',
    },
    sentiment: {
      bullish: 'Бичачий тон',
      bearish: 'Ведмежий тон',
      neutral: 'Змішаний тон',
    },
    posture: {
      defensive: 'Захисна позиція',
      neutral: 'Нейтральна позиція',
      constructive: 'Конструктивна позиція',
    },
    volLabel: {
      low: 'стисла волатильність',
      elevated: 'підвищена волатильність',
      high: 'висока волатильність',
      extreme: 'екстремальна волатильність',
    },
    leverageCap: {
      low: '5x',
      elevated: '3x',
      high: '2x',
      extreme: '1x (тільки спот)',
    },
    heuristic: {
      majors: 'основних активах',
      trigger: {
        bearishTone: 'Ведмежий тон + {{volLabel}}',
        constructiveTone: 'Конструктивний тон + {{volLabel}}',
        ambiguous: 'Неоднозначний заголовок + {{volLabel}}',
        eventCountdown: '{{event}} — через {{minutes}} хв',
        highImpact: 'Високий вплив заголовка + тонкий стакан',
        broadBreadth: 'Широка участь в основних активах',
        narrowBreadth: 'Вузька ширина ринку — лідерство сконцентроване в одному активі',
      },
      response: {
        bearishTone:
          'Підтягніть стопи до {{stop}} ATR по {{assets}}, зменшіть обсяг позицій на {{size}}% і не додавайте нових лонгів із плечем, доки ринок не стабілізується.',
        constructiveHeavy:
          'Дайте наявним позиціям працювати, але не додавайте на силі — ведіть стопи на {{stop}} ATR і тримайте новий ризик нижче половини звичайного обсягу.',
        constructiveCalm:
          'Поверніть ризик до нормального рівня по {{assets}}, ведіть стопи на {{stop}} ATR і заздалегідь визначте, яку віддачу прибутку ви приймаєте, перш ніж доливати.',
        ambiguous:
          'Вважайте це шумом, доки ціна не підтвердить: тримайте наявні позиції, уникайте нового ризику по {{assets}} і дайте стопу на {{stop}} ATR вирішувати замість вас.',
        eventCountdown:
          'Закрийте або захеджуйте короткострокові позиції до публікації. Розсуньте лімітні заявки, очікуйте прослизання у 2–4× вище звичайного в перші 60 секунд і повертайтеся лише після того, як сформується діапазон перших {{settle}} хвилин після виходу даних.',
        highImpact:
          'Припускайте розриви ліквідності: замініть ринкові заявки на ступінчасті лімітні, обмежте разовий обсяг 25% видимої глибини стакана та вимкніть стопи, що спрацьовують усередині спреду.',
        broadBreadth:
          'Кореляція висока, тож ставтеся до окремих позицій як до однієї ставки: агрегуйте ризик по всьому портфелю, перш ніж набирати щось нове.',
        narrowBreadth:
          'Ризик ротації підвищений. Обмежте експозицію в альткоїнах і тримайте резерв для основних активів, де глибина ринку найбільша.',
      },
      control: {
        maxRisk: 'Максимальний ризик на позицію: {{pct}} від капіталу.',
        stopDistance: 'Дистанція стопа: {{stop}} ATR(14) на робочому таймфреймі — ніколи фіксований відсоток.',
        leverageCap: 'Ліміт плеча, доки триває цей режим: {{cap}}.',
        eventBlackout: 'Жодного нового внутрішньоденного ризику у вікні {{minutes}} хв перед подією «{{event}}».',
        reevaluate: 'Переоцінюйте експозицію на кожному закритті 4h, доки заголовок керує потоком.',
      },
      invalidation: {
        bearish:
          'Повернення в діапазон, що передував новині, на зростаючому обсязі означатиме, що ринок відпрацював новину — захисну позицію можна послабити.',
        bullish:
          'Нездатність утримати мінімум після новини на спадному обсязі означає, що попит несправжній — поверніться до захисної позиції.',
        neutral:
          'Впевнений вихід за межі діапазону сесії в будь-який бік на обсязі 1.5× від середнього скасовує вичікувальну позицію.',
      },
      thesis: {
        bearish: {
          heavy: 'Ведмежий заголовок на тлі {{volLabel}} — ризик тут в обсязі позиції та прослизанні, а не в напрямку.',
          calm: 'Ведмежий заголовок на тлі {{volLabel}} — ризик тут у самозаспокоєнні: режим може змінитися на наступній публікації.',
        },
        constructive: {
          heavy:
            'Конструктивний заголовок на тлі {{volLabel}} — ризик тут в обсязі позиції та прослизанні, а не в напрямку.',
          calm: 'Конструктивний заголовок на тлі {{volLabel}} — ризик тут у самозаспокоєнні: режим може змінитися на наступній публікації.',
        },
        mixed: {
          heavy: 'Змішаний заголовок на тлі {{volLabel}} — ризик тут в обсязі позиції та прослизанні, а не в напрямку.',
          calm: 'Змішаний заголовок на тлі {{volLabel}} — ризик тут у самозаспокоєнні: режим може змінитися на наступній публікації.',
        },
      },
    },
  },

  time: {
    secondsAgo: '{{count}} с тому',
    minutesAgo: '{{count}} хв тому',
    hoursAgo: '{{count}} год тому',
    daysAgo: '{{count}} д тому',
    inMinutes: '{{minutes}} хв',
    inHours: '{{hours}} год {{minutes}} хв',
    inDays: '{{days}} д {{hours}} год',
  },

  footer: {
    lead: '{{brand}} — це дослідницький інструмент, а не брокер.',
    body: 'Ніщо тут не є фінансовою порадою. Сигнали — це результат роботи моделі на публічних ринкових даних, календар і стрічка новин у цьому MVP є демонстраційними фікстурами, а AI-шар видає лише сценарії управління ризиком — ніколи точки входу чи виходу. Завжди розраховуйте обсяг позиції з того, що ви можете дозволити собі втратити.',
  },
};
