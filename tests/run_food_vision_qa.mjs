/**
 * Thin test entrypoint for Food Vision QA
 */
import { runFoodVisionQA } from '../qa/run_food_vision_qa.mjs';

runFoodVisionQA().catch((err) => {
  console.error('Test entrypoint execution error:', err);
  process.exit(1);
});
