/**
 * Fast Scope & Intent Router with Robust Russian Morphology Normalization & Safe Word Boundaries
 * Classifies user messages cheaply using root stemming, token boundaries, and keyword patterns.
 * Protects against expensive LLM inference for out-of-scope requests while preventing false positives.
 */
import { getMessageText, getMessageRole } from './conversationMemory.js';

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

// Safe word-bounded patterns to avoid false positives (e.g., 'рим' inside 'применить', 'баг' inside 'багаж', etc.)
const OUT_OF_SCOPE_PATTERNS = [
  /\b(python|javascript|typescript|c\+\+|java|php|ruby|html|css|sql)\b|\b(парсить|парсер|скрипт|программиров|компил\w*)\b|\b(код|кода|коде|баг|дебаг)\b/i,
  /\b(президент|премьер|выборы|политик|войн(а|ы|у|е|ой)|битва|франци(я|и|ю|ей)|сша|росси(я|и|ю|ей)|кита(й|я|ем)|парламент)\b/i,
  /\b(переведи|перевод|договор|контракт|юрист|нотариус|юридическ\w*)\b/i,
  /\b(сочинени(е|я|ю)|реферат|домашк(а|у|и)|эссе|курсов(ая|ую|ой)|реши задачу|алгебр(а|у)|геометри(я|ю))\b/i,
  /\b(маркетинг|seo|копирайт|стать(я|ю|и)|реклам(а|у)|лидогенераци\w*)\b/i,
  /\b(маршрут|отель|билет\w*|париж|рим|турпутевк\w*|виз(а|у|ы|е|ой)|авиабилет\w*)\b/i,
  /\b(напиши мне песню|сочини стих|анекдот|гороскоп|астролог\w*)\b/i
];

const MEDICAL_HIGH_RISK_PATTERNS = [
  /острая боль в сердце|боль в груди|давит в груди|онемела рука|потеря сознания|инфаркт|инсульт|кровотечение|судороги|сильнейшая одышка/i,
  /перелом|вывих сустава|порвал связку|опухоль|рак\b|диагноз/i
];

const APP_HELP_PATTERNS = [
  /(как|где) (изменить|поменять|настроить|ввести|поставить) (калори|цел|белк|норм)/i,
  /как (удалить|добавить|изменить|настроить) (ритуал|привычк|фактор)/i,
  /как (запустить|включить|настроить|работает) (таймер|emom|интервал|табата|секундомер)/i,
  /как (создать|сохранить|добавить|применить|использовать|выбрать) (шаблон|шаблоны|тренировк)/i,
  /где (мои|найти|посмотреть|подключить) (шаблон|шаблоны|устройства|источники|whoop|apple health|гармин)/i,
  /как пользоваться приложением|что умеет приложение|инструкция/i
];

// Robust root-based morphology patterns for Russian queries
const USER_DATA_PATTERNS = [
  /сколько.*(осталось|набрал|съел|добрать|потребил).*(калор|белк|протеин|углевод|жир)/i,
  /сколько.*(калор|белк|протеин|углевод|жир).*(осталось|набрал|съел|добрать|потребил)/i,
  /сколько.*(белк|калор|протеин)/i,
  /как я (сегодня )?(сп|посп|высп)|какой (у меня )?(с(он|на)|recovery|hrv|вср|пульс)/i,
  /какой (был )?(мой )?последний (жим|присед|тяг|вес)/i,
  /(что|сколько|какой|когда).*(жал|пожал|приседал|тянул|поднял)/i,
  /(что было в|как прошел).*(жим|присед|тяг|тренировк)/i,
  /мой (hrv|вср|пульс|recovery|восстановл|скор|strain) (сегодня)?/i,
  /сравни мои последние (три|3|две|2) тренировк/i,
  /что я сегодня ел|мои приемы пищи/i
];

const SPORTS_PRODUCTS_PATTERNS = [
  /\b(лямк\w*|пояс для тяги|наколенник\w*|штангетки|магнези\w*|гантел\w*|эспандер|турник|электролит\w*|креатин|протеин порошок|шейкер)\b/i,
  /где (обычно )?купить|какой фирмы|какой бренд|какие лямки/i
];

const NUTRITION_PATTERNS = [
  /что (мне )?съесть|чем добрать|ужин|завтрак|обед|перекус|калор|белк|протеин|жир|углевод|клетчатк|дефицит|профицит|диета|творог|яйц|индейк|куриц|рыб|на эти калории/i
];

const TRAINING_PATTERNS = [
  /\b(жим\w*|присед\w*|тяг\w*|тренировк\w*|упражнен\w*|программ\w*|подход\w*|повторен\w*|rpe|вес на штанге|силов\w*|гипертрофи\w*|отдых между|сделай тренировку|грудь|спина|ноги|плечи|руки|изменить в тренировке|добавить вес)\b/i
];

const RECOVERY_SLEEP_PATTERNS = [
  /\b(recovery|восстановл\w*|сон|сна|сну|сне|сном|глубокий сон|sws|rem|hrv|вср|пульс в покое|rhr|усталост\w*|перетрен\w*|недосып\w*|стресс\w*)\b/i
];

/**
 * Fast Scope and Intent Classification
 * @param {string} userMessage
 * @param {Array} [conversationHistory]
 * @returns {Object} Router Classification Result
 */
export function classifyScopeAndIntent(userMessage, conversationHistory = []) {
  const text = String(userMessage || '').trim();
  const startTime = Date.now();

  // Inspect previous conversation history excluding current incoming message
  let recentTopic = '';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const previousHistory = conversationHistory.filter(m => getMessageText(m).trim() !== text);
    const lastUserMsg = [...previousHistory].reverse().find(m => getMessageRole(m) === 'user');
    if (lastUserMsg) {
      recentTopic = getMessageText(lastUserMsg).toLowerCase();
    }
  }

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

  // 2. App Help Check (Priority check before general boundaries)
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

  // 3. Out of Scope Check (Instant refusal, 0 LLM cost, word-boundary safe)
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

  // 4. User Data Check (Factual queries about numbers, workouts, metrics)
  for (const pattern of USER_DATA_PATTERNS) {
    if (pattern.test(text)) {
      let needed = ['today_status', 'nutrition_today'];
      if (/жим|жал|присед|тяг|тренировк/i.test(text) || /жим|жал|присед|тяг/i.test(recentTopic)) {
        needed.push('recent_workouts', 'exercise_history');
      }
      if (/с(он|на|ну|не|ном)|сп|sleep/i.test(text)) {
        needed.push('sleep_summary', 'hrv_trend');
      }
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

  // 6. Training Check (including multi-turn follow-ups about weights/sets)
  for (const pattern of TRAINING_PATTERNS) {
    if (pattern.test(text) || (/добавить вес|еще подход|тяжело/i.test(text) && /жим|жал|присед|тяг|тренир/i.test(recentTopic))) {
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
    if (pattern.test(text) || (/съесть|ужин|добрать/i.test(text) && /калор|белк|протеин/i.test(recentTopic))) {
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
