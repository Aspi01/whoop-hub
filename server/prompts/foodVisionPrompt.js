/**
 * Food Vision System Prompts and Structured Output Schemas
 * Implements Image-First Recognition, Multi-Item Visual Detection,
 * Contradiction Verification, and Calibrated Confidence.
 */

export const FOOD_VISION_SYSTEM_PROMPT = `
You are an expert food vision recognition and nutritional intelligence engine.

# PRIMARY INVARIANT: THE IMAGE IS THE PRIMARY SOURCE OF TRUTH
Your primary task is to recognize what is VISIBLY PRESENT in the image.
- User comments may provide disambiguation (e.g., "this has oat milk", "coke zero"), but must NEVER override visible food items unless explicitly phrased as a correction.
- Never assume ingredients from generic recipes if they are not visible or typical for the dish.
- Never use prior conversation history or stale context from earlier meals.
- Each image must be analyzed completely independently.

# 6-STEP RECOGNITION SEQUENCE:

## STEP 1 — IDENTIFY VISIBLE FOOD OBJECTS
Look at the whole photo. Determine if food/drink is present.
If no food is present (empty room, face, document, screenshot without food), return is_food: false with not_food_reason.

## STEP 2 — GROUP INTO DISTINCT DISHES / ITEMS (MULTI-ITEM DETECTION)
Count and segment each visually distinct food item or dish region on the plate/table.
For each visible item:
1. Provide a clear, practical name (e.g., "Pizza with salami - 1 slice", "Beef with mushroom cream sauce", "Greek salad").
2. State the category (e.g., "pizza", "meat", "sauce", "vegetables", "grain", "snack", "drink", "unknown").
3. Describe the VISUAL EVIDENCE (colors, textures, crust, shape, toppings) that prove this item is present.
4. If a food item is ambiguous or unclear, use broad descriptive labels (e.g., "unknown meat in gravy", "unidentified white sauce") instead of guessing a specific dish. UNKNOWN IS ALWAYS BETTER THAN A HALLUCINATED SPECIFIC INGREDIENT.

## STEP 3 — CONSERVATIVE PORTION ESTIMATION (RANGES)
Estimate the portion size in grams using visual geometry:
- Reference scale: standard dinner plate (24-27 cm), bowl (300-400 ml), mug/glass (250 ml), utensils, or human hand.
- Return conservative ranges: min, best, and max grams. Never provide false precision (e.g. return 120-170 g, not 143 g).

## STEP 4 — MACRO & CALORIE RANGE ESTIMATION
Calculate realistic calories and macros (protein, fat, carbs, fiber) for each item based on its portion and visible composition.
- Account for visible or typical cooking fats (oils, butter, creamy sauces).
- Provide calorie ranges: min, best, and max for each item and for the entire meal.
- Total calories should be realistic for the full visible meal.

## STEP 5 — CALIBRATE CONFIDENCE
Assign an honest confidence score (0.0 to 1.0) to each item and to the meal:
- High (0.85 - 1.0): Clearly visible, unmistakable food identity.
- Medium (0.60 - 0.84): Likely category, but exact subtype, sauce, or portion is somewhat uncertain.
- Low (0.0 - 0.59): Ambiguous visual inference, heavily obscured, or low lighting.
- If any major item (>=25% of the meal) has low or medium confidence, the overall meal confidence CANNOT be "high".

## STEP 6 — SELF-VERIFICATION & CONTRADICTION CHECK
Before returning, verify:
- Does every identified item have clear visual evidence in the photo?
- Did you avoid fabricating invisible micro-ingredients (like raw yeast, flour, water)?
- Did you avoid hallucinating random breakfast items (oatmeal, poached egg) when looking at dinner foods (pizza, steak)?
`;

export const FOOD_CONTRADICTION_VERIFIER_PROMPT = `
You are a strict Food Vision Quality Assurance and Contradiction Verifier.

Your task is to verify whether a proposed candidate meal analysis PLAUSIBLY MATCHES the provided food image.

### CRITICAL CONTRADICTION RULES:
1. SEMANTIC MISMATCH: If the candidate analysis lists foods that are completely contrary to visible geometry and appearance (e.g., candidate says "oatmeal with poached egg" when the image visibly shows "pizza slices and meat"), flag as CONTRADICTION.
2. MISSING MAJOR DISHES: If major visible items on the plate (e.g., pizza, steak, pasta) are omitted from candidate items, flag as CONTRADICTION.
3. FABRICATED INGREDIENTS: If the candidate invents dishes with no visual basis, flag as CONTRADICTION.
4. PLAUSIBLE MATCH: Minor seasoning or sauce uncertainty is ACCEPTABLE. If the primary dishes broadly match visual reality, mark as MATCH.

Return a strict JSON response:
{
  "verdict": "MATCH" | "CONTRADICTION",
  "confidence": 0.0 - 1.0,
  "mismatches": ["description of any contradiction"],
  "corrected_visible_items": ["list of what is actually visible if contradiction found"]
}
`;

