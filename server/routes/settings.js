/**
 * Settings Route (Strict Safe Allowlist & Infrastructure Isolation)
 * Static API keys (Gemini, OpenAI, Whoop) are configured purely via server environment variables.
 * Frontend receives only sanitized configuration flags (booleans) and user preferences.
 */

import express from 'express';
import { query, run } from '../db.js';
import { healthSourceRegistry } from '../health/healthSourceRegistry.js';

const router = express.Router();

// Safe allowlist of user-customizable preferences stored in DB
const ALLOWED_USER_PREFERENCES = new Set([
  'calorie_goal',
  'protein_goal',
  'theme',
  'language'
]);
const STATIC_SECRET_FIELDS = new Set([
  'gemini_api_key',
  'openai_api_key',
  'whoop_client_id',
  'whoop_client_secret'
]);

const containsStaticSecretField = (body = {}) => (
  body && typeof body === 'object' && Object.keys(body).some(field => STATIC_SECRET_FIELDS.has(field))
);

// ⚙️ Получить настройки (Returns user preferences and sanitized integration status booleans)
router.get('/', async (req, res) => {
  try {
    const rows = await query(`SELECT key, value FROM app_settings`);
    const settings = {};

    rows.forEach(r => {
      if (ALLOWED_USER_PREFERENCES.has(r.key)) {
        settings[r.key] = r.value || '';
      }
    });

    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
    const whoopConfigured = Boolean(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
    const whoopTokenRow = rows.find(r => r.key === 'whoop_access_token');
    const whoopConnected = Boolean(whoopTokenRow?.value);

    res.json({
      success: true,
      settings,
      geminiConfigured,
      openaiConfigured,
      whoopConfigured,
      whoopConnected,
      healthSources: await healthSourceRegistry.listSources(),
      // Compatibility aliases for legacy clients
      hasGeminiKey: geminiConfigured,
      hasOpenAIKey: openaiConfigured
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💾 Сохранить пользовательские предпочтения (Static infrastructure secrets rejected from client body)
router.post('/', async (req, res) => {
  try {
    if (containsStaticSecretField(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Static provider credentials are configured on the server and cannot be submitted by clients.'
      });
    }

    const { calorie_goal, protein_goal, theme, language } = req.body;

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

    if (theme !== undefined && typeof theme === 'string') {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('theme', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [theme.trim()]);
    }

    if (language !== undefined && typeof language === 'string') {
      await run(`
        INSERT INTO app_settings (key, value) VALUES ('language', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, [language.trim()]);
    }

    res.json({ success: true, message: 'Настройки успешно сохранены!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
