/**
 * Whoop Integration Routes (Security Hardened)
 * Static Credentials (Client ID/Secret) come exclusively from process.env.
 * Dynamic User Tokens (Access/Refresh) are encrypted at rest using AES-256-GCM.
 * Status endpoints return strictly sanitized booleans (Zero secrets exposed).
 */

import express from 'express';
import { query, getOne, run } from '../db.js';
import { encryptToken, decryptToken, isEncryptedToken } from '../utils/crypto.js';

const router = express.Router();

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
const SCOPES = 'read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline';
const STATIC_SECRET_FIELDS = new Set([
  'gemini_api_key',
  'openai_api_key',
  'whoop_client_id',
  'whoop_client_secret'
]);

const containsStaticSecretField = (body = {}) => (
  body && typeof body === 'object' && Object.keys(body).some(field => STATIC_SECRET_FIELDS.has(field))
);

// Вспомогательная функция: получить настройки Whoop
export async function getWhoopConfig(req) {
  const rows = await query(`SELECT key, value FROM app_settings WHERE key IN ('whoop_access_token', 'whoop_refresh_token', 'whoop_token_expires_at', 'whoop_redirect_uri')`);
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });

  const host = req?.get ? (req.get('host') || 'localhost:3001') : 'localhost:3001';
  let protocol = 'https';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')) {
    protocol = 'http';
  }
  const dynamicRedirectUri = `${protocol}://${host}/api/whoop/oauth/callback`;

  // Static secrets come strictly from process.env (Railway environment variables)
  const clientId = (process.env.WHOOP_CLIENT_ID || '').trim();
  const clientSecret = (process.env.WHOOP_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.WHOOP_REDIRECT_URI || config.whoop_redirect_uri || dynamicRedirectUri).trim();

  // OAuth tokens are DB-only. Plaintext legacy values are intentionally not
  // used until initDB has migrated them with a validated encryption key.
  const readStoredToken = (value) => {
    if (!value || !isEncryptedToken(value)) return { token: '', unavailable: Boolean(value) };
    try {
      return { token: decryptToken(value).trim(), unavailable: false };
    } catch {
      return { token: '', unavailable: true };
    }
  };
  const access = readStoredToken(config.whoop_access_token);
  const refresh = readStoredToken(config.whoop_refresh_token);

  return {
    clientId,
    clientSecret,
    accessToken: access.token,
    refreshToken: refresh.token,
    tokenUnavailable: access.unavailable || refresh.unavailable,
    expiresAt: config.whoop_token_expires_at,
    redirectUri,
    defaultLocalRedirect: `http://localhost:3001/api/whoop/oauth/callback`,
    currentDynamicRedirect: dynamicRedirectUri
  };
}

// 🔄 Вспомогательная функция автоматического обновления Access токена по Refresh токену (с блокировкой повторных запросов)
let inFlightRefreshPromise = null;

export async function refreshWhoopToken(config) {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    try {
      if (!config) config = await getWhoopConfig();
      if (!config.refreshToken || !config.clientId || !config.clientSecret) {
        console.warn('⚠️ Недостаточно данных для обновления Whoop токена (отсутствует Client ID/Secret или Refresh Token)');
        return null;
      }

      console.log('🔄 Запрос нового access_token через refresh_token...');
      const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'offline'
      });

      const res = await fetch(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });

      if (res.ok) {
        const data = await res.json();
        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

        // Encrypt tokens before DB persistence
        const encAccess = encryptToken(data.access_token);
        await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encAccess]);

        if (data.refresh_token) {
          const encRefresh = encryptToken(data.refresh_token);
          await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encRefresh]);
        }

        await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);
        console.log('✅ Access Token успешно обновлен через Refresh Token (зашифрован в базе данных)!');
        return data.access_token;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('⚠️ Whoop token refresh error:', res.status, errData?.error || errData);
      }
    } catch (e) {
      console.error('Исключение при обновлении Whoop токена:', e.message);
    } finally {
      inFlightRefreshPromise = null;
    }
    return null;
  })();

  return inFlightRefreshPromise;
}

