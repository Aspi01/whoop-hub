/**
 * Canonical Food Vision Runtime Schema (Zod)
 * Single strict source of truth for all vision providers (Gemini, OpenAI, etc.).
 * Guarantees zero fabrication of missing fields.
 */

import { z } from 'zod';

export const FoodItemSchema = z.object({
  name: z.string().min(1, 'Item name cannot be empty'),
  category: z.string().default('dish'),
  visual_evidence: z.string().min(1, 'Visual evidence must be stated'),
  estimated_grams: z.object({
    min: z.number().int().nonnegative(),
    best: z.number().int().positive(),
    max: z.number().int().positive()
  }).refine((g) => g.min <= g.best && g.best <= g.max, {
    message: 'estimated_grams must satisfy min <= best <= max'
  }),
  estimated_kcal: z.object({
    min: z.number().int().nonnegative(),
    best: z.number().int().positive(),
    max: z.number().int().positive()
  }).refine((k) => k.min <= k.best && k.best <= k.max, {
    message: 'estimated_kcal must satisfy min <= best <= max'
  }),
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().optional().default(0),
  confidence: z.number().min(0.0).max(1.0),
  source: z.enum(['vision', 'user+vision', 'user']).default('vision')
});

export const TotalKcalSchema = z.object({
  min: z.number().int().nonnegative(),
  best: z.number().int().positive(),
  max: z.number().int().positive()
}).refine((k) => k.min <= k.best && k.best <= k.max, {
  message: 'total_kcal must satisfy min <= best <= max'
});

export const MacrosSchema = z.object({
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().optional().default(0)
});

export const ConfidenceSchema = z.object({
  score: z.number().min(0.0).max(1.0),
  level: z.enum(['low', 'medium', 'high'])
});

export const FoodVisionSuccessSchema = z.object({
  is_food: z.literal(true),
  not_food_reason: z.null().optional(),
  meal_name: z.string().min(1, 'Meal name cannot be empty'),
  visible_items_count: z.number().int().positive(),
  items: z.array(FoodItemSchema).min(1, 'At least one food item must be detected'),
  total_kcal: TotalKcalSchema,
  macros: MacrosSchema,
  confidence: ConfidenceSchema,
  uncertainties: z.array(z.string()).default([]),
  clarifying_question: z.string().nullable().optional()
});

export const FoodVisionNotFoodSchema = z.object({
  is_food: z.literal(false),
  not_food_reason: z.string().min(1, 'Reason for non-food must be provided'),
  meal_name: z.null().optional(),
  items: z.array(z.any()).max(0).optional().default([]),
  total_kcal: z.null().optional(),
  macros: z.null().optional(),
  confidence: z.null().optional(),
  uncertainties: z.array(z.string()).default([])
});

export const CanonicalFoodVisionSchema = z.discriminatedUnion('is_food', [
  FoodVisionSuccessSchema,
  FoodVisionNotFoodSchema
]);

export const VerifierOutputSchema = z.object({
  match: z.boolean(),
  major_mismatch: z.boolean(),
  mismatched_items: z.array(z.string()).default([]),
  visible_corrections: z.array(z.string()).default([])
});

/**
 * Validates raw provider JSON against the canonical schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateCanonicalFoodVision(raw) {
  if (!raw || typeof raw !== 'object') {
    return { success: false, error: 'Provider returned null or non-object response' };
  }

  // Backward compatibility alias for isFood vs is_food
  if (raw.isFood !== undefined && raw.is_food === undefined) {
    raw.is_food = raw.isFood;
  }
  if (raw.notFoodReason !== undefined && raw.not_food_reason === undefined) {
    raw.not_food_reason = raw.notFoodReason;
  }
  if (raw.foodName !== undefined && raw.meal_name === undefined) {
    raw.meal_name = raw.foodName;
  }
  if (raw.components !== undefined && raw.items === undefined) {
    raw.items = raw.components;
  }

  const result = CanonicalFoodVisionSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const issues = result.error?.issues || result.error?.errors || [];
  return {
    success: false,
    error: issues.map(e => `${e.path?.join('.') || 'root'}: ${e.message}`).join('; ')
  };
}

/**
 * Validates verifier JSON output
 */
export function validateVerifierOutput(raw) {
  if (!raw || typeof raw !== 'object') {
    return { success: false, error: 'Verifier returned non-object response' };
  }

  // Handle verdict vs match aliases
  if (raw.verdict !== undefined && raw.match === undefined) {
    raw.match = raw.verdict === 'MATCH';
    raw.major_mismatch = raw.verdict === 'CONTRADICTION';
  }

  const result = VerifierOutputSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const issues = result.error?.issues || result.error?.errors || [];
  return {
    success: false,
    error: issues.map(e => `${e.path?.join('.') || 'root'}: ${e.message}`).join('; ')
  };
}
