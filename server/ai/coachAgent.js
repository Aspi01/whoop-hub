/**
 * Scoped Health & Performance Coach Agent
 * Integrates Scope Router, App Knowledge, Selective Context, Conversation Memory, and Token Budgeting.
 */
import { classifyScopeAndIntent, INTENTS } from './scopeRouter.js';
import { getExactAppHelpAnswer } from './appKnowledge.js';
import { buildSelectiveContext } from './contextBuilder.js';
import { getConversationHistory } from './conversationMemory.js';
import { logLatencyMetrics, TOKEN_BUDGETS } from './tokenBudget.js';
import { DOMAIN_COACH_SYSTEM_PROMPT } from './coachPrompt.js';
import { getOpenAIApiKey, getOpenAIModel } from '../services/openaiFoodService.js';
import OpenAI from 'openai';

export async function handleCoachQuestion({ question }) {
  const overallStart = Date.now();
  const cleanQuestion = String(question || '').trim();

  // 1. FAST SCOPE ROUTING (< 5ms)
  const routeStart = Date.now();
  const classification = classifyScopeAndIntent(cleanQuestion);
  const route_ms = Date.now() - routeStart;

  // 1.1 Out-of-Scope Instant Refusal (0 LLM Tokens)
  if (!classification.allowed) {
    const total_ms = Date.now() - overallStart;
    logLatencyMetrics({
      intent: classification.intent,
      route_ms,
      context_ms: 0,
      llm_ms: 0,
      total_ms,
      model: 'instant_rule_refusal',
      tokens_used: 0
    });
    return {
      answer: classification.refusalMessage,
      intent: classification.intent,
      contextTags: ['Вне области приложения'],
      metrics: { route_ms, context_ms: 0, llm_ms: 0, total_ms }
    };
  }

  // 1.2 Deterministic App Help Instant Resolution (0 LLM Tokens)
  if (classification.intent === INTENTS.APP_HELP) {
    const exactAppAnswer = getExactAppHelpAnswer(cleanQuestion);
    if (exactAppAnswer) {
      const total_ms = Date.now() - overallStart;
      logLatencyMetrics({
        intent: classification.intent,
        route_ms,
        context_ms: 0,
        llm_ms: 0,
        total_ms,
        model: 'deterministic_app_doc',
        tokens_used: 0
      });
      return {
        answer: exactAppAnswer,
        intent: classification.intent,
        contextTags: ['Навигация приложения'],
        metrics: { route_ms, context_ms: 0, llm_ms: 0, total_ms }
      };
    }
  }

  // 2. SELECTIVE CONTEXT RETRIEVAL (Parallel non-blocking reads)
  const { context, context_ms } = await buildSelectiveContext(classification, cleanQuestion);
  const conversationHistory = await getConversationHistory(6);

  // Determine context tags for UI transparency
  const contextTags = [];
  if (context.today) contextTags.push(`Recovery ${context.today.recoveryScore}%`, `HRV ${context.today.hrv}ms`);
  if (context.nutrition) contextTags.push(`Осталось ${context.nutrition.caloriesRemaining} ккал`);
  if (context.exerciseHistory?.length) contextTags.push(`История ${context.exerciseHistory[0].exercise}`);

  // 3. PROMPT & MESSAGES ASSEMBLY
  const contextSnippet = Object.keys(context).length > 0
    ? `\n\n[АКТУАЛЬНЫЙ КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ]:\n${JSON.stringify(context, null, 2)}`
    : '';

  const messages = [
    { role: 'system', content: `${DOMAIN_COACH_SYSTEM_PROMPT}${contextSnippet}` }
  ];

  // Include recent conversation history for multi-turn continuity
  for (const m of conversationHistory.slice(-4)) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: 'user', content: cleanQuestion });

  // 4. LLM INVOCATION WITH TOKEN BUDGETING
  const llmStart = Date.now();
  let aiAnswer = '';
  const apiKey = await getOpenAIApiKey();
  const modelName = getOpenAIModel() || 'gpt-5.6';

  if (apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      const budget = TOKEN_BUDGETS[classification.intent] || { maxOutput: 500 };
      
      const completion = await client.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: 0.2,
        max_completion_tokens: budget.maxOutput
      });

      aiAnswer = completion.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.warn('[Coach LLM Error, falling back to smart deterministic advice]:', err.message);
    }
  }

  // Fallback if no LLM key or network failure
  if (!aiAnswer) {
    aiAnswer = generateSmartFallbackAnswer(cleanQuestion, context, classification.intent);
  }

  // Sanitize: ensure no outbound purchase links exist
  aiAnswer = sanitizeOutboundLinks(aiAnswer);

  const llm_ms = Date.now() - llmStart;
  const total_ms = Date.now() - overallStart;

  logLatencyMetrics({
    intent: classification.intent,
    route_ms,
    context_ms,
    llm_ms,
    total_ms,
    model: apiKey ? modelName : 'smart_fallback',
    tokens_used: aiAnswer.length
  });

  return {
    answer: aiAnswer,
    intent: classification.intent,
    contextTags: contextTags.length > 0 ? contextTags : ['Анализ физиологии'],
    metrics: { route_ms, context_ms, llm_ms, total_ms }
  };
}

