/**
 * Scoped Health & Performance Coach Agent
 * Integrates Scope Router, App Knowledge, Selective Context, Conversation Memory, Token Budgeting,
 * Deterministic User Data Resolution, and Robust Multi-Turn Context.
 */
import { classifyScopeAndIntent, INTENTS } from './scopeRouter.js';
import { getExactAppHelpAnswer } from './appKnowledge.js';
import { buildSelectiveContext } from './contextBuilder.js';
import { getConversationHistory } from './conversationMemory.js';
import { logLatencyMetrics, TOKEN_BUDGETS } from './tokenBudget.js';
import { DOMAIN_COACH_SYSTEM_PROMPT } from './coachPrompt.js';
import { getOpenAIApiKey, getOpenAIModel } from '../services/openaiFoodService.js';
import OpenAI from 'openai';

export async function handleCoachQuestion({ question, conversationHistory: inputHistory }) {
  const overallStart = Date.now();
  const cleanQuestion = String(question || '').trim();

  // Retrieve or use passed conversation history for multi-turn continuity
  const conversationHistory = Array.isArray(inputHistory) && inputHistory.length > 0 
    ? inputHistory 
    : await getConversationHistory(6);

  // 1. FAST SCOPE ROUTING (< 5ms) with multi-turn history awareness
  const routeStart = Date.now();
  const classification = classifyScopeAndIntent(cleanQuestion, conversationHistory);
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

  // 2. SELECTIVE CONTEXT RETRIEVAL (Parallel non-blocking reads with multi-turn history)
  const { context, context_ms } = await buildSelectiveContext(classification, cleanQuestion, conversationHistory);

  // 2.1 Deterministic User-Data Instant Resolution (0 LLM Hallucinations)
  const deterministicAnswer = getDeterministicUserDataAnswer(cleanQuestion, context, conversationHistory);
  if (deterministicAnswer) {
    const total_ms = Date.now() - overallStart;
    logLatencyMetrics({
      intent: classification.intent,
      route_ms,
      context_ms,
      llm_ms: 0,
      total_ms,
      model: 'deterministic_facts',
      tokens_used: 0
    });
    return {
      answer: deterministicAnswer,
      intent: classification.intent,
      contextTags: ['Точные факты пользователя'],
      metrics: { route_ms, context_ms, llm_ms: 0, total_ms }
    };
  }

  // Determine context tags for UI transparency
  const contextTags = [];
  if (context.today?.recoveryScore !== null && context.today?.recoveryScore !== undefined) {
    contextTags.push(`Recovery ${context.today.recoveryScore}%`);
  }
  if (context.nutrition?.caloriesRemaining !== undefined) {
    contextTags.push(`Осталось ${context.nutrition.caloriesRemaining} ккал`);
  }
  if (context.exerciseHistory?.length) {
    contextTags.push(`История ${context.exerciseHistory[0].exercise}`);
  }

  // 3. PROMPT & MESSAGES ASSEMBLY
  const contextSnippet = Object.keys(context).length > 0
    ? `\n\n[АКТУАЛЬНЫЙ КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ]:\n${JSON.stringify(context, null, 2)}`
    : '';

  const messages = [
    { role: 'system', content: `${DOMAIN_COACH_SYSTEM_PROMPT}${contextSnippet}` }
  ];

  // Include recent conversation history for multi-turn continuity
  for (const m of conversationHistory.slice(-4)) {
    messages.push({ role: m.role || (m.sender === 'user' ? 'user' : 'assistant'), content: m.content || m.message });
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
    aiAnswer = generateSmartFallbackAnswer(cleanQuestion, context, classification.intent, conversationHistory);
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
 * Deterministic User Data Facts Resolver (Zero Hallucination Arithmetic)
 */
function getDeterministicUserDataAnswer(question, context, conversationHistory) {
  const q = question.toLowerCase();

  // 1. Protein remaining / consumed
  if (/сколько.*(белк|протеин)|(белк|протеин).*сколько/i.test(q) && /остал|добрать|надо|нужно|съес/i.test(q)) {
    const goal = context.nutrition?.proteinGoal ?? 150;
    const consumed = context.nutrition?.consumedProtein ?? 0;
    const remaining = Math.max(0, goal - consumed);
    return `Тебе осталось добрать **${remaining} г белка** (съедено ${consumed} г из дневной цели ${goal} г).`;
  }

  // 2. Calories remaining / consumed
  if (/сколько.*калор|калор.*сколько/i.test(q) && /остал|добрать|надо|нужно|съес|запас/i.test(q)) {
    const goal = context.nutrition?.calorieGoal ?? 2250;
    const consumed = context.nutrition?.consumedCalories ?? 0;
    const remaining = Math.max(0, goal - consumed);
    return `У тебя осталось **${remaining} ккал** до дневной цели (потреблено ${consumed} ккал из ${goal} ккал).`;
  }

  // 3. Last bench press / exercise performance
  if (/последн(ий|его|ем).*жим|жим.*последн/i.test(q)) {
    if (context.exerciseHistory && context.exerciseHistory.length > 0) {
      const ex = context.exerciseHistory[0];
      const maxWeight = ex.topSetWeight || (ex.sets?.[0]?.weight ?? 0);
      const reps = ex.sets?.[0]?.reps || 10;
      return `Твой последний рабочий жим: **${maxWeight} кг** на ${reps} повт. (${ex.date}).`;
    }
    if (context.recentWorkouts && context.recentWorkouts.length > 0) {
      const w = context.recentWorkouts[0];
      return `Последняя тренировка: «${w.title}» (${w.date}).`;
    }
    return `В истории тренировок пока нет сохранённых записей жима. Зафиксируй подход во вкладке Train!`;
  }

  // 4. Last general workout
  if (/последн(яя|ей).*тренировк/i.test(q)) {
    if (context.recentWorkouts && context.recentWorkouts.length > 0) {
      const w = context.recentWorkouts[0];
      return `Твоя последняя тренировка была **${w.date}**: «${w.title || w.type}» (длительность: ${w.duration_min || 45} мин, strain: ${w.strain || '--'}).`;
    }
    return `Пока нет зафиксированных тренировок. Нажми «Начать тренировку» во вкладке Train.`;
  }

  return null;
}

/**
 * Remove any accidental http/https shopping links
 */
function sanitizeOutboundLinks(text) {
  return text.replace(/https?:\/\/[^\s)]+/gi, '[магазины спортивного питания и экипировки]');
}

/**
 * High-quality deterministic fallback response using selective context & multi-turn history
 */
function generateSmartFallbackAnswer(question, context, intent, conversationHistory = []) {
  const q = question.toLowerCase();
  const hasHealthData = Boolean(context.today?.available && context.today?.recoveryScore !== null);

  // Extract previous context for multi-turn continuity
  let recentTopic = '';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const lastUser = [...conversationHistory].reverse().find(m => (m.role === 'user' || m.sender === 'user'));
    if (lastUser) recentTopic = (lastUser.content || lastUser.message || '').toLowerCase();
  }

  // Multi-Turn Follow-Up Check (e.g. "А если я всё равно хочу добавить вес?")
  if (/добавить вес|еще подход|тяжело|увеличить вес/i.test(q) && (/жим/i.test(recentTopic) || /жим/i.test(q))) {
    const rec = context.today?.recoveryScore;
    const recNote = rec !== null && rec !== undefined ? `при текущем Recovery ${rec}%` : '';
    return `Если ты всё равно планируешь добавить вес на жиме ${recNote}:\n\n1. **Разминка**: сделай 2–3 подводящих сета (например, 50% и 75% от рабочего веса) по 3–5 повторений без закисления.\n2. **Страховка**: обязательно попроси напарника или дежурного тренера подстраховать тебя на рабочем подходе.\n3. **Запас сил (RPE)**: не иди в отказ до отказа техники — оставляй 1–2 повторения в запасе (RPE 8–8.5).\n4. **Отдых**: увеличь интервал отдыха между тяжелыми подходами до 3–3.5 минут.`;
  }

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
  if (q.includes('трениров') || q.includes('тяжело') || q.includes('стоит ли') || q.includes('жим') || q.includes('присед')) {
    if (hasHealthData) {
      const rec = context.today.recoveryScore;
      return `Сегодня Recovery равен **${rec}%** — организм готов к ${rec >= 67 ? 'полноценной' : 'умеренной'} силовой нагрузке.\n\nРекомендации на тренировку:\n• Работай в диапазоне RPE ${rec >= 67 ? '7-8' : '6-7'};\n• Не делай форсированных повторений до отказа;\n• Держи паузы между тяжелыми сетами от 2.5 до 3 минут.`;
    }

    return `Для планирования силовой тренировки:\n• Если чувствуешь бодрость и хорошо спал — работай в рабочем объёме с RPE 7-8;\n• При ощущении недосыпа или забитости мышц — снизь рабочий вес на 10-15% или сделай упор на технику;\n• Обязательно уделяй 5-7 минут разминке суставов перед базовыми движениями.`;
  }

  // 3. Nutrition / Protein questions
  if (q.includes('белок') || q.includes('белка') || q.includes('калори') || q.includes('съесть') || q.includes('ужин')) {
    const calRem = context.nutrition?.caloriesRemaining ?? 2250;
    const protRem = context.nutrition?.proteinRemaining ?? 150;

    if (q.includes('сколько') && (q.includes('белк') || q.includes('протеин'))) {
      return `Тебе осталось добрать **${protRem} г белка** и **${calRem} ккал** до дневной цели.\n\nОтличные варианты для закрытия нормы:\n• 150 г филе индейки или курицы (~45 г белка);\n• 200 г нежирного творога 2–5% (~36 г белка);\n• 1 порция сывороточного изолята (~24 г белка).`;
    }

    if (q.includes('съесть') || q.includes('ужин') || q.includes('на эти калории')) {
      return `У тебя в запасе **${calRem} ккал** и **${protRem} г белка**.\n\nРекомендуемый состав ужина:\n• **Основной белок**: запеченная рыба (судак/треска) или куриное филе 180 г;\n• **Клетчатка**: свежие овощи или брокколи на пару;\n• **Углеводы**: 120-150 г отварного риса или гречки по аппетиту.\n\n*Старайся поужинать за 2.5-3 часа до сна для сохранения глубокой фазы сна (SWS).* `;
    }

    return `До выполнения дневной нормы осталось **${calRem} ккал** и **${protRem} г белка**. Сфокусируйся на цельных источниках белка.`;
  }

  return `Я проанализировал твой запрос. Сфокусируйся на соблюдении режима сна, восстановлении и балансе макронутриентов. Если хочешь разобрать конкретное упражнение или блюдо — напиши детали!`;
}
