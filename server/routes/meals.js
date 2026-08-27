import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, getOne, run, UPLOADS_DIR } from '../db.js';
import { analyzeFoodMultiPhotoRevision } from '../services/foodVisionService.js';
import { analyzeFoodWithOpenAI } from '../services/openaiFoodService.js';
import { MAX_MEAL_IMAGES, validateMealImageCount, resolveRevisionEvidence } from '../services/mealRevision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `meal_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения (JPEG, PNG, WebP, HEIC)'));
    }
  }
});

const router = express.Router();

const flattenUploadedFiles = (files) => Array.isArray(files)
  ? files
  : Object.values(files || {}).flat();

const uploadedImagePayload = (file, index = 0) => ({
  id: `image_${index + 1}`,
  role: index === 0 ? 'primary' : 'additional',
  captured_at: new Date().toISOString(),
  source: 'upload',
  imageUrl: `/uploads/${file.filename}`,
  imageBase64: fs.readFileSync(file.path).toString('base64'),
  mimeType: file.mimetype || 'image/jpeg'
});

const cleanupUploadedFiles = (files) => {
  for (const file of files) {
    if (file?.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
  }
};

const storedImagePayload = (imageUrl, role, index) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(imageUrl || ''));
  if (!imageUrl || !fs.existsSync(filePath)) return null;
  return {
    id: `image_${index + 1}`,
    role,
    source: 'upload',
    imageUrl,
    imageBase64: fs.readFileSync(filePath).toString('base64'),
    mimeType: 'image/jpeg'
  };
};

const mealAnalysisSnapshot = (meal) => ({
  meal_name: meal.title,
  foodName: meal.title,
  items: JSON.parse(meal.components_json || '[]'),
  components: JSON.parse(meal.components_json || '[]'),
  total_kcal: { best: meal.calories || 0 },
  macros: { protein_g: meal.protein || 0, fat_g: meal.fats || 0, carbs_g: meal.carbs || 0, fiber_g: meal.fiber || 0 }
});

async function storeMealImages(mealId, images = []) {
  for (const image of images) {
    await run(`INSERT OR IGNORE INTO meal_images (meal_id, image_url, image_role, captured_at, source) VALUES (?, ?, ?, ?, ?)`, [
      mealId, image.imageUrl, image.role || 'additional', image.captured_at || new Date().toISOString(), image.source || 'upload'
    ]);
  }
  const rows = await query(`SELECT id, image_url, image_role, captured_at, source FROM meal_images WHERE meal_id = ? ORDER BY id ASC`, [mealId]);
  await run(`UPDATE meals SET images_json = ? WHERE id = ?`, [JSON.stringify(rows), mealId]);
  return rows;
}

const publicMealImages = (rows = []) => rows.map((row, index) => ({
  id: row.id ?? `image_${index + 1}`,
  role: row.image_role || 'additional',
  captured_at: row.captured_at,
  source: row.source || 'upload',
  imageUrl: row.image_url
}));

// Функция авто-определения типа приема пищи по времени
const getMealTypeByTime = (dateObj) => {
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes >= 300 && totalMinutes < 690) return 'Завтрак';      // 05:00 - 11:30
  if (totalMinutes >= 690 && totalMinutes < 1000) return 'Обед';       // 11:30 - 16:40
  if (totalMinutes >= 1000 && totalMinutes < 1320) return 'Ужин';      // 16:40 - 22:00
  return 'Ночной перекус';                                             // 22:00 - 05:00
};

