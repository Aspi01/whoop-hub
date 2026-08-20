/**
 * Fast Scope & Intent Router
 * Classifies user messages cheaply using deterministic heuristics and keyword patterns.
 * Protects against expensive LLM inference for out-of-scope requests.
 */

export const INTENTS = {
  APP_HELP: 'APP_HELP',
  USER_DATA: 'USER_DATA',
  HEALTH: 'HEALTH',
  RECOVERY: 'RECOVERY',
  SLEEP: 'SLEEP',
  FITNESS: 'FITNESS',
  TRAINING: 'TRAINING',
  NUTRITION: 'NUTRITION',
  HABITS: 'HABITS',
  SPORTS_PRODUCTS: 'SPORTS_PRODUCTS',
  FOOD_PRODUCTS: 'FOOD_PRODUCTS',
  MEDICAL_HIGH_RISK: 'MEDICAL_HIGH_RISK',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE'
};

const OUT_OF_SCOPE_PATTERNS = [
  /python|javascript|typescript|c\+\+|java\b|php|ruby|html|css|sql|парсить|парсер|код\b|скрипт|программиров|баг\b|дебаг|компил/i,
  /президент|премьер|выборы|политик|войн(а|ы|у|е|ой)|битва|истори(я|и|ю|ей)|франци(я|и|ю|ей)|сша|росси(я|и|ю|ей)|кита(й|я|ем)|парламент/i,
  /переведи|перевод|договор|контракт|юрист|нотариус|юридическ/i,
  /сочинени(е|я|ю)|реферат|домашк(а|у|и)|эссе|курсов(ая|ую|ой)|реши задачу|алгебр(а|у)|геометри(я|ю)/i,
  /маркетинг|seo|копирайт|стать(я|ю|и)|реклам(а|у)|лидогенераци/i,
  /маршрут|отель|билет|париж|рим|турпутевк|виз(а|у)|авиабилет/i,
  /напиши мне песню|сочини стих|анекдот|гороскоп|астролог/i
];

const MEDICAL_HIGH_RISK_PATTERNS = [
  /острая боль в сердце|боль в груди|давит в груди|онемела рука|потеря сознания|инфаркт|инсульт|кровотечение|судороги|сильнейшая одышка/i,
  /перелом|вывих сустава|порвал связку|опухоль|рак\b|диагноз/i
];

const APP_HELP_PATTERNS = [
  /где (изменить|поменять|настроить|ввести) (калории|цель|белок|норму)/i,
  /как (удалить|добавить|изменить|настроить) (ритуал|привычк|фактор)/i,
  /как (запустить|включить|настроить|работает) (таймер|emom|интервал|табата|секундомер)/i,
  /как (создать|сохранить|добавить) (шаблон|тренировк)/i,
  /где (найти|посмотреть|подключить) (устройства|источники|whoop|apple health|гармин)/i,
  /как пользоваться приложением|что умеет приложение|инструкция/i
];

const USER_DATA_PATTERNS = [
  /сколько.*(осталось|набрал|съел|добрать).*(калори|белк|протеин|углевод|жир)/i,
  /сколько.*(калори|белк|протеин|углевод|жир).*(осталось|набрал|съел|добрать)/i,
  /как я (сегодня )?спал|какой (у меня )?сон/i,
  /какой (был )?(мой )?последний (жим|присед|тяга|вес)/i,
  /мой (hrv|вср|пульс|recovery|восстановление|скор|strain) (сегодня)?/i,
  /сравни мои последние (три|3|две|2) тренировки/i,
  /что я сегодня ел|мои приемы пищи/i
];

const SPORTS_PRODUCTS_PATTERNS = [
  /лямк(и|ек|ами)|пояс для тяги|наколенник|штангетки|магнези(я|и)|гантел|эспандер|турник|электролит|креатин|протеин порошок|шейкер/i,
  /где (обычно )?купить|какой фирмы|какой бренд|какие лямки/i
];

