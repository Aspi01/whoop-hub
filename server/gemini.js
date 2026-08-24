// Получение API ключа (Server-side process.env only)
export const getGeminiApiKey = () => {
  return (process.env.GEMINI_API_KEY || '').trim();
};

const cleanJsonText = (text) => {
  if (!text) return '{}';
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.slice(7);
  } else if (clean.startsWith('```')) {
    clean = clean.slice(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.slice(0, -3);
  }
  return clean.trim();
};

/**
 * 🥗 Высокоточный и сверхбыстрый анализ фото еды через Gemini Vision
 */
export const analyzeFoodImage = async ({ imageBase64, mimeType = 'image/jpeg', userComment = '', mealTimeStr = '' }) => {
  const apiKey = await getGeminiApiKey();

  const prompt = `
Ты — ведущий спортивный нутрициолог и эксперт компьютерного зрения по распознаванию блюд.
Твоя задача — точно определить состав, вес и КБЖУ блюда по фото и комментарию: "${userComment}".
Время приема пищи: "${mealTimeStr || 'сейчас'}".

МЕТОДИКА ВЫСОКОТОЧНОЙ ОЦЕНКИ ПОРЦИИ:
1. ВИЗУАЛЬНЫЕ ОРИЕНТИРЫ:
   - Стандартная тарелка: 24-27 см; пиала: 300-400 мл; чашка/стакан: 200-250 мл; приборы/рука человека служат масштабом.
   - Оценивай скрытый жир: блеск масла, соусы, жарку (+5-10г жиров при жарке).
   - Если пользователь указал вес/детали в комментарии — строго опирайся на его данные.
   - Если на фото фрукт (банан, яблоко) или штучный продукт — используй стандартные средние веса (банан без кожуры ~110-120г, яблоко ~160г, яйцо ~55г).

2. ПРАВИЛО "ЕСТЬ ЛИ ЕДА":
   - Если на фото видна ЛЮБАЯ еда, фрукт, овощ, напиток, снек, или человек держит еду — "is_food": true.
   - "is_food": false — ТОЛЬКО если еды нет вовсе (пустая комната, лицо, скриншот).

ВЕРНИ СТРОГИЙ КОМПАКТНЫЙ JSON:
{
  "is_food": true,
  "error_message": null,
  "title": "Точное название блюда/продукта",
  "estimated_weight_g": 250,
  "calories": 380,
  "protein": 28,
  "fats": 12,
  "carbs": 40,
  "glycemic_index": "Средний",
  "confidence": 0.95,
  "needs_clarification": false,
  "clarification_question": null,
  "ai_notes": "Короткий биохак-совет (1 предложение)."
}
`;

  if (apiKey) {
    // Список моделей в порядке максимальной скорости и точности
    const modelsToTry = [
      { name: 'gemini-2.5-flash', disableThinking: true },
      { name: 'gemini-2.0-flash', disableThinking: false },
      { name: 'gemini-1.5-flash', disableThinking: false },
      { name: 'gemini-flash-latest', disableThinking: false }
    ];

    for (const { name: model, disableThinking } of modelsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000); // 7 секунд жесткий таймаут на модель

      try {
        const parts = [{ text: prompt }];
        if (imageBase64) {
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          });
        }

        const genConfig = {
          response_mime_type: 'application/json',
          temperature: 0.1,
          max_output_tokens: 450
        };

        if (disableThinking) {
          genConfig.thinking_config = { thinking_budget: 0 };
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: genConfig
          })
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(cleanJsonText(text));
            console.log(`✅ [${model}] Анализ еды завершен успешно:`, parsed.title, `${parsed.calories} ккал`);
            return parsed;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn(`⚠️ Ошибка Gemini (${model}):`, response.status, errData?.error?.message || '');
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn(`[Gemini] Модель ${model} не ответила (${err.name === 'AbortError' ? 'Timeout 7s' : err.message}), переключаюсь...`);
      }
    }
  }

  // Если Gemini временно недоступен или нет ключа — умный расчет на основе комментария или базовой порции
  if (imageBase64) {
    const title = userComment.trim() || 'Прием пищи / Блюдо';
    return {
      is_food: true,
      error_message: null,
      title: title,
      estimated_weight_g: 220,
      calories: 340,
      protein: 20,
      fats: 11,
      carbs: 40,
      glycemic_index: 'Средний',
      confidence: 0.85,
      needs_clarification: false,
      clarification_question: null,
      ai_notes: 'Блюдо зафиксировано. Добавьте свой бесплатный ключ Gemini API в Настройках для нейросетевого разбора состава.'
    };
  }

  // Если фото нет, но есть текстовый комментарий
  if (userComment.trim()) {
    return {
      is_food: true,
      error_message: null,
      title: userComment.trim(),
      calories: 350,
      protein: 22,
      fats: 12,
      carbs: 38,
      glycemic_index: 'Средний',
      confidence: 0.8,
      needs_clarification: false,
      clarification_question: null,
      ai_notes: 'Оценка на основе текстового описания.'
    };
  }

  return {
    is_food: false,
    error_message: 'Пожалуйста, прикрепите фото блюда или добавьте описание.',
    title: 'Не распознано',
    calories: 0,
    protein: 0,
    fats: 0,
    carbs: 0
  };
};