// 🥗 Получить приемы пищи за сегодня + расчет окон питания
router.get('/', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const meals = await query(`
      SELECT * FROM meals 
      WHERE date = ? 
      ORDER BY id ASC
    `, [todayStr]);

    const totals = meals.reduce((acc, m) => {
      acc.calories += m.calories || 0;
      acc.protein += m.protein || 0;
      acc.fats += m.fats || 0;
      acc.carbs += m.carbs || 0;
      acc.fiber = (acc.fiber || 0) + (m.fiber || 0);
      return acc;
    }, { calories: 0, protein: 0, fats: 0, carbs: 0, fiber: 0 });

    let lastMealTime = null;
    let firstMealTime = null;
    if (meals.length > 0) {
      firstMealTime = meals[0].time_str;
      lastMealTime = meals[meals.length - 1].time_str;
    }

    res.json({
      success: true,
      meals,
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        fats: Math.round(totals.fats),
        carbs: Math.round(totals.carbs),
        fiber: Math.round((totals.fiber || 0) * 10) / 10
      },
      stats: {
        count: meals.length,
        firstMealTime,
        lastMealTime,
        fastingWindowHours: 14.5
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 🔍 POST /api/meals/analyze
 * Step 1: Analyzes food image with OpenAI without saving to database yet.
 * Returns structured nutrition breakdown for user preview and correction.
 */
router.post('/analyze', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: MAX_MEAL_IMAGES }]), async (req, res) => {
  try {
    const userComment = req.body.comment || req.body.userContext || '';
    const locale = req.body.locale || 'ru';
    const files = flattenUploadedFiles(req.files);
    if (files.length > MAX_MEAL_IMAGES) {
      cleanupUploadedFiles(files);
      return res.status(400).json({ success: false, error: `Можно добавить не более ${MAX_MEAL_IMAGES} фото к одному приёму пищи.` });
    }
    const images = files.map(uploadedImagePayload);
    const previousAnalysis = req.body.current_analysis ? JSON.parse(req.body.current_analysis) : null;
    const analysis = images.length > 1
      ? await analyzeFoodMultiPhotoRevision({ images, clarificationText: userComment, previousAnalysis, locale })
      : await analyzeFoodWithOpenAI({
        imageBase64: images[0]?.imageBase64 || null,
        mimeType: images[0]?.mimeType || 'image/jpeg', userContext: userComment, locale
      });

    if (analysis.isFood === false) {
      cleanupUploadedFiles(files);
      return res.status(400).json({
        success: false,
        error: analysis.notFoodReason || 'На фотографии не обнаружена еда. Пожалуйста, сделайте четкий снимок блюда.'
      });
    }

    res.json({
      success: true,
      analysis,
      imageUrl: images[0]?.imageUrl || null,
      images: images.map(({ imageBase64, mimeType, ...image }) => image),
      userComment,
      analysisVersion: previousAnalysis ? 2 : 1
    });
  } catch (error) {
    console.error('Ошибка анализа блюда:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Не удалось проанализировать фото. Попробуйте ещё раз.'
    });
  }
});

/**
 * 💾 POST /api/meals/save
 * Step 2: Saves confirmed/corrected meal to SQLite food log.
 */
