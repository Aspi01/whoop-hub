import express from 'express';
import { query, run } from '../db.js';

const router = express.Router();
const MASKED_SECRET_SENTINEL = '••••••••';

// ⚙️ Получить настройки
router.get('/', async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM app_settings`);
    const settings = {};
    rows.forEach(r => {
      // Маскируем секреты для безопасности UI
      if ((r.key === 'gemini_api_key' || r.key === 'whoop_client_secret') && r.value) {
        settings[r.key] = MASKED_SECRET_SENTINEL;
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

    if (gemini_api_key !== undefined && typeof gemini_api_key === 'string' && gemini_api_key.trim() !== '' && gemini_api_key.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [gemini_api_key.trim()]);
    }

    if (whoop_client_id !== undefined && typeof whoop_client_id === 'string' && whoop_client_id.trim() !== '') {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('whoop_client_id', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [whoop_client_id.trim()]);
    }

    if (whoop_client_secret !== undefined && typeof whoop_client_secret === 'string' && whoop_client_secret.trim() !== '' && whoop_client_secret.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('whoop_client_secret', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [whoop_client_secret.trim()]);
    }

    res.json({ success: true, message: 'Настройки успешно сохранены!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