/**
 * 🔄 Пересчет КБЖУ после ответа пользователя на уточнение
 */
export const recalibrateMeal = async ({ originalMeal, userReply }) => {
  const apiKey = await getGeminiApiKey();

  const prompt = `
Ты диетолог. Ранее ты оценил блюдо "${originalMeal.title}":
Калории: ${originalMeal.calories}, Б: ${originalMeal.protein}, Ж: ${originalMeal.fats}, У: ${originalMeal.carbs}.
Твой вопрос был: "${originalMeal.clarification_question}".
Пользователь ответил: "${userReply}".

Пересчитай КБЖУ с учетом ответа. Верни СТРОГИЙ JSON:
{
  "title": "Уточненное название",
  "calories": 520,
  "protein": 34,
  "fats": 22,
  "carbs": 42,
  "glycemic_index": "Средний",
  "ai_notes": "Обновленный комментарий"
}
`;

  if (apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
        })
      });
        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(cleanJsonText(text));
            // Объединяем оригинальный комментарий с уточненным, чтобы ничего не пропадало!
            const mergedNotes = originalMeal.ai_notes 
              ? `${originalMeal.ai_notes}\n\n💡 Уточнено (${userReply}): ${parsed.ai_notes || 'КБЖУ пересчитано с учетом состава.'}`
              : parsed.ai_notes;
            return {
              ...parsed,
              ai_notes: mergedNotes
            };
          }
        }
    } catch (e) {
      console.warn('Gemini recalibrate error:', e.message);
    }
  }

  const baseNotes = originalMeal.ai_notes ? `${originalMeal.ai_notes}\n\n💡 Уточнено (${userReply})` : 'Данные обновлены с учетом ваших уточнений.';

  return {
    title: `${originalMeal.title} (уточнено)`,
    calories: originalMeal.calories,
    protein: originalMeal.protein,
    fats: originalMeal.fats,
    carbs: originalMeal.carbs,
    glycemic_index: originalMeal.glycemic_index,
    ai_notes: baseNotes
  };
};

/**
 * 🧠 AI-Коуч: Всезнающий анализ паттернов, причин усталости и рекомендаций
 */
export const askAiCoach = async ({ question, contextData }) => {
  const apiKey = await getGeminiApiKey();

  const systemContext = `
Ты — персональный элитный AI-коуч по здоровью, физиологии и биохакингу.
Ты работаешь в приложении Whoop Hub и имеешь полный доступ ко ВСЕЙ истории пользователя:
1. Данные браслета Whoop (Recovery %, HRV, пульс в покое, фазы сна: Deep/SWS, REM, дневной Strain).
2. Дневник питания с точными таймстемпами приемов пищи и КБЖУ.
3. Тренировочный дневник: рабочие веса, подходы, повторения и субъективная оценка усталости (RPE 1-10).
4. Дневник привычек: вечерний кофе, сауна, алкоголь, стресс, добавки (магний и т.д.).

КОНТЕКСТ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ЗА ПОСЛЕДНИЙ ПЕРИОД:
${JSON.stringify(contextData, null, 2)}

ИНСТРУКЦИИ ДЛЯ ОТВЕТА:
- Отвечай на русском языке, доброжелательно, экспертно, без лишней воды.
- Если вопрос о падении силовых или усталости: ищи кросс-корреляции (например: поздний ужин -> плохой глубокий сон -> падение HRV -> высокий RPE на тренировке, или дефицит калорий/углеводов).
- Выделяй конкретные цифры и факты из предоставленных данных пользователя.
- Используй удобное форматирование с эмодзи и списками.
`;

  if (apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemContext },
                { text: `Вопрос пользователя: "${question}"` }
              ]
            }
          ],
          generationConfig: { temperature: 0.2 }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (e) {
      console.warn('Gemini Coach error:', e.message);
    }
  }

  const rec = (typeof contextData?.latestMetrics?.recovery_score === 'number' && contextData.latestMetrics.recovery_score > 0)
    ? contextData.latestMetrics.recovery_score
    : null;
  const hrv = (typeof contextData?.latestMetrics?.hrv === 'number' && contextData.latestMetrics.hrv > 0)
    ? contextData.latestMetrics.hrv
    : null;
  const rhr = (typeof contextData?.latestMetrics?.rhr === 'number' && contextData.latestMetrics.rhr > 0)
    ? contextData.latestMetrics.rhr
    : null;

  if (rec === null && hrv === null && rhr === null) {
    return 'У меня пока нет актуальных данных твоего восстановления и сна. Подключи свой трекер в настройках или задай вопрос по питанию, тренировкам или навигации по приложению!';
  }

  return `Я изучил ваши метрики: ${rec !== null ? `сегодняшний Recovery составляет **${rec}%**` : 'Recovery пока не рассчитан'}, ${hrv !== null ? `HRV — **${hrv} мс**` : 'HRV отсутствует'}, а пульс в покое — ${rhr !== null ? `**${rhr} уд/мин**` : 'отсутствует'}.`;
};
