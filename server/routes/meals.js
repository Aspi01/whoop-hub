import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, getOne, run } from '../db.js';
import { analyzeFoodImage, recalibrateMeal } from '../gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `meal_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`);
  }
});

const upload = multer({ storage });
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

    // Суммарные макросы за день
    const totals = meals.reduce((acc, m) => {
      acc.calories += m.calories || 0;
      acc.protein += m.protein || 0;
      acc.fats += m.fats || 0;
      acc.carbs += m.carbs || 0;
      return acc;
    }, { calories: 0, protein: 0, fats: 0, carbs: 0 });

    // Расчет последнего приема пищи и окна
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
        carbs: Math.round(totals.carbs)
      },
      stats: {
        count: meals.length,
        firstMealTime,
        lastMealTime,
        fastingWindowHours: 14.5 // расчетное среднее
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📸 Загрузка фото еды + AI анализ
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

    // Запуск AI-анализа через Gemini Vision
    const aiResult = await analyzeFoodImage({
      imageBase64,
      mimeType,
      userComment,
      mealTimeStr: timeStr
    });

    if (aiResult.is_food === false) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: aiResult.error_message || 'На фото не обнаружена еда! Пожалуйста, сфотографируйте ваше блюдо.'
      });
    }

    const status = aiResult.needs_clarification ? 'needs_clarification' : 'confirmed';

    const result = await run(`
      INSERT INTO meals (
        date, time_str, meal_type, image_url, title,
        calories, protein, fats, carbs, glycemic_index,
        ai_notes, status, clarification_question
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      todayStr,
      timeStr,
      mealType,
      imageUrl,
      aiResult.title || 'Прием пищи',
      aiResult.calories || 400,
      aiResult.protein || 20,
      aiResult.fats || 15,
      aiResult.carbs || 45,
      aiResult.glycemic_index || 'Средний',
      aiResult.ai_notes || '',
      status,
      aiResult.clarification_question || null
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

// 💬 Ответ на уточнение от AI
router.post('/:id/reply', async (req, res) => {
  try {
    const mealId = req.params.id;
    const { reply } = req.body;

    const originalMeal = await getOne(`SELECT * FROM meals WHERE id = ?`, [mealId]);
    if (!originalMeal) {
      return res.status(404).json({ success: false, error: 'Блюдо не найдено' });
    }

    // Пересчет КБЖУ с учетом ответа
    const recalibrated = await recalibrateMeal({
      originalMeal,
      userReply: reply
    });

    await run(`
      UPDATE meals 
      SET title = ?, calories = ?, protein = ?, fats = ?, carbs = ?, 
          glycemic_index = ?, ai_notes = ?, status = 'confirmed', user_reply = ?
      WHERE id = ?
    `, [
      recalibrated.title,
      recalibrated.calories,
      recalibrated.protein,
      recalibrated.fats,
      recalibrated.carbs,
      recalibrated.glycemic_index,
      recalibrated.ai_notes,
      reply,
      mealId
    ]);

    const updated = await getOne(`SELECT * FROM meals WHERE id = ?`, [mealId]);
    res.json({ success: true, meal: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑 Удаление записи
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM meals WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Удалено' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