/**
 * Remove any accidental http/https shopping links
 */
function sanitizeOutboundLinks(text) {
  return text.replace(/https?:\/\/[^\s)]+/gi, '[магазины спортивного питания и экипировки]');
}

/**
 * High-quality deterministic fallback response using selective context
 */
function generateSmartFallbackAnswer(question, context, intent) {
  const q = question.toLowerCase();
  const hasHealthData = Boolean(context.today?.available && context.today?.recoveryScore !== null);

  // 1. Recovery / Training readiness questions
  if (q.includes('recovery') || q.includes('восстановлен') || q.includes('сон') || q.includes('hrv') || q.includes('пульс')) {
    if (!hasHealthData) {
      return `У меня пока нет актуальных данных твоего восстановления и сна.\n\nЧтобы получать персональный анализ:\n• Подключи свой **Whoop 4.0** или **Apple Health** в меню «Источники данных» (иконка чипа вверху);\n• После синхронизации я смогу оценивать твой Recovery, HRV и фазы сна относительно твоего личного baseline.\n\nЕсли хочешь разобрать общие принципы восстановления или составить план тренировки — спроси меня!`;
    }

    const rec = context.today.recoveryScore;
    const hrv = context.today.hrv;
    const hrvDelta = context.today.hrvDeltaPct ? ` (${context.today.hrvDeltaPct} к baseline)` : '';
    const sleepDelta = context.today.sleepDeltaVsBaselineMin 
      ? `${context.today.sleepDeltaVsBaselineMin}` 
      : (context.today.sleepFormatted ? `${context.today.sleepFormatted} (baseline формируется)` : 'нет данных');
    const stressStr = (context.rituals?.stressLevel !== null && context.rituals?.stressLevel !== undefined) 
      ? `${context.rituals.stressLevel}/10` 
      : 'нет данных';

    if (q.includes('почему') || q.includes('ниже') || q.includes('упал')) {
      return `Твой Recovery сегодня составляет **${rec}%** (${rec >= 67 ? 'зеленая' : rec >= 34 ? 'умеренная' : 'красная'} зона).\n\nФакторы:\n• Сон относительно baseline: **${sleepDelta}**;\n• HRV: **${hrv || '--'} мс**${hrvDelta};\n• Субъективный стресс: **${stressStr}**.\n\nРекомендация: тренироваться можно, но держи фокус на технике и контролируй интенсивность.`;
    }

    return `Твой Recovery сегодня составляет **${rec}%**, HRV — **${hrv || '--'} мс**${hrvDelta}. Можно ориентироваться на это состояние при выборе весов.`;
  }

  // 2. Training questions
  if (q.includes('трениров') || q.includes('тяжело') || q.includes('стоит ли')) {
    if (hasHealthData) {
      const rec = context.today.recoveryScore;
      return `Сегодня Recovery равен **${rec}%** — организм готов к ${rec >= 67 ? 'полноценной' : 'умеренной'} силовой нагрузке.\n\nРекомендации на тренировку:\n• Работай в диапазоне RPE ${rec >= 67 ? '7-8' : '6-7'};\n• Не делай форсированных повторений до отказа;\n• Держи паузы между тяжелыми сетами от 2.5 до 3 минут.`;
    }

    return `Для планирования силовой тренировки:\n• Если чувствуешь бодрость и хорошо спал — работай в рабочем объёме с RPE 7-8;\n• При ощущении недосыпа или забитости мышц — снизь рабочий вес на 10-15% или сделай упор на технику;\n• Обязательно уделяй 5-7 минут разминке суставов перед базовыми движениями.`;
  }

  // 3. Nutrition / Protein questions
  if (q.includes('белок') || q.includes('калори') || q.includes('съесть') || q.includes('ужин')) {
    const calRem = context.nutrition?.caloriesRemaining ?? 2250;
    const protRem = context.nutrition?.proteinRemaining ?? 150;

    if (q.includes('сколько') && q.includes('белк')) {
      return `Тебе осталось добрать **${protRem} г белка** и **${calRem} ккал** до дневной цели.\n\nОтличные варианты для закрытия нормы:\n• 150 г филе индейки или курицы (~45 г белка);\n• 200 г нежирного творога 2–5% (~36 г белка);\n• 1 порция сывороточного изолята (~24 г белка).`;
    }

    if (q.includes('съесть') || q.includes('ужин') || q.includes('на эти калории')) {
      return `У тебя в запасе **${calRem} ккал** и **${protRem} г белка**.\n\nРекомендуемый состав ужина:\n• **Основной белок**: запеченная рыба (судак/треска) или куриное филе 180 г;\n• **Клетчатка**: свежие овощи или брокколи на пару;\n• **Углеводы**: 120-150 г отварного риса или гречки по аппетиту.\n\n*Старайся поужинать за 2.5-3 часа до сна для сохранения глубокой фазы сна (SWS).* `;
    }

    return `До выполнения дневной нормы осталось **${calRem} ккал** и **${protRem} г белка**. Сфокусируйся на цельных источниках белка.`;
  }

  // 4. Exercise specific (Bench press / Squats)
  if (q.includes('жим') || q.includes('веса')) {
    return `По жимовым тренировкам:\n• Контролируй плотность и технику сетов;\n• Если силовые остановились — добавь вариативность (жим с паузой, жим гантелей);\n• Следи за восстановлением плечевого пояса и качеством сна.\n\nРекомендация: не гонись за весом в каждом подходе, держи последний рабочий сет около RPE 8.`;
  }

  // 5. Sports products / gear
  if (q.includes('лямк') || q.includes('электролит') || q.includes('пояс')) {
    if (q.includes('лямк')) {
      return `Для становой тяги и тяговых упражнений лучше всего подходят:\n• **Хлопковые классические лямки** (мягкие, не врезаются в кисть);\n• **Лямки «восьмёрки» (Figure 8)** — для максимальной фиксации в тяжёлых подходах;\n• **Нейлоновые с неопреновой подкладкой** — высокая долговечность.\n\nИх можно найти в крупных спортивных магазинах и на маркетплейсах (бренды вроде Schiek, Eleiko, Bear Grip).`;
    }
    if (q.includes('электролит')) {
      return `Электролитные комплексы (натрий, калий, магний) обычно продаются:\n• В магазинах спортивного питания (в виде порошков или шипучих таблеток);\n• В аптеках (регидратационные растворы);\n• В отделах здорового питания маркетплейсов.\n\nВыбирай варианты без добавленного сахара с содержанием натрия 300–500 мг и магния 100–200 мг на порцию.`;
    }
  }

  return `Я готов помочь с анализом тренировок, расчетом питания (КБЖУ), разбором сна и функциями приложения. Сформулируй свой вопрос!`;
}
