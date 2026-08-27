export const MAX_MEAL_IMAGES = 4;

const normalizedName = (item) => String(item?.name || '').trim().toLocaleLowerCase();

export function validateMealImageCount(images = []) {
  return Array.isArray(images) && images.length > 0 && images.length <= MAX_MEAL_IMAGES;
}

/**
 * A recoverable retry may reference evidence that was persisted by the first
 * failed attempt. It must never append that same evidence again.
 */
export function resolveRevisionEvidence({ storedImages = [], newImages = [], retryPersistedEvidence = false } = {}) {
  if (!newImages.length && !retryPersistedEvidence) {
    return { accepted: false, images: storedImages };
  }
  const images = newImages.length ? [...storedImages, ...newImages] : [...storedImages];
  return { accepted: validateMealImageCount(images), images };
}

/**
 * Adds safe revision metadata after the vision response has passed the
 * canonical food schema. The model still determines the meal composition;
 * this only makes the revision auditable in the product UI and persistence.
 */
export function decorateMultiPhotoRevision(analysis, {
  imageCount,
  previousAnalysis = null
} = {}) {
  const previousItems = previousAnalysis?.items || previousAnalysis?.components || [];
  const previousNames = new Set(previousItems.map(normalizedName).filter(Boolean));
  const items = (analysis.items || []).map((item) => {
    const newlyRevealed = previousNames.size > 0 && !previousNames.has(normalizedName(item));
    return {
      ...item,
      evidence_images: Array.from({ length: imageCount }, (_, index) => `image_${index + 1}`),
      newly_revealed: newlyRevealed,
      corrected_from: null
    };
  });

  const added = items.filter((item) => item.newly_revealed).map((item) => item.name);
  const unchanged = items.filter((item) => !item.newly_revealed).map((item) => item.name);
  const summary = added.length
    ? `Добавлено: ${added.join(', ')}${unchanged.length ? `. Без изменений: ${unchanged.join(', ')}` : ''}`
    : 'Состав уточнён по дополнительным фото без двойного учёта.';

  return {
    ...analysis,
    items,
    components: items,
    visible_items_count: items.length,
    revision_summary: summary
  };
}

export function requiresMealClarification(relationship) {
  return relationship?.same_meal === false;
}
