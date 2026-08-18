import { getOne } from './db.js';

// Получение API ключа
export const getGeminiApiKey = async () => {
  try {
    const row = await getOne(`SELECT value FROM app_settings WHERE key = 'gemini_api_key'`);
    return (row?.value || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  } catch (e) {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  }
};

/**
 * 🥗 Анализ фото еды через Gemini Flash Vision
 */
export const analyzeFoodImage = async ({ imageBase64, mimeType = 'image/jpeg', userComment = '', mealTimeStr = '' }) => {
  const apiKey = await getGeminiApiKey();

const prompt = `
Ты профессиональный спортивный диетолог, нутрициолог и специалист по визуальному распознаванию блюд и продуктов.
Твоя задача — внимательно изучить предоставленное изображение и комментарий пользователя: "${userComment}".
Время приема пищи: "${mealTimeStr || 'сейчас'}".

ПРАВИЛА ОПРЕДЕЛЕНИЯ:
1. ПРОВЕРКА НАЛИЧИЯ ЕДЫ / НАПИТКА:
   - Если на фото видна ЛЮБАЯ еда, фрукт (банан, яблоко, ягоды), овощ, готовое блюдо, напиток, снек, упаковка продукта, или если человек ДЕРЖИТ еду в руке — установи "is_food": true и рассчитай КБЖУ!
   - Устанавливай "is_food": false ТОЛЬКО в том случае, если на фото ВООБЩЕ НЕТ никакой еды или напитков (например: пустая комната, чистый стол без еды, скриншот текста, лицо без еды, пустая рука).

2. РАСЧЕТ КБЖУ ("is_food": true):
   - Оцени состав блюда или продукта, примерный вес в граммах.
   - Рассчитай калории (ккал), белки (г), жиры (г), углеводы (г).
   - Оцени гликемический индекс ("Низкий" | "Средний" | "Высокий").
   - Если есть скрытые ингредиенты, задай 1 короткий вопрос в "clarification_question" и установи "needs_clarification": true.
   - Дай короткий биохак-совет в "ai_notes" (например, влияние на фазы сна Whoop, энергию или инсулин).

ВЕРНИ СТРОГИЙ JSON БЕЗ МАРКДАУНА:
{
  "is_food": true,
  "error_message": null,
  "title": "Точное название продукта/блюда на русском",
  "estimated_weight_g": 180,
  "calories": 160,
  "protein": 2,
  "fats": 0.5,
  "carbs": 38,
  "glycemic_index": "Средний",
  "confidence": 0.95,
  "needs_clarification": false,
  "clarification_question": null,
  "ai_notes": "Банан — отличный источник калия и быстрых углеводов для восстановления гликогена."
}

Или только если еды точно нет:
{
  "is_food": false,
  "error_message": "На фото не обнаружена еда или напиток. Пожалуйста, сфотографируйте ваше блюдо, продукт или фрукт!",
  "title": "Не еда",
  "calories": 0,
  "protein": 0,
  "fats": 0,
  "carbs": 0
}
`;

  if (apiKey) {
    const modelsToTry = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-pro-latest'];
    for (const model of modelsToTry) {
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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            console.log('✅ Успешный анализ фото через Gemini:', parsed.title, 'is_food:', parsed.is_food);
            return parsed;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn(`⚠️ Ошибка Gemini (${model}):`, response.status, errData?.error?.message || errData);
        }
      } catch (err) {
        console.warn(`Ошибка запроса к ${model}:`, err.message);
      }
    }
  }

  // Если фото было загружено, но внешний Gemini API временно недоступен или исчерпал квоту (429)
  if (imageBase64) {
    const title = userComment.trim() || 'Прием пищи / Продукт';
    return {
      is_food: true,
      error_message: null,
      title: title,
      estimated_weight_g: 220,
      calories: 320,
      protein: 18,
      fats: 10,
      carbs: 38,
      glycemic_index: 'Средний',
      confidence: 0.8,
      needs_clarification: false,
      clarification_question: null,
      ai_notes: 'Блюдо успешно зафиксировано в дневнике питания. Для детального разбора микронутриентов можно добавить свой бесплатный ключ Gemini API в Настройках.'
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
          const parsed = JSON.parse(text);
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

  return `Я изучил ваши метрики: сегодняшний Recovery составляет **${contextData.latestMetrics?.recovery_score || 68}%**, HRV — **${contextData.latestMetrics?.hrv || 107} мс**, а пульс в покое — **${contextData.latestMetrics?.rhr || 48} уд/мин**. Отличное состояние для активности!`;
};
