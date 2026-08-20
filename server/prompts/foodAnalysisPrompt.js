/**
 * Food Analysis System Prompt & JSON Schema for OpenAI Vision Structured Outputs
 */

export const FOOD_ANALYSIS_SYSTEM_PROMPT = `
Ты — высокоточная система количественной оценки пищевой ценности еды по фотографиям.
Твоя задача — не угадывать калорийность «типичной порции», а максимально точно реконструировать состав, массу и пищевую ценность ИМЕННО той порции, которую показывает пользователь.

ГЛАВНЫЙ ПРИОРИТЕТ:
1. Максимально реалистичная оценка фактически съеденной порции.
2. Корректная оценка массы каждого ингредиента.
3. Обнаружение калорийно-плотных и скрытых ингредиентов (масло, соусы, сыр, сливки).
4. Отсутствие ложной точности.
5. Полезный результат для calorie tracker.

USER CONTEXT HAS PRIORITY:
Информация, которую пользователь написал явно в комментарии (userContext), имеет строгий приоритет над визуальной догадкой:
- Если пользователь указал «одно яйцо», не считай две половинки яйца двумя яйцами.
- Если пользователь указал «без масла» или «жарилось на сухой сковороде», не добавляй масло.
- Если пользователь указал «съел половину» или «съел 1/3», рассчитывай именно указанную долю.
- Если пользователь указал граммы («200г риса») или точный состав («это индейка»), используй именно эти значения.
Не игнорируй фотографию — объединяй visual evidence и пользовательскую информацию.

STEP 1 — IDENTIFY FOOD:
Определи все видимые продукты и составляющие блюда.
Не оценивай всё блюдо сразу одной типичной цифрой — разложи его на компоненты (например: рис, филе индейки, оливковое масло, пармезан, помидоры черри). Для mixed dishes реконструируй вероятные ингредиенты.

STEP 2 — PORTION ESTIMATION:
Для каждого компонента оцени массу (в граммах).
Используй визуальный масштаб фотографии: тарелку (стандартная 24-27 см, пиала 350 мл), приборы (вилка ~20 см, столовая ложка), руку, край стола, упаковку.
Учитывай перспективу, площадь, высоту, насыпную плотность и скрытую часть еды.
Для существенных компонентов оцени weightLowG, estimatedWeightG, weightHighG.
Если визуального масштаба недостаточно — увеличивай диапазон неопределенности (low / high).

STEP 3 — HIDDEN CALORIE AUDIT:
Обязательно отдельно проверь наличие скрытых калорий:
- Растительное или сливочное масло при жарке/заправке (+5-10г жира при наличии характерного блеска);
- Соусы, майонез, сиропы, заправки;
- Сливки, сыр, панировка, фритюр, орехи, авокадо.
Не пропускай ингредиент, если он вероятен при данном способе приготовления, но и не добавляй скрытые калории без оснований.

STEP 4 — CALCULATION:
Оцени nutrition каждого компонента на основании его наиболее вероятной массы:
- calories, protein_g, fat_g, carbs_g, fiber_g.
- Дополнительно оцени, где возможно: sugar_g, sodium_mg, potassium_mg, calcium_mg, iron_mg.
Проверь итог на физическую правдоподобность (Macro sanity check: protein × 4 + carbs × 4 + fat × 9 ≈ calories).

STEP 5 — BIAS CHECK:
- Не занизил ли ты большую порцию?
- Не пропустил ли масло, соус или сливки?
- Не посчитал ли один разрезанный продукт дважды?
- BEST estimate — это наиболее вероятная оценка, а не conservative maximum.
- Для trackerCalories округляй результат до ближайших 5–10 kcal.

ВАЖНО:
- Не отвечай «примерно 500 калорий» без покомпонентной раскладки.
- Если на фото нет еды (лицо, комната, пейзаж), верни isFood = false.
- confidence.score от 0.0 до 1.0 (0.80-1.00 = high, 0.55-0.79 = medium, 0.0-0.54 = low).
`;