router.post('/save', async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const autoMealType = getMealTypeByTime(now);

    const {
      title,
      meal_type = autoMealType,
      image_url = null,
      calories = 0,
      protein = 0,
      fats = 0,
      carbs = 0,
      fiber = 0,
      glycemic_index = 'Средний',
      ai_notes = '',
      components = [],
      confidence = null,
      clarification_question = null,
      images = [],
      clarification_text = '',
      revision_summary = '',
      analysis_version = 1
    } = req.body;

    const normalizedImages = Array.isArray(images) ? images.filter((image) => image?.imageUrl) : [];
    if (normalizedImages.length && !validateMealImageCount(normalizedImages)) {
      return res.status(400).json({ success: false, error: `Можно сохранить от 1 до ${MAX_MEAL_IMAGES} фото к одному приёму пищи.` });
    }

    const componentsJson = components ? JSON.stringify(components) : null;
    const confidenceJson = confidence ? JSON.stringify(confidence) : null;

    const result = await run(`
      INSERT INTO meals (
        date, time_str, meal_type, image_url, title,
        calories, protein, fats, carbs, fiber, glycemic_index,
      ai_notes, components_json, confidence_json, status, clarification_question
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `, [
      todayStr,
      timeStr,
      meal_type,
      image_url,
      title || 'Прием пищи',
      Math.round(calories),
      Math.round(protein * 10) / 10,
      Math.round(fats * 10) / 10,
      Math.round(carbs * 10) / 10,
      Math.round((fiber || 0) * 10) / 10,
      glycemic_index,
      ai_notes,
      componentsJson,
      confidenceJson,
      clarification_question
    ]);

    const savedImages = await storeMealImages(result.id, normalizedImages);
    await run(`UPDATE meals SET analysis_version = ?, clarification_text = ?, revision_summary = ? WHERE id = ?`, [
      Math.max(1, Number(analysis_version) || 1), clarification_text || null, revision_summary || null, result.id
    ]);
    await run(`INSERT OR IGNORE INTO meal_analysis_revisions (meal_id, analysis_version, analysis_json, clarification_text, revision_summary) VALUES (?, ?, ?, ?, ?)`, [
      result.id,
      Math.max(1, Number(analysis_version) || 1),
      JSON.stringify({ title, components, confidence, calories, protein, fats, carbs, fiber }),
      clarification_text || null,
      revision_summary || null
    ]);

    const createdMeal = await getOne(`SELECT * FROM meals WHERE id = ?`, [result.id]);

    res.json({
      success: true,
      meal: { ...createdMeal, images: publicMealImages(savedImages) },
      message: 'Прием пищи успешно сохранен в дневник!'
    });
  } catch (error) {
    console.error('Ошибка сохранения блюда:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📸 POST /api/meals/upload (Backward compatibility direct upload & save)
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const autoMealType = getMealTypeByTime(now);

    const userComment = req.body.comment || '';
    const mealType = req.body.meal_type || autoMealType;

    let imageUrl = null;
    let imageBase64 = null;
    let mimeType = 'image/jpeg';

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
      const fileBuffer = fs.readFileSync(req.file.path);
      imageBase64 = fileBuffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    }

    const aiResult = await analyzeFoodWithOpenAI({
      imageBase64,
      mimeType,
      userContext: userComment
    });

    if (aiResult.isFood === false) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({
        success: false,
        error: aiResult.notFoodReason || 'На фото не обнаружена еда! Пожалуйста, сфотографируйте ваше блюдо.'
      });
    }

    const result = await run(`
      INSERT INTO meals (
        date, time_str, meal_type, image_url, title,
        calories, protein, fats, carbs, fiber, glycemic_index,
        ai_notes, components_json, confidence_json, status, clarification_question
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `, [
      todayStr,
      timeStr,
      mealType,
      imageUrl,
      aiResult.foodName || 'Прием пищи',
      aiResult.trackerCalories || aiResult.calories?.best || 400,
      aiResult.macros?.protein_g || 20,
      aiResult.macros?.fat_g || 15,
      aiResult.macros?.carbs_g || 45,
      aiResult.macros?.fiber_g || 4,
      'Средний',
      aiResult.uncertainties?.join(', ') || '',
      JSON.stringify(aiResult.components || []),
      JSON.stringify(aiResult.confidence || {}),
      aiResult.clarifyingQuestion || null
    ]);

    const createdMeal = await getOne(`SELECT * FROM meals WHERE id = ?`, [result.id]);

    res.json({
      success: true,
      meal: createdMeal,
      message: 'Прием пищи успешно проанализирован и сохранен!'
    });
  } catch (error) {
    console.error('Ошибка добавления блюда:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Re-analyze one persisted meal with additional visual evidence. The existing
 * meal row is updated only after a complete replacement analysis succeeds.
 * Newly uploaded photos and the clarification are retained on failure so the
 * user can retry without losing valid previous nutrition data.
 */
router.post('/:id/reanalyze', upload.array('images', MAX_MEAL_IMAGES - 1), async (req, res) => {
  const uploadedFiles = req.files || [];
  let persistedImages = [];
  let clarificationText = '';
  try {
    const meal = await getOne(`SELECT * FROM meals WHERE id = ?`, [req.params.id]);
    if (!meal) {
      cleanupUploadedFiles(uploadedFiles);
      return res.status(404).json({ success: false, error: 'Приём пищи не найден.' });
    }

    const storedRows = await query(`SELECT id, image_url, image_role, captured_at, source FROM meal_images WHERE meal_id = ? ORDER BY id ASC`, [meal.id]);
    const knownRows = storedRows.length
      ? storedRows
      : (meal.image_url ? [{ image_url: meal.image_url, image_role: 'primary', captured_at: meal.created_at, source: 'upload' }] : []);
    const existingImages = knownRows
      .map((row, index) => ({ ...storedImagePayload(row.image_url, row.image_role, index), captured_at: row.captured_at, source: row.source }))
      .filter(Boolean);
    const newImages = uploadedFiles.map((file, index) => ({ ...uploadedImagePayload(file, existingImages.length + index), role: 'additional' }));
    const retryPersistedEvidence = req.body.retry_persisted_evidence === 'true';
    const forceSameMeal = req.body.force_same_meal === 'true';
    const evidence = resolveRevisionEvidence({
      storedImages: existingImages,
      newImages,
      retryPersistedEvidence
    });
    if (!evidence.accepted) {
      cleanupUploadedFiles(uploadedFiles);
      return res.status(400).json({ success: false, error: `Добавьте фото так, чтобы всего было не более ${MAX_MEAL_IMAGES}.` });
    }

    clarificationText = String(req.body.clarification_text || meal.clarification_text || '').trim();
    // Persist retry evidence before making a provider call. This does not alter
    // the valid analysis or its nutrition totals.
    const imageRows = newImages.length
      ? await storeMealImages(meal.id, storedRows.length ? newImages : [...existingImages, ...newImages])
      : storedRows;
    persistedImages = publicMealImages(imageRows);
    await run(`UPDATE meals SET clarification_text = ? WHERE id = ?`, [clarificationText || meal.clarification_text || null, meal.id]);

    const analysis = await analyzeFoodMultiPhotoRevision({
      images: evidence.images,
      clarificationText,
      previousAnalysis: mealAnalysisSnapshot(meal),
      locale: req.body.locale || 'ru',
      guardUnrelated: !forceSameMeal
    });

    if (analysis.status === 'requires_clarification') {
      return res.status(409).json({
        success: false,
        status: 'unrelated_image',
        retryable: true,
        error: analysis.message,
        persisted_images: persistedImages,
        pending_revision: { meal_id: meal.id, clarification_text: clarificationText, image_ids: persistedImages.map((image) => image.id) }
      });
    }
    if (analysis.status !== 'success') {
      return res.status(503).json({
        success: false,
        status: 'analysis_failed',
        retryable: true,
        error: 'Не удалось пересчитать приём пищи. Предыдущий анализ сохранён; фото и уточнение можно отправить повторно.',
        persisted_images: persistedImages,
        pending_revision: { meal_id: meal.id, clarification_text: clarificationText, image_ids: persistedImages.map((image) => image.id) }
      });
    }

    const nextVersion = Math.max(1, Number(meal.analysis_version) || 1) + 1;
    const previousAnalysis = mealAnalysisSnapshot(meal);
    await run(`
      UPDATE meals SET
        title = ?, calories = ?, protein = ?, fats = ?, carbs = ?, fiber = ?,
        ai_notes = ?, components_json = ?, confidence_json = ?, clarification_question = ?,
        analysis_version = ?, clarification_text = ?, previous_analysis_json = ?, revision_summary = ?
      WHERE id = ?
    `, [
      analysis.foodName || meal.title,
      Math.round(analysis.trackerCalories || analysis.total_kcal?.best || 0),
      analysis.macros?.protein_g || 0, analysis.macros?.fat_g || 0, analysis.macros?.carbs_g || 0, analysis.macros?.fiber_g || 0,
      analysis.uncertainties?.join(', ') || '', JSON.stringify(analysis.components || []), JSON.stringify(analysis.confidence || {}),
      analysis.clarifyingQuestion || null, nextVersion, clarificationText || null, JSON.stringify(previousAnalysis), analysis.revision_summary || null, meal.id
    ]);
    await run(`INSERT INTO meal_analysis_revisions (meal_id, analysis_version, analysis_json, clarification_text, revision_summary) VALUES (?, ?, ?, ?, ?)`, [
      meal.id, nextVersion, JSON.stringify(analysis), clarificationText || null, analysis.revision_summary || null
    ]);
    const revisedMeal = await getOne(`SELECT * FROM meals WHERE id = ?`, [meal.id]);
    return res.json({ success: true, meal: { ...revisedMeal, images: persistedImages }, analysis, images: persistedImages });
  } catch (error) {
    console.error('Ошибка пересчёта приёма пищи:', error);
    return res.status(500).json({
      success: false,
      status: 'analysis_failed',
      retryable: true,
      error: 'Не удалось пересчитать приём пищи. Предыдущий анализ сохранён; попробуйте ещё раз.',
      persisted_images: persistedImages,
      pending_revision: persistedImages.length ? { meal_id: req.params.id, clarification_text: clarificationText, image_ids: persistedImages.map((image) => image.id) } : null
    });
  }
});

// Detach a confirmed-unrelated additional image before the client reuses it in
// a separate-meal capture flow. Primary evidence is never removable here.
router.delete('/:id/revision-images/:imageId', async (req, res) => {
  try {
    const image = await getOne(`SELECT * FROM meal_images WHERE id = ? AND meal_id = ?`, [req.params.imageId, req.params.id]);
    if (!image || image.image_role === 'primary') {
      return res.status(404).json({ success: false, error: 'Дополнительное фото не найдено.' });
    }
    await run(`DELETE FROM meal_images WHERE id = ? AND meal_id = ?`, [image.id, req.params.id]);
    const remaining = await query(`SELECT id, image_url, image_role, captured_at, source FROM meal_images WHERE meal_id = ? ORDER BY id ASC`, [req.params.id]);
    await run(`UPDATE meals SET images_json = ? WHERE id = ?`, [JSON.stringify(remaining), req.params.id]);
    const filePath = path.join(UPLOADS_DIR, path.basename(image.image_url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.json({ success: true, images: publicMealImages(remaining) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑 Удаление записи
router.delete('/:id', async (req, res) => {
  try {
    const meal = await getOne(`SELECT image_url FROM meals WHERE id = ?`, [req.params.id]);
    const imageRows = await query(`SELECT image_url FROM meal_images WHERE meal_id = ?`, [req.params.id]);
    for (const imageUrl of new Set([meal?.image_url, ...imageRows.map((row) => row.image_url)].filter(Boolean))) {
      const filename = path.basename(imageUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn('Ошибка удаления файла изображения:', unlinkErr.message);
        }
      }
    }

    await run(`DELETE FROM meal_images WHERE meal_id = ?`, [req.params.id]);
    await run(`DELETE FROM meal_analysis_revisions WHERE meal_id = ?`, [req.params.id]);
    await run(`DELETE FROM meals WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Удалено' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
