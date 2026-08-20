import express from 'express';
import { query, run } from '../db.js';

const router = express.Router();
const MASKED_SECRET_SENTINEL = '••••••••';

// Safe allowlist of non-sensitive settings that can be returned to the client
const PUBLIC_ALLOWLIST = new Set([
  'whoop_client_id',
  'calorie_goal',
  'protein_goal',
  'theme',
  'language'
]);

// Sensitive keys edited via settings modal (only returned as masked sentinel if configured)
const SENSITIVE_KEYS = new Set([
  'gemini_api_key',
  'openai_api_key',
  'whoop_client_secret'
]);

// ⚙️ Получить настройки (Strict Safe Allowlist - NEVER returns raw tokens, passwords, or secret keys)
router.get('/', async (req, res) => {
  try {
    const rows = await query(`SELECT key, value FROM app_settings`);
    const settings = {};

    rows.forEach(r => {
      if (PUBLIC_ALLOWLIST.has(r.key)) {
        settings[r.key] = r.value || '';
      } else if (SENSITIVE_KEYS.has(r.key)) {
        // Return masked sentinel ONLY if secret is configured and non-empty
        settings[r.key] = (r.value && typeof r.value === 'string' && r.value.trim().length > 0) 
          ? MASKED_SECRET_SENTINEL 
          : '';
      }
      // Any other keys (such as whoop_access_token, whoop_refresh_token, etc.) are strictly OMITTED.
    });

    const hasGeminiKey = Boolean(rows.find(r => r.key === 'gemini_api_key')?.value || process.env.GEMINI_API_KEY);
    const hasOpenAIKey = Boolean(rows.find(r => r.key === 'openai_api_key')?.value || process.env.OPENAI_API_KEY);

    res.json({
      success: true,
      settings,
      hasGeminiKey,
      hasOpenAIKey
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💾 Сохранить настройки
router.post('/', async (req, res) => {
  try {
    const { gemini_api_key, openai_api_key, whoop_client_id, whoop_client_secret, calorie_goal, protein_goal } = req.body;

    if (gemini_api_key !== undefined && typeof gemini_api_key === 'string' && gemini_api_key.trim() !== '' && gemini_api_key.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [gemini_api_key.trim()]);
    }

    if (openai_api_key !== undefined && typeof openai_api_key === 'string' && openai_api_key.trim() !== '' && openai_api_key.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('openai_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [openai_api_key.trim()]);
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

    if (calorie_goal !== undefined) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('calorie_goal', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [String(calorie_goal)]);
    }

    if (protein_goal !== undefined) {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('protein_goal', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [String(protein_goal)]);
    }

    res.json({ success: true, message: 'Настройки успешно сохранены!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
