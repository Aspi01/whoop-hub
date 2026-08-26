/**
 * OpenAI Food Service Adapter
 * Delegates to the unified image-first Food Vision pipeline (foodVisionService.js).
 */
import {
  analyzeFoodImagePipeline,
  calculateCalibratedConfidence,
  normalizeFoodAnalysisResult,
  getOpenAIApiKey
} from './foodVisionService.js';

export {
  calculateCalibratedConfidence,
  normalizeFoodAnalysisResult,
  getOpenAIApiKey
};

export async function analyzeFoodWithOpenAI({
  imageBase64 = null,
  mimeType = 'image/jpeg',
  userContext = '',
  locale = 'ru'
}) {
  return analyzeFoodImagePipeline({
    imageBase64,
    mimeType,
    userContext,
    locale
  });
}