export const FOOD_VISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_food: {
      type: "boolean",
      description: "True if food or beverage is visible in the image, false otherwise."
    },
    not_food_reason: {
      type: ["string", "null"],
      description: "Explanation if no food is detected in the image."
    },
    meal_name: {
      type: "string",
      description: "High-level descriptive title of the meal (e.g. 'Pizza & Meat with Cream Sauce' or 'Пицца и мясо под грибным соусом')."
    },
    visible_items_count: {
      type: "integer",
      description: "Total number of visually distinct food items or dish regions detected."
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Practical name of the food item or dish (e.g. 'Pizza with salami - 1 slice')."
          },
          category: {
            type: "string",
            description: "Broad food category: pizza, meat, poultry, seafood, grain, pasta, salad, vegetable, sauce, dessert, beverage, unknown."
          },
          visual_evidence: {
            type: "string",
            description: "Direct visual cues supporting this detection (e.g. 'triangular baked dough slice with melted cheese and red pepperoni discs')."
          },
          estimated_grams: {
            type: "object",
            properties: {
              min: { type: "integer", description: "Conservative lower weight bound in grams." },
              best: { type: "integer", description: "Best estimate weight in grams." },
              max: { type: "integer", description: "Conservative upper weight bound in grams." }
            },
            required: ["min", "best", "max"],
            additionalProperties: false
          },
          estimated_kcal: {
            type: "object",
            properties: {
              min: { type: "integer", description: "Lower calorie bound." },
              best: { type: "integer", description: "Best calorie estimate." },
              max: { type: "integer", description: "Upper calorie bound." }
            },
            required: ["min", "best", "max"],
            additionalProperties: false
          },
          protein_g: { type: "number", description: "Estimated protein in grams." },
          fat_g: { type: "number", description: "Estimated fat in grams." },
          carbs_g: { type: "number", description: "Estimated carbohydrates in grams." },
          fiber_g: { type: "number", description: "Estimated dietary fiber in grams." },
          confidence: {
            type: "number",
            description: "Item-level visual recognition confidence score from 0.0 to 1.0."
          },
          source: {
            type: "string",
            enum: ["vision", "user+vision", "user"],
            description: "Origin of detection."
          }
        },
        required: [
          "name",
          "category",
          "visual_evidence",
          "estimated_grams",
          "estimated_kcal",
          "protein_g",
          "fat_g",
          "carbs_g",
          "fiber_g",
          "confidence",
          "source"
        ],
        additionalProperties: false
      },
      description: "List of all distinct visible items on the plate."
    },
    total_kcal: {
      type: "object",
      properties: {
        min: { type: "integer", description: "Minimum total meal calories." },
        best: { type: "integer", description: "Best estimate total meal calories." },
        max: { type: "integer", description: "Maximum total meal calories." }
      },
      required: ["min", "best", "max"],
      additionalProperties: false
    },
    macros: {
      type: "object",
      properties: {
        protein_g: { type: "number", description: "Total protein in grams." },
        fat_g: { type: "number", description: "Total fat in grams." },
        carbs_g: { type: "number", description: "Total carbohydrates in grams." },
        fiber_g: { type: "number", description: "Total dietary fiber in grams." }
      },
      required: ["protein_g", "fat_g", "carbs_g", "fiber_g"],
      additionalProperties: false
    },
    confidence: {
      type: "object",
      properties: {
        score: { type: "number", description: "Aggregate calibrated confidence between 0.0 and 1.0." },
        level: { type: "string", enum: ["low", "medium", "high"], description: "Calibrated confidence level." }
      },
      required: ["score", "level"],
      additionalProperties: false
    },
    uncertainties: {
      type: "array",
      items: { type: "string" },
      description: "Specific visible uncertainties (e.g. 'Hidden cooking oil amount', 'Exact meat cut under sauce')."
    },
    clarifying_question: {
      type: ["string", "null"],
      description: "Optional single high-value question to disambiguate the meal if confidence is low/medium."
    }
  },
  required: [
    "is_food",
    "not_food_reason",
    "meal_name",
    "visible_items_count",
    "items",
    "total_kcal",
    "macros",
    "confidence",
    "uncertainties",
    "clarifying_question"
  ],
  additionalProperties: false
};
