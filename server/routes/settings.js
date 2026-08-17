import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

// ⚙️ Получить настройки
router.get('/', async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM app_settings`);
    const settings = {};
    rows.forEach(r => {
      // Маскируем API ключ для безопасности UI
      if (r.key === 'gemini_api_key' && r.value) {
        settings[r.key] = r.value.slice(0, 6) + '...' + r.value.slice(-4);
      } else {
        settings[r.key] = r.value;
      }
    });

    res.json({
      success: true,
      settings,
      hasGeminiKey: !!(rows.find(r => r.key === 'gemini_api_key')?.value || process.env.GEMINI_API_KEY)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💾 Сохранить настройки
router.post('/', async (req, res) => {
  try {
    const { gemini_api_key, whoop_client_id, whoop_client_secret } = req.body;

    if (gemini_api_key !== undefined) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [gemini_api_key]);
    }

    if (whoop_client_id !== undefined) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('whoop_client_id', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [whoop_client_id]);
    }

    if (whoop_client_secret !== undefined) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('whoop_client_secret', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [whoop_client_secret]);
    }

    res.json({ success: true, message: 'Настройки успешно сохранены!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