const NUTRITION_PATTERNS = [
  /что (мне )?съесть|чем добрать|ужин|завтрак|обед|перекус|калори|белок|протеин|жир|углевод|клетчатк|дефицит|профицит|диета|творог|яйц|индейк|куриц|рыб|на эти калории/i
];

const TRAINING_PATTERNS = [
  /жим|присед|тяга|тренировк|упражнени|программ|подход|повторен|rpe|вес на штанге|силов|гипертрофи|отдых между|сделай тренировку|грудь|спина|ноги|плечи|руки|изменить в тренировке/i
];

const RECOVERY_SLEEP_PATTERNS = [
  /recovery|восстановлени|сон|глубокий сон|sws|rem|hrv|вср|пульс в покое|rhr|усталость|перетрен|недосып|стресс/i
];

/**
 * Fast Scope and Intent Classification
 * @param {string} userMessage
 * @param {Object} [conversationState]
 * @returns {Object} Router Classification Result
 */
export function classifyScopeAndIntent(userMessage, conversationState = {}) {
  const text = String(userMessage || '').trim();
  const startTime = Date.now();

  // 1. High Risk Medical Check
  for (const pattern of MEDICAL_HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.MEDICAL_HIGH_RISK,
        allowed: true,
        isHighRiskMedical: true,
        needs_user_data: false,
        needed_context: [],
        complexity: 'simple',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 2. Out of Scope Check (Instant refusal, 0 LLM cost)
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.OUT_OF_SCOPE,
        allowed: false,
        refusalMessage: 'Я персональный ассистент по здоровью, тренировкам, питанию и восстановлению в Whoop Hub. Я не решаю задачи по общему программированию, переводам документов или общим темам, но с радостью помогу разобрать ваши тренировки, питание, сон или функции приложения!',
        needs_user_data: false,
        needed_context: [],
        complexity: 'instant_refusal',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 3. App Help Check
  for (const pattern of APP_HELP_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.APP_HELP,
        allowed: true,
        needs_user_data: false,
        needed_context: ['app_knowledge'],
        complexity: 'simple',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 4. User Data Check
  for (const pattern of USER_DATA_PATTERNS) {
    if (pattern.test(text)) {
      let needed = ['today_status', 'nutrition_today'];
      if (/жим|присед|тяг|тренировк/i.test(text)) needed.push('recent_workouts', 'exercise_history');
      if (/сон|sleep/i.test(text)) needed.push('sleep_summary', 'hrv_trend');
      return {
        intent: INTENTS.USER_DATA,
        allowed: true,
        needs_user_data: true,
        needed_context: needed,
        complexity: 'simple',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 5. Sports & Food Products Check
  for (const pattern of SPORTS_PRODUCTS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.SPORTS_PRODUCTS,
        allowed: true,
        needs_user_data: false,
        needed_context: ['product_guidelines'],
        complexity: 'simple',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 6. Training Check
  for (const pattern of TRAINING_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.TRAINING,
        allowed: true,
        needs_user_data: true,
        needed_context: ['recent_workouts', 'exercise_history', 'recovery_today', 'nutrition_today'],
        complexity: 'medium',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 7. Nutrition Check
  for (const pattern of NUTRITION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.NUTRITION,
        allowed: true,
        needs_user_data: true,
        needed_context: ['nutrition_today', 'user_goals', 'recent_meals'],
        complexity: 'medium',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 8. Recovery & Sleep Check
  for (const pattern of RECOVERY_SLEEP_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENTS.RECOVERY,
        allowed: true,
        needs_user_data: true,
        needed_context: ['today_status', 'sleep_summary', 'hrv_trend', 'rituals_today'],
        complexity: 'medium',
        route_ms: Date.now() - startTime
      };
    }
  }

  // 9. Default Health/Fitness Domain Question
  return {
    intent: INTENTS.HEALTH,
    allowed: true,
    needs_user_data: true,
    needed_context: ['today_status'],
    complexity: 'medium',
    route_ms: Date.now() - startTime
  };
}
