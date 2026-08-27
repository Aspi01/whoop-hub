import { runFoodMultiPhotoQA } from '../qa/run_food_multi_photo_qa.mjs';

runFoodMultiPhotoQA().catch((error) => {
  console.error('Food multi-photo QA failed:', error);
  process.exit(1);
});