export const FOOD_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    isFood: {
      type: "boolean",
      description: "True if food or drink is detected, false otherwise"
    },
    notFoodReason: {
      type: ["string", "null"],
      description: "Explanation if image contains no food"
    },
    foodName: {
      type: "string",
      description: "Short clear title of the meal/dish in Russian"
    },
    trackerCalories: {
      type: "integer",
      description: "Primary rounded calorie estimate for the food log (rounded to nearest 5-10 kcal)"
    },
    calories: {
      type: "object",
      properties: {
        best: { type: "integer", description: "Best realistic calorie estimate" },
        low: { type: "integer", description: "Reasonable lower bound" },
        high: { type: "integer", description: "Reasonable upper bound" }
      },
      required: ["best", "low", "high"],
      additionalProperties: false
    },
    macros: {
      type: "object",
      properties: {
        protein_g: { type: "number", description: "Protein in grams" },
        fat_g: { type: "number", description: "Fat in grams" },
        carbs_g: { type: "number", description: "Carbohydrates in grams" },
        fiber_g: { type: "number", description: "Dietary fiber in grams" }
      },
      required: ["protein_g", "fat_g", "carbs_g", "fiber_g"],
      additionalProperties: false
    },
    micronutrients: {
      type: "object",
      properties: {
        sugar_g: { type: ["number", "null"], description: "Sugar in grams" },
        sodium_mg: { type: ["number", "null"], description: "Sodium in milligrams" },
        potassium_mg: { type: ["number", "null"], description: "Potassium in milligrams" },
        calcium_mg: { type: ["number", "null"], description: "Calcium in milligrams" },
        iron_mg: { type: ["number", "null"], description: "Iron in milligrams" }
      },
      required: ["sugar_g", "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg"],
      additionalProperties: false
    },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Component/ingredient name" },
          estimatedWeightG: { type: "integer", description: "Estimated weight in grams" },
          weightLowG: { type: "integer", description: "Lower weight estimate in grams" },
          weightHighG: { type: "integer", description: "Upper weight estimate in grams" },
          calories: { type: "integer", description: "Calories for this component" },
          protein_g: { type: "number", description: "Protein for this component" },
          fat_g: { type: "number", description: "Fat for this component" },
          carbs_g: { type: "number", description: "Carbs for this component" }
        },
        required: ["name", "estimatedWeightG", "weightLowG", "weightHighG", "calories", "protein_g", "fat_g", "carbs_g"],
        additionalProperties: false
      },
      description: "List of identified meal components"
    },
    mainCalorieSources: {
      type: "array",
      items: { type: "string" },
      description: "Top 2-4 calorie-dense ingredients in the dish"
    },
    beneficialNutrients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          reason: { type: "string" }
        },
        required: ["name", "reason"],
        additionalProperties: false
      },
      description: "Beneficial micronutrients or macros highlighted in this dish"
    },
    uncertainties: {
      type: "array",
      items: { type: "string" },
      description: "Sources of estimation uncertainty (e.g. unknown sauce, hidden oil)"
    },
    confidence: {
      type: "object",
      properties: {
        score: { type: "number", description: "Confidence score between 0.0 and 1.0" },
        level: { type: "string", enum: ["low", "medium", "high"], description: "Confidence category" }
      },
      required: ["score", "level"],
      additionalProperties: false
    },
    clarifyingQuestion: {
      type: ["string", "null"],
      description: "Optional single question that could significantly improve accuracy"
    }
  },
  required: [
    "isFood",
    "notFoodReason",
    "foodName",
    "trackerCalories",
    "calories",
    "macros",
    "micronutrients",
    "components",
    "mainCalorieSources",
    "beneficialNutrients",
    "uncertainties",
    "confidence",
    "clarifyingQuestion"
  ],
  additionalProperties: false
};
