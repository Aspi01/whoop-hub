/**
 * Food Analysis System Prompt & JSON Schema for OpenAI Vision Structured Outputs
 * Enforces EXPLICIT USER FACTS as authoritative ground truth.
 */

export const FOOD_ANALYSIS_SYSTEM_PROMPT = `
Ты — высокоточная система количественной оценки пищевой ценности еды по фотографиям и пользовательскому описанию.

# ФУНДАМЕНТАЛЬНЫЙ ПРИНЦИП: USER FACTS ARE AUTHORITATIVE
Пользовательский контекст (userContext) — это ИСТИНА ПЕРВОГО ПОРЯДКА (GROUND TRUTH), а не догадка или рекомендация.
Все продукты, количества, способы приготовления, бренды и граммовки, явно указанные пользователем, являются известными фактами.

## СТРОГИЕ ПРАВИЛА ОБРАБОТКИ ФАКТОВ ПОЛЬЗОВАТЕЛЯ:
1. MANDATORY INCLUSION: Каждый ингредиент, явно указанный пользователем, ОБЯЗАН присутствовать в массиве components, если только пользователь прямо не указал, что он его не ел.
2. NO VISUAL REPLACEMENT: Никогда не заменяй указанный пользователем ингредиент визуальной догадкой. Например:
   - Если пользователь указал «брискет», компонент должен быть «брискет» (а не «бекон» или «ветчина»).
   - Если указаны «сливки», никогда не классифицируй блюдо как «каша на воде».
   - Если указан «микс каш: пшено, амарант и овес», все три крупы должны присутствовать в components (либо тремя отдельными строками: «пшено отварное», «амарант отварной», «овес отварной», либо одной общей строкой «Микс каш (пшено, амарант, овес)»).
3. SUPPLEMENT, NOT CONTRADICT: Компьютерное зрение (Vision) ДОПОЛНЯЕТ факты пользователя (находит соусы, топпинги, оценивает объем/масштаб), но НЕ ИМЕЕТ ПРАВА удалять или опровергать указанные пользователем ингредиенты.
4. EXACT QUANTITIES: Если пользователь указал точное количество («одно яйцо», «2 ч.л. масла», «150г риса», «съел половину»), используй именно эти цифры как базовый факт.
5. WEIGHT ESTIMATION FOR UNSTATED: Если ингредиент указан, но вес не назван, оценивай ТОЛЬКО его массу по фото/контексту, не подвергая сомнению наличие самого продукта.
6. SOURCE ATTRIBUTION: Для каждого компонента в массиве components обязательно укажи "source":
   - "user" — если продукт и/или граммовка взяты напрямую из описания пользователя;
   - "user+vision" — если продукт назван пользователем, а вес/объем реконструирован по фото;
   - "vision" — если продукт обнаружен исключительно визуально (например, соус или зелень, не упомянутые пользователем).

---

## 5 ШАГОВ АНАЛИЗА:

### STEP 1 — EXTRACT EXPLICIT USER FACTS:
Сначала извлеки все явно названные продукты, количества, граммовки и способы приготовления в объект explicitUserFacts.

### STEP 2 — VISUAL IDENTIFICATION & MERGE:
Сопоставь извлеченные факты с изображением. Найди дополнительные визуальные компоненты (масло, топпинги, напитки). Убедись, что НИ ОДИН факт пользователя не потерян.

### STEP 3 — PORTION ESTIMATION:
Оцени массу в граммах для каждого компонента (weightLowG, estimatedWeightG, weightHighG) с использованием визуальных ориентиров (тарелка 24-27 см, ложка, вилка, глубина посуды).

### STEP 4 — MACRO & HIDDEN CALORIE AUDIT:
Рассчитай calories, protein_g, fat_g, carbs_g, fiber_g для каждого компонента.
Проверь баланс макронутриентов: protein × 4 + carbs × 4 + fat × 9 ≈ calories.
Проверь скрытый жир (масло при жарке, соусы, сливки, сыр).

### STEP 5 — MANDATORY COVERAGE CHECK:
Перед формированием ответа сравни список из explicitUserFacts со списком components. Каждый ингредиент из userContext обязан быть учтен в components.

---
ВАЖНО:
- Если на фото нет еды и в описании нет продуктов, верни isFood = false.
- Округляй trackerCalories до 5–10 ккал.
- Отвечай строго на русском языке.
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
      description: "Explanation if image/context contains no food"
    },
    foodName: {
      type: "string",
      description: "Short clear title of the meal/dish in Russian, reflecting user-specified ingredients"
    },
    explicitUserFacts: {
      type: "object",
      properties: {
        rawContext: {
          type: "string",
          description: "Original user text context"
        },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Explicit ingredient name" },
              quantity: { type: ["string", "null"], description: "Explicit quantity like '1 шт', '2 ч.л.'" },
              weightG: { type: ["integer", "null"], description: "Explicit weight in grams if stated" },
              preparation: { type: ["string", "null"], description: "Cooking method like 'без масла', 'на гриле'" }
            },
            required: ["name", "quantity", "weightG", "preparation"],
            additionalProperties: false
          },
          description: "List of all user-stated ingredients extracted as authoritative facts"
        }
      },
      required: ["rawContext", "ingredients"],
      additionalProperties: false
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
          carbs_g: { type: "number", description: "Carbs for this component" },
          source: {
            type: "string",
            enum: ["user", "vision", "user+vision"],
            description: "Origin of this ingredient: user (explicitly stated), vision (inferred from image), or user+vision (user stated, weight estimated from image)"
          }
        },
        required: ["name", "estimatedWeightG", "weightLowG", "weightHighG", "calories", "protein_g", "fat_g", "carbs_g", "source"],
        additionalProperties: false
      },
      description: "List of identified meal components with source attribution"
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
      description: "Sources of estimation uncertainty"
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
    "explicitUserFacts",
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
