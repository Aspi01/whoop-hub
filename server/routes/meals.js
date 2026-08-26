import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, getOne, run, UPLOADS_DIR } from '../db.js';
import { analyzeFoodImagePipeline } from '../services/foodVisionService.js';
import { analyzeFoodWithOpenAI } from '../services/openaiFoodService.js';

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
router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const userComment = req.body.comment || req.body.userContext || '';
    const locale = req.body.locale || 'ru';

    let imageUrl = null;
    let imageBase64 = null;
    let mimeType = 'image/jpeg';

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
      const fileBuffer = fs.readFileSync(req.file.path);
      imageBase64 = fileBuffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    }

    // Call OpenAI Structured Outputs Food Analysis
    const analysis = await analyzeFoodWithOpenAI({
      imageBase64,
      mimeType,
      userContext: userComment,
      locale
    });

    if (analysis.isFood === false) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({
        success: false,
        error: analysis.notFoodReason || 'На фотографии не обнаружена еда. Пожалуйста, сделайте четкий снимок блюда.'
      });
    }

    res.json({
      success: true,
      analysis,
      imageUrl,
      userComment
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
      clarification_question = null
    } = req.body;

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

    const createdMeal = await getOne(`SELECT * FROM meals WHERE id = ?`, [result.id]);

    res.json({
      success: true,
      meal: createdMeal,
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

// 🗑 Удаление записи
router.delete('/:id', async (req, res) => {
  try {
    const meal = await getOne(`SELECT image_url FROM meals WHERE id = ?`, [req.params.id]);
    if (meal?.image_url) {
      const filename = path.basename(meal.image_url);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn('Ошибка удаления файла изображения:', unlinkErr.message);
        }
      }
    }

    await run(`DELETE FROM meals WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Удалено' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
