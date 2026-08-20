import express from 'express';
import { query, getOne, run } from '../db.js';
import { handleCoachQuestion } from '../ai/coachAgent.js';
import { getTodayStatus } from '../ai/tools/health.js';
import { getTodayNutrition } from '../ai/tools/nutrition.js';

const router = express.Router();

// 💬 История сообщений чата (последние 50 сообщений)
router.get('/messages', async (req, res) => {
  try {
    const messages = await query(`
      SELECT * FROM (
        SELECT * FROM chat_messages 
        ORDER BY id DESC LIMIT 50
      ) ORDER BY id ASC
    `);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🧠 Задать вопрос персональному Scoped Health & Performance Agent
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, error: 'Текст вопроса обязателен' });
    }

    const cleanQuestion = String(question).trim();

    // 1. Сохраняем вопрос пользователя в БД
    await run(`
      INSERT INTO chat_messages (sender, message)
      VALUES ('user', ?)
    `, [cleanQuestion]);

    // 2. Обработка через Scoped Agent (Router -> Selective Context -> Domain Model)
    const agentResult = await handleCoachQuestion({ question: cleanQuestion });

    // 3. Сохраняем ответ ассистента в БД
    await run(`
      INSERT INTO chat_messages (sender, message)
      VALUES ('ai', ?)
    `, [agentResult.answer]);

    // 4. Получаем обновленную историю сообщений
    const updatedMessages = await query(`
      SELECT * FROM (
        SELECT * FROM chat_messages 
        ORDER BY id DESC LIMIT 50
      ) ORDER BY id ASC
    `);

    res.json({
      success: true,
      answer: agentResult.answer,
      intent: agentResult.intent,
      contextTags: agentResult.contextTags,
      metrics: agentResult.metrics,
      messages: updatedMessages
    });
  } catch (error) {
    console.error('Coach route error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 Получить проактивные инсайты (общий движок с чатом)
router.get('/insights', async (req, res) => {
  try {
    const healthStatus = await getTodayStatus();
    const nutritionStatus = await getTodayNutrition();

    res.json({
      success: true,
      healthStatus,
      nutritionStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
