import { runFoodMultiPhotoUXQA } from '../qa/run_food_multi_photo_ux_qa.mjs';

runFoodMultiPhotoUXQA().catch((error) => {
  console.error('Food Multi-Photo UX QA failed:', error);
  process.exit(1);
});
