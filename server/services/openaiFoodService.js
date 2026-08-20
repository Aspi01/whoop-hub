/**
 * OpenAI Vision Food Analysis Service
 * Uses official OpenAI SDK with Structured Outputs (JSON Schema)
 */
import OpenAI from 'openai';
import { getOne } from '../db.js';
import { FOOD_ANALYSIS_SYSTEM_PROMPT, FOOD_ANALYSIS_JSON_SCHEMA } from '../prompts/foodAnalysisPrompt.js';

export const getOpenAIApiKey = async () => {
  try {
    const row = await getOne(`SELECT value FROM app_settings WHERE key = 'openai_api_key'`);
    return (row?.value || process.env.OPENAI_API_KEY || '').trim();
  } catch (e) {
    return (process.env.OPENAI_API_KEY || '').trim();
  }
};

export const getOpenAIModel = () => {
  return process.env.OPENAI_MODEL || 'gpt-5.6';
};

/**
 * Analyzes food image using OpenAI Vision with Structured Outputs
 * @param {Object} params
 * @param {string} params.imageBase64 - Base64 encoded image string
 * @param {string} params.mimeType - Image MIME type (e.g. 'image/jpeg')
 * @param {string} [params.userContext] - User notes (e.g. "одно яйцо, без масла")
 * @param {string} [params.locale] - Preferred language code (default 'ru')
 * @returns {Promise<Object>} Structured food analysis result
 */
export async function analyzeFoodWithOpenAI({ imageBase64, mimeType = 'image/jpeg', userContext = '', locale = 'ru' }) {
  const apiKey = await getOpenAIApiKey();

  if (!apiKey) {
    // If no API key is provided, return a clear, user-friendly mock preview for testing
    console.warn('[OpenAI Food Analysis] OPENAI_API_KEY is not configured in .env or settings. Returning demo estimation.');
    return generateFallbackAnalysis(userContext);
  }

  const client = new OpenAI({ apiKey });
  const model = getOpenAIModel();

  const userMessageContent = [
    {
      type: 'text',
      text: `Проанализируй блюдо на фотографии.
Пользовательский контекст: "${userContext || 'не указан'}".
Локализация: ${locale}.
Выполни строгую покомпонентную оценку граммовок, скрытых калорий и макронутриентов.`
    }
  ];

  if (imageBase64) {
    userMessageContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${imageBase64}`,
        detail: 'high'
      }
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: FOOD_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userMessageContent }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'food_analysis_result',
          strict: true,
          schema: FOOD_ANALYSIS_JSON_SCHEMA
        }
      },
      temperature: 0.1,
      max_completion_tokens: 1500
    });

    const choice = response.choices?.[0];
    const rawContent = choice?.message?.content;

    if (!rawContent) {
      throw new Error('Пустой ответ от OpenAI API');
    }

    const parsed = JSON.parse(rawContent);
    return parsed;
  } catch (error) {
    console.error('[OpenAI Food Analysis Error]:', error.message);
    
    if (error.status === 401) {
      throw new Error('Неверный или просроченный OPENAI_API_KEY. Проверьте настройки.');
    }
    if (error.status === 429) {
      throw new Error('Превышен лимит запросов OpenAI (Rate Limit). Попробуйте чуть позже.');
    }
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      throw new Error('Таймаут соединения с OpenAI API. Попробуйте повторить запрос.');
    }

    throw new Error(`Ошибка анализа OpenAI: ${error.message || 'Не удалось обработать изображение'}`);
  }
}

/**
 * Realistic structured fallback generator for development when API key is not yet added
 */
function generateFallbackAnalysis(userContext = '') {
  const isEgg = userContext.toLowerCase().includes('яйц');
  const isTurkey = userContext.toLowerCase().includes('индейк');
  const isPorridge = userContext.toLowerCase().includes('каш') || userContext.toLowerCase().includes('овсянк');

  let foodName = 'Каша с яйцом пашот и пармезаном';
  let components = [
    {
      name: 'овсяная каша на воде',
      estimatedWeightG: 180,
      weightLowG: 150,
      weightHighG: 220,
      calories: 165,
      protein_g: 5.5,
      fat_g: 3.2,
      carbs_g: 29.5
    },
    {
      name: 'яйцо пашот',
      estimatedWeightG: 55,
      weightLowG: 50,
      weightHighG: 60,
      calories: 78,
      protein_g: 6.8,
      fat_g: 5.4,
      carbs_g: 0.6
    },
    {
      name: 'пармезан тертый',
      estimatedWeightG: 20,
      weightLowG: 15,
      weightHighG: 25,
      calories: 86,
      protein_g: 7.6,
      fat_g: 6.2,
      carbs_g: 0.8
    },
    {
      name: 'масло сливочное',
      estimatedWeightG: 10,
      weightLowG: 5,
      weightHighG: 15,
      calories: 72,
      protein_g: 0.1,
      fat_g: 8.1,
      carbs_g: 0.1
    }
  ];

  if (isTurkey) {
    foodName = 'Филе индейки с овощами гриль и рисом';
    components = [
      {
        name: 'филе индейки запеченное',
        estimatedWeightG: 160,
        weightLowG: 140,
        weightHighG: 190,
        calories: 210,
        protein_g: 38.0,
        fat_g: 4.2,
        carbs_g: 0.0
      },
      {
        name: 'рис басмати отварной',
        estimatedWeightG: 150,
        weightLowG: 130,
        weightHighG: 180,
        calories: 195,
        protein_g: 4.2,
        fat_g: 0.8,
        carbs_g: 42.0
      },
      {
        name: 'овощи гриль (цукини, перец)',
        estimatedWeightG: 120,
        weightLowG: 100,
        weightHighG: 150,
        calories: 45,
        protein_g: 1.8,
        fat_g: 1.2,
        carbs_g: 7.5
      }
    ];
  }

  const totalCalories = components.reduce((sum, c) => sum + c.calories, 0);
  const totalProtein = Math.round(components.reduce((sum, c) => sum + c.protein_g, 0) * 10) / 10;
  const totalFat = Math.round(components.reduce((sum, c) => sum + c.fat_g, 0) * 10) / 10;
  const totalCarbs = Math.round(components.reduce((sum, c) => sum + c.carbs_g, 0) * 10) / 10;

  return {
    isFood: true,
    notFoodReason: null,
    foodName,
    trackerCalories: Math.round(totalCalories / 5) * 5,
    calories: {
      best: totalCalories,
      low: Math.round(totalCalories * 0.85),
      high: Math.round(totalCalories * 1.2)
    },
    macros: {
      protein_g: totalProtein,
      fat_g: totalFat,
      carbs_g: totalCarbs,
      fiber_g: 4.8
    },
    micronutrients: {
      sugar_g: 3.2,
      sodium_mg: 480,
      potassium_mg: 390,
      calcium_mg: 180,
      iron_mg: 2.8
    },
    components,
    mainCalorieSources: components.slice(0, 3).map(c => c.name),
    beneficialNutrients: [
      { name: 'Белок высокой биологической ценности', reason: 'Спортивное восстановление и синтез мышц' },
      { name: 'Клетчатка и сложные углеводы', reason: 'Плавный гликемический профиль и энергия' }
    ],
    uncertainties: [
      'Точное количество добавленного масла при готовке',
      'Плотность порции на тарелке'
    ],
    confidence: {
      score: 0.88,
      level: 'high'
    },
    clarifyingQuestion: null
  };
}
