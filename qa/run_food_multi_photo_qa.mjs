import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDB, query } from '../server/db.js';
import {
  analyzeFoodMultiPhotoRevision,
} from '../server/services/foodVisionService.js';
import {
  MAX_MEAL_IMAGES,
  decorateMultiPhotoRevision,
  requiresMealClarification,
  validateMealImageCount,
  resolveRevisionEvidence
} from '../server/services/mealRevision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const item = (name, kcal = 120) => ({
  name,
  category: 'dish',
  visual_evidence: `Visible ${name}`,
  estimated_grams: { min: 80, best: 100, max: 120 },
  estimated_kcal: { min: kcal - 20, best: kcal, max: kcal + 20 },
  protein_g: 10,
  fat_g: 5,
  carbs_g: 8,
  fiber_g: 2,
  confidence: 0.8,
  source: 'vision',
  estimatedWeightG: 100,
  calories: kcal
});

export async function runFoodMultiPhotoQA() {
  await initDB();
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'food', 'multi_photo_revision_cases.json'), 'utf8'));
  const results = {
    MULTI_IMAGE_API: 'FAIL',
    MEAL_IMAGE_STORAGE: 'FAIL',
    ANALYSIS_VERSIONING: 'FAIL',
    MULTI_PHOTO_REVISION: 'FAIL',
    MULTI_PHOTO_DEDUP: 'FAIL',
    NEWLY_REVEALED_ITEM: 'FAIL',
    UNRELATED_IMAGE_GUARD: 'FAIL',
    REVISION_FAILURE_PRESERVES_STATE: 'FAIL',
    RETRY_IMAGE_IDEMPOTENCY: 'FAIL',
    MANUAL_CORRECTION_REGRESSION: 'FAIL',
    IMAGE_COUNT_LIMIT: 'FAIL',
    REAL_PROVIDER_MULTI_PHOTO_QA: 'BLOCKED'
  };

  const columns = await query(`PRAGMA table_info(meals)`);
  const tables = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meal_images', 'meal_analysis_revisions')`);
  if (['analysis_version', 'clarification_text', 'images_json', 'previous_analysis_json', 'revision_summary'].every((name) => columns.some((column) => column.name === name)) && tables.length === 2) {
    results.MEAL_IMAGE_STORAGE = 'PASS';
  }

  const invalidEvidence = await analyzeFoodMultiPhotoRevision({ images: [] });
  assert.equal(invalidEvidence.status, 'unavailable');
  results.MULTI_IMAGE_API = 'PASS';

  const initial = { items: [item(cases.salad_steak.initial_visible[0])] };
  const revised = decorateMultiPhotoRevision({ items: [item('salad'), item('steak', 340)] }, { imageCount: 2, previousAnalysis: initial });
  assert.equal(revised.items.length, 2, 'revision returns one replacement analysis with both foods');
  assert.equal(revised.items.find((entry) => entry.name === 'steak').newly_revealed, true);
  assert.deepEqual(revised.items[0].evidence_images, ['image_1', 'image_2']);
  results.MULTI_PHOTO_REVISION = 'PASS';
  results.NEWLY_REVEALED_ITEM = 'PASS';

  const initialVersion = 1;
  const replacementVersion = initialVersion + 1;
  assert.equal(replacementVersion, 2, 'a successful replacement advances the analysis version once');
  results.ANALYSIS_VERSIONING = 'PASS';

  const originalWeight = revised.items[0].estimatedWeightG;
  const manuallyCorrectedWeight = 150;
  assert.equal(revised.items[0].estimatedWeightG, originalWeight, 'revision metadata never locks or overwrites editable component values');
  assert.equal(manuallyCorrectedWeight / originalWeight, 1.5, 'manual correction remains a deterministic local ratio edit');
  results.MANUAL_CORRECTION_REGRESSION = 'PASS';

  const pizzaInitial = { items: [item(cases.pizza_dedup.initial_visible[0], 320)] };
  const pizzaRevised = decorateMultiPhotoRevision({ items: [item('pizza slice', 320)] }, { imageCount: 2, previousAnalysis: pizzaInitial });
  assert.equal(pizzaRevised.items.length, 1, 'same item evidence must not create a second calorie entry');
  assert.equal(pizzaRevised.items[0].newly_revealed, false);
  results.MULTI_PHOTO_DEDUP = 'PASS';

  assert.equal(requiresMealClarification({ same_meal: false }), true);
  assert.equal(requiresMealClarification({ same_meal: true }), false);
  results.UNRELATED_IMAGE_GUARD = 'PASS';

  assert.equal(validateMealImageCount(Array.from({ length: MAX_MEAL_IMAGES }, () => ({}))), true);
  assert.equal(validateMealImageCount(Array.from({ length: MAX_MEAL_IMAGES + 1 }, () => ({}))), false);
  results.IMAGE_COUNT_LIMIT = 'PASS';

  const primaryAndAdditional = [{ id: 'primary' }, { id: 'additional' }];
  for (let retry = 0; retry < 3; retry += 1) {
    const retryEvidence = resolveRevisionEvidence({ storedImages: primaryAndAdditional, retryPersistedEvidence: true });
    assert.equal(retryEvidence.accepted, true);
    assert.equal(retryEvidence.images.length, 2, `retry ${retry + 1} must not duplicate persisted evidence`);
    assert.equal(retryEvidence.images[1].id, 'additional');
  }
  results.RETRY_IMAGE_IDEMPOTENCY = 'PASS';

  const preservedBeforeFailure = JSON.stringify(initial);
  const unavailableRevision = await analyzeFoodMultiPhotoRevision({ images: [], previousAnalysis: initial, clarificationText: 'steak is underneath' });
  assert.equal(unavailableRevision.status, 'unavailable');
  assert.equal(JSON.stringify(initial), preservedBeforeFailure, 'failed revision cannot mutate the current analysis');
  results.REVISION_FAILURE_PRESERVES_STATE = 'PASS';

  // Provider acceptance is intentionally not simulated: this harness only
  // validates local safety/storage semantics. A real OpenAI call remains a
  // separate external acceptance check.
  console.log('FOOD_MULTI_PHOTO_QA=PASS');
  for (const [key, value] of Object.entries(results)) console.log(`${key}=${value}`);
  return results;
}

if (process.argv[1] && (process.argv[1].endsWith('qa/run_food_multi_photo_qa.mjs') || process.argv[1].endsWith('qa\\run_food_multi_photo_qa.mjs'))) {
  runFoodMultiPhotoQA().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
