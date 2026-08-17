import express from 'express';
import { query, getOne, run } from '../db.js';
import { askAiCoach } from '../gemini.js';

const router = express.Router();

// 💬 История сообщений чата
router.get('/messages', async (req, res) => {
  try {
    const messages = await query(`
      SELECT * FROM chat_messages 
      ORDER BY id ASC LIMIT 50
    `);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🧠 Задать вопрос всезнающему AI Коучу
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'Текст вопроса обязателен' });
    }

    // 1. Сохраняем вопрос пользователя
    await run(`
      INSERT INTO chat_messages (sender, message)
      VALUES ('user', ?)
    `, [question]);

    // 2. Собираем глубокий контекст из ВСЕХ таблиц
    const recentMetrics = await query(`
      SELECT * FROM whoop_metrics 
      ORDER BY date DESC LIMIT 7
    `);

    const recentMeals = await query(`
      SELECT * FROM meals 
      ORDER BY id DESC LIMIT 10
    `);

    const recentWorkouts = await query(`
      SELECT * FROM workouts 
      ORDER BY id DESC LIMIT 5
    `);

    const recentJournal = await query(`
      SELECT * FROM journal_entries 
      ORDER BY date DESC LIMIT 7
    `);

    const contextData = {
      latestMetrics: recentMetrics[0] || null,
      metricsHistory7d: recentMetrics,
      recentMeals: recentMeals.map(m => ({
        date: m.date,
        time: m.time_str,
        type: m.meal_type,
        title: m.title,
        calories: m.calories,
        protein: m.protein,
        fats: m.fats,
        carbs: m.carbs
      })),
      recentWorkouts: recentWorkouts.map(w => ({
        date: w.date,
        title: w.title,
        strain: w.strain,
        fatigueRpe: w.fatigue_rpe,
        exercises: w.exercises_json ? JSON.parse(w.exercises_json) : []
      })),
      recentJournal
    };

    // 3. Вызываем AI генерацию ответа с учетом всех связей
    const aiAnswer = await askAiCoach({
      question,
      contextData
    });

    // 4. Сохраняем ответ AI
    await run(`
      INSERT INTO chat_messages (sender, message)
      VALUES ('ai', ?)
    `, [aiAnswer]);

    const allMessages = await query(`SELECT * FROM chat_messages ORDER BY id ASC LIMIT 50`);

    res.json({
      success: true,
      answer: aiAnswer,
      messages: allMessages
    });
  } catch (error) {
    console.error('Ошибка в AI Коуче:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💡 Быстрые пресет-инсайты (паттерны)
router.get('/insights', async (req, res) => {
  try {
    const insights = [
      {
        id: 1,
        type: 'warning',
        title: 'Поздний ужин & Глубокий сон',
        description: 'Прием пищи после 21:30 сокращает фазу глубокого сна (SWS) на 32% и повышает ночной пульс на 6 уд/мин.',
        action: 'Поужинать сегодня до 20:00'
      },
      {
        id: 2,
        type: 'success',
        title: 'Суперсила: Сауна + Магний',
        description: 'В дни с сауной и приемом магния на ночь твой Recovery стабильно держится в районе 90–94%.',
        action: 'Рекомендуется перед тяжелыми днями'
      },
      {
        id: 3,
        type: 'info',
        title: 'Готовность к силовым',
        description: 'Сегодня Recovery 78% и низкий уровень утомляемости. Оптимальный день для прогрессии рабочих весов.',
        action: 'Запланировать силовую тренировку'
      }
    ];

    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