// 🟢 Загрузка реальных метрик через Whoop v2 REST API (с авто-обновлением токена при 401)
export async function syncLiveWhoopData(token) {
  try {
    let currentToken = token;
    let config = await getWhoopConfig();
    if (!currentToken) currentToken = config.accessToken;

    if (!currentToken && config.refreshToken) {
      currentToken = await refreshWhoopToken(config);
    }

    if (!currentToken) {
      console.warn('⚠️ Нет токена для синхронизации Whoop');
      return false;
    }

    let headers = { Authorization: `Bearer ${currentToken}` };
    console.log('📡 Запрос свежих данных из Whoop v2 API...');

    // 1. Recovery
    let recRes = await fetch(`${WHOOP_API_BASE}/recovery?limit=14`, { headers });
    
    // Если токен истек (401), пробуем автоматически обновить его и повторить
    if (recRes.status === 401) {
      console.log('⚠️ Токен истек (401). Автоматическое обновление через Refresh Token...');
      const newToken = await refreshWhoopToken(config);
      if (newToken) {
        currentToken = newToken;
        headers = { Authorization: `Bearer ${currentToken}` };
        recRes = await fetch(`${WHOOP_API_BASE}/recovery?limit=14`, { headers });
      } else {
        console.warn('⚠️ Сессия Whoop истекла и не может быть обновлена (требуется повторная авторизация в Настройках).');
        return false;
      }
    }

    const recData = recRes.ok ? await recRes.json() : null;

    // 2. Sleep
    let sleepRes = await fetch(`${WHOOP_API_BASE}/activity/sleep?limit=25`, { headers });
    if (sleepRes.status === 401) {
      const newToken = await refreshWhoopToken(config);
      if (newToken) {
        currentToken = newToken;
        headers = { Authorization: `Bearer ${currentToken}` };
        sleepRes = await fetch(`${WHOOP_API_BASE}/activity/sleep?limit=25`, { headers });
      }
    }
    const sleepData = sleepRes.ok ? await sleepRes.json() : null;

    // 3. Cycle (Strain)
    let cycleRes = await fetch(`${WHOOP_API_BASE}/cycle?limit=14`, { headers });
    if (cycleRes.status === 401) {
      const newToken = await refreshWhoopToken(config);
      if (newToken) {
        currentToken = newToken;
        headers = { Authorization: `Bearer ${currentToken}` };
        cycleRes = await fetch(`${WHOOP_API_BASE}/cycle?limit=14`, { headers });
      }
    }
    const cycleData = cycleRes.ok ? await cycleRes.json() : null;

    // 4. Workouts directly from Whoop strap (точный подсчет калорий и датчиков браслета)
    let workoutRes = await fetch(`${WHOOP_API_BASE}/activity/workout?limit=25`, { headers });
    if (workoutRes.status === 401) {
      const newToken = await refreshWhoopToken(config);
      if (newToken) {
        currentToken = newToken;
        headers = { Authorization: `Bearer ${currentToken}` };
        workoutRes = await fetch(`${WHOOP_API_BASE}/activity/workout?limit=25`, { headers });
      }
    }
    const workoutData = workoutRes.ok ? await workoutRes.json() : null;

    if (recData?.records && recData.records.length > 0) {
      for (const rec of recData.records) {
        // Дата физиологического цикла (по дате пробуждения)
        const dateStr = rec.created_at ? rec.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
        
        // Strict null-safe extraction (SOURCE MISSING -> NULL)
        const score = (rec.score?.recovery_score !== undefined && rec.score?.recovery_score !== null)
          ? Number(rec.score.recovery_score) 
          : null;
        const hrv = (rec.score?.hrv_rmssd_milli !== undefined && rec.score?.hrv_rmssd_milli !== null)
          ? Math.round(Number(rec.score.hrv_rmssd_milli)) 
          : null;
        const rhr = (rec.score?.resting_heart_rate !== undefined && rec.score?.resting_heart_rate !== null)
          ? Math.round(Number(rec.score.resting_heart_rate)) 
          : null;
        const spo2 = (rec.score?.spo2_percentage !== undefined && rec.score?.spo2_percentage !== null)
          ? Number(Number(rec.score.spo2_percentage).toFixed(1)) 
          : null;
        const skinTemp = (rec.score?.skin_temp_celsius !== undefined && rec.score?.skin_temp_celsius !== null)
          ? Number(Number(rec.score.skin_temp_celsius).toFixed(1)) 
          : null;

        let recState = null;
        if (score !== null) {
          if (score < 34) recState = 'red';
          else if (score < 67) recState = 'yellow';
          else recState = 'green';
        }

        // Сопоставляем точный сон по sleep_id (или основной ночной сон)
        let sleep = null;
        if (rec.sleep_id && sleepData?.records) {
          sleep = sleepData.records.find(s => s.id === rec.sleep_id);
        }
        if (!sleep && sleepData?.records) {
          sleep = sleepData.records.find(s => !s.nap && (s.cycle_id === rec.cycle_id || s.created_at?.startsWith(dateStr)));
        }

        let sleepActualMin = null;
        let sleepNeedMin = null;
        let sleepPerfPct = null;
        let deepMin = null;
        let remMin = null;
        let lightMin = null;
        let awakeMin = null;
        let respRate = null;

        if (sleep && sleep.score) {
          const stageSummary = sleep.score.stage_summary;
          const totalInBedMilli = stageSummary?.total_in_bed_time_milli;
          const awakeMilli = stageSummary?.total_awake_time_milli;

          if (typeof totalInBedMilli === 'number') {
            const actualAsleepMilli = typeof awakeMilli === 'number' ? Math.max(0, totalInBedMilli - awakeMilli) : totalInBedMilli;
            sleepActualMin = Math.round(actualAsleepMilli / 60000);
          }
          if (typeof sleep.score.sleep_needed?.baseline_milli === 'number') {
            sleepNeedMin = Math.round(sleep.score.sleep_needed.baseline_milli / 60000);
          }
          if (typeof sleep.score.sleep_performance_percentage === 'number') {
            sleepPerfPct = Math.round(sleep.score.sleep_performance_percentage);
          } else if (sleepActualMin !== null && sleepNeedMin !== null && sleepNeedMin > 0) {
            sleepPerfPct = Math.round((sleepActualMin / sleepNeedMin) * 100);
          }
          if (typeof stageSummary?.total_slow_wave_sleep_time_milli === 'number') {
            deepMin = Math.round(stageSummary.total_slow_wave_sleep_time_milli / 60000);
          }
          if (typeof stageSummary?.total_rem_sleep_time_milli === 'number') {
            remMin = Math.round(stageSummary.total_rem_sleep_time_milli / 60000);
          }
          if (typeof stageSummary?.total_light_sleep_time_milli === 'number') {
            lightMin = Math.round(stageSummary.total_light_sleep_time_milli / 60000);
          }
          if (typeof awakeMilli === 'number') {
            awakeMin = Math.round(awakeMilli / 60000);
          }
          if (typeof sleep.score.respiratory_rate === 'number') {
            respRate = Number(sleep.score.respiratory_rate.toFixed(1));
          }
        }

        // Сопоставляем Cycle / Strain по cycle_id
        const cycle = cycleData?.records?.find(c => c.id === rec.cycle_id || c.created_at?.startsWith(dateStr));
        let strain = null;
        let calories = null;
        if (cycle && cycle.score) {
          if (typeof cycle.score.strain === 'number') {
            strain = Number(cycle.score.strain.toFixed(1));
          }
          if (typeof cycle.score.kilojoule === 'number') {
            calories = Math.round(cycle.score.kilojoule * 0.239006);
          }
        }

        await run(`
          INSERT INTO whoop_metrics (
            date, recovery_score, recovery_state, hrv, rhr, skin_temp, spo2,
            sleep_need_min, sleep_actual_min, sleep_performance_pct,
            deep_sleep_min, rem_sleep_min, light_sleep_min, awake_min,
            respiratory_rate, strain, calories_burned, is_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(date) DO UPDATE SET
            recovery_score = excluded.recovery_score,
            recovery_state = excluded.recovery_state,
            hrv = excluded.hrv,
            rhr = excluded.rhr,
            spo2 = excluded.spo2,
            skin_temp = excluded.skin_temp,
            sleep_actual_min = excluded.sleep_actual_min,
            sleep_need_min = excluded.sleep_need_min,
            sleep_performance_pct = excluded.sleep_performance_pct,
            deep_sleep_min = excluded.deep_sleep_min,
            rem_sleep_min = excluded.rem_sleep_min,
            light_sleep_min = excluded.light_sleep_min,
            awake_min = excluded.awake_min,
            respiratory_rate = excluded.respiratory_rate,
            strain = excluded.strain,
            calories_burned = excluded.calories_burned,
            is_synced = 1
        `, [
          dateStr, score, recState, hrv, rhr, skinTemp, spo2,
          sleepNeedMin, sleepActualMin, sleepPerfPct,
          deepMin, remMin, lightMin, awakeMin, respRate, strain, calories
        ]);
      }
    }

    // Сохраняем реальные тренировки со стрепа Whoop
    if (workoutData?.records && workoutData.records.length > 0) {
      for (const w of workoutData.records) {
        const wDateStr = w.start ? w.start.split('T')[0] : new Date().toISOString().split('T')[0];
        const wStart = new Date(w.start);
        const wEnd = new Date(w.end);
        const durationMin = Math.max(1, Math.round((wEnd - wStart) / 60000));
        
        // Точные калории с оптического пульсометра Whoop (кДж -> ккал)
        const exactCalories = Math.round((w.score?.kilojoule || 0) * 0.239006);
        const exactStrain = w.score?.strain ? Number(w.score.strain.toFixed(1)) : 0;
        const avgHr = Math.round(w.score?.average_heart_rate || 0);
        const maxHr = Math.round(w.score?.max_heart_rate || 0);
        
        const sportNames = {
          0: 'Активность',
          1: 'Бег',
          33: 'Ходьба',
          44: 'Беговая дорожка',
          45: 'Силовая тренировка',
          48: 'HIIT',
          52: 'Кардио'
        };
        const title = w.sport_name || sportNames[w.sport_id] || 'Тренировка Whoop';
        const type = w.sport_id === 45 ? 'Силовая' : (w.sport_id === 44 || w.sport_id === 33 || w.sport_id === 1) ? 'Кардио' : 'Интервалы';

        const existing = await getOne(`
          SELECT id FROM workouts 
          WHERE date = ? AND (ABS(duration_min - ?) <= 5 OR title = ?)
          LIMIT 1
        `, [wDateStr, durationMin, title]);

        if (existing) {
          await run(`
            UPDATE workouts SET 
              duration_min = ?,
              strain = ?,
              avg_hr = ?,
              max_hr = ?,
              notes = 'Калории: ~' || ? || ' ккал (Whoop Strap)'
            WHERE id = ?
          `, [durationMin, exactStrain, avgHr, maxHr, exactCalories, existing.id]);
        } else {
          await run(`
            INSERT INTO workouts (
              date, title, type, duration_min, strain, avg_hr, max_hr,
              fatigue_rpe, notes, exercises_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            wDateStr,
            title,
            type,
            durationMin,
            exactStrain,
            avgHr,
            maxHr,
            7,
            `Калории: ~${exactCalories} ккал (Whoop Strap)${w.score?.distance_meter ? ' | Дистанция: ' + Math.round(w.score.distance_meter) + 'м' : ''}`,
            JSON.stringify([])
          ]);
        }
      }
    }

    console.log('✅ Данные Whoop и тренировки со стрепа успешно сохранены в SQLite базу данных!');
    return true;
  } catch (err) {
    console.error('Ошибка вызова Whoop v2 API:', err.message);
  }
  return false;
}

// 📌 1. Статус подключения Whoop (Sanitized state only - Zero tokens / secrets)
router.get('/status', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const isConnected = Boolean(config.accessToken);
    const isConfigured = Boolean(config.clientId && config.clientSecret);

    res.json({
      success: true,
      isConnected,
      isConfigured,
      whoopConnected: isConnected,
      whoopConfigured: isConfigured,
      redirectUri: config.currentDynamicRedirect,
      localRedirectUri: config.defaultLocalRedirect,
      scopes: SCOPES
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.1 Восстановление сессии Whoop (Encrypts tokens at rest, rejects static secrets into DB)
router.post('/restore-session', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresAt } = req.body;
    
    if (accessToken && typeof accessToken === 'string' && accessToken.trim() !== '') {
      const encAccess = encryptToken(accessToken.trim());
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encAccess]);
    }
    if (refreshToken && typeof refreshToken === 'string' && refreshToken.trim() !== '') {
      const encRefresh = encryptToken(refreshToken.trim());
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encRefresh]);
    }
    if (expiresAt) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);
    }

    if (accessToken) {
      await syncLiveWhoopData(accessToken.trim());
    }

    res.json({ success: true, message: 'Сессия Whoop успешно синхронизирована' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.2 Получить сохраненные настройки (Sanitized booleans only)
router.get('/settings', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

    res.json({
      success: true,
      whoopConfigured: Boolean(config.clientId && config.clientSecret),
      whoopConnected: Boolean(config.accessToken),
      geminiConfigured,
      openaiConfigured
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.3 Сохранить настройки (No-op for static secrets)
router.post('/settings', async (req, res) => {
  try {
    if (containsStaticSecretField(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Static provider credentials are configured on the server and cannot be submitted by clients.'
      });
    }
    res.json({ success: true, message: 'Настройки успешно сохранены' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 2. Получить ссылку для авторизации в Whoop
router.get('/oauth/url', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    if (!config.clientId) {
      return res.status(400).json({
        success: false,
        error: 'Сначала укажите Client ID в настройках приложения'
      });
    }

    const redirectUri = config.currentDynamicRedirect;
    const statePayload = JSON.stringify({ redirectUri });
    const state = Buffer.from(statePayload).toString('base64url');

    const authUrl = `${WHOOP_AUTH_URL}?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}`;

    res.json({
      success: true,
      authUrl,
      redirectUri
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 3. Callback от Whoop после подтверждения пользователем
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, error, error_description, state } = req.query;

    if (error) {
      return res.send(`
        <html>
          <body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <h2 style="color:#f43f5e;">Ошибка авторизации Whoop</h2>
            <p>${error_description || error}</p>
            <a href="/" style="color:#22c55e;text-decoration:none;font-weight:bold;">← Вернуться в приложение</a>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Код авторизации не получен');
    }

    const config = await getWhoopConfig(req);

    let targetRedirectUri = config.currentDynamicRedirect;
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (parsed?.redirectUri) {
          targetRedirectUri = parsed.redirectUri;
        }
      } catch (e) {}
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code).trim(),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: targetRedirectUri
    });

    const tokenRes = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.send(`
        <html>
          <body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <h2 style="color:#f43f5e;">Ошибка получения токена Whoop</h2>
            <p><strong>Ответ Whoop:</strong> ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}</p>
            <p style="color:#94a3b8;font-size:12px;">Убедитесь, что в Whoop Developer Dashboard добавлен Redirect URI:<br><code>${targetRedirectUri}</code></p>
            <br>
            <a href="/" style="display:inline-block;background:#22c55e;color:#000;padding:10px 20px;border-radius:12px;text-decoration:none;font-weight:bold;">← Вернуться в приложение</a>
          </body>
        </html>
      `);
    }

    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

    // Encrypt tokens before storing in SQLite
    const encAccess = encryptToken(tokenData.access_token);
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encAccess]);

    if (tokenData.refresh_token) {
      const encRefresh = encryptToken(tokenData.refresh_token);
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [encRefresh]);
    }
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);

    await syncLiveWhoopData(tokenData.access_token);

    const redirectUrl = '/?whoop_connected=true';
    res.redirect(redirectUrl);
  } catch (err) {
    res.status(500).send('Внутренняя ошибка авторизации Whoop: ' + err.message);
  }
});

// 🟢 Ручная синхронизация Whoop
router.post('/sync', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    let token = config.accessToken;

    if (token || config.refreshToken) {
      await syncLiveWhoopData(token);
    }

    const latest = await getOne(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1`);
    const history = await query(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 7`);

    res.json({
      success: true,
      message: (token || config.refreshToken) ? 'Синхронизировано с серверами Whoop' : 'Демо-режим',
      isLive: !!(token || config.refreshToken),
      current: latest,
      history: history.reverse()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🟢 Получить текущие данные и историю
router.get('/summary', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const hasTokens = !!(config.accessToken || config.refreshToken);

    // Если данные есть, но сегодня еще не синхронизировались — делаем фоновую синхронизацию
    if (hasTokens) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayMetric = await getOne(`SELECT * FROM whoop_metrics WHERE date = ?`, [todayStr]);
      if (!todayMetric || !todayMetric.is_synced) {
        syncLiveWhoopData().catch(() => {});
      }
    }

    const latest = await getOne(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1`);
    const history = await query(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 7`);

    res.json({
      success: true,
      isConnected: hasTokens,
      current: latest || null,
      history: (history || []).reverse()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
