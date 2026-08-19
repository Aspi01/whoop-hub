import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const MASKED_SECRET_SENTINEL = '••••••••';
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
const SCOPES = 'read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline';

// Вспомогательная функция: получить настройки Whoop
export async function getWhoopConfig(req) {
  const rows = await query(`SELECT key, value FROM app_settings WHERE key IN ('whoop_client_id', 'whoop_client_secret', 'whoop_access_token', 'whoop_refresh_token', 'whoop_token_expires_at', 'whoop_redirect_uri')`);
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });

  const host = req?.get ? (req.get('host') || 'localhost:3001') : 'localhost:3001';
  let protocol = 'https';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')) {
    protocol = 'http';
  }
  const dynamicRedirectUri = `${protocol}://${host}/api/whoop/oauth/callback`;

  const clientId = (process.env.WHOOP_CLIENT_ID || config.whoop_client_id || '').trim();
  const clientSecret = (process.env.WHOOP_CLIENT_SECRET || config.whoop_client_secret || '').trim();
  const redirectUri = (process.env.WHOOP_REDIRECT_URI || config.whoop_redirect_uri || dynamicRedirectUri).trim();

  return {
    clientId,
    clientSecret,
    accessToken: (config.whoop_access_token || process.env.WHOOP_ACCESS_TOKEN || '').trim(),
    refreshToken: (config.whoop_refresh_token || process.env.WHOOP_REFRESH_TOKEN || '').trim(),
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
        await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [data.access_token]);
        if (data.refresh_token) {
          await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [data.refresh_token]);
        }
        await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);
        console.log('✅ Access Token успешно обновлен через Refresh Token!');
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

    if (recData?.records && recData.records.length > 0) {
      for (const rec of recData.records) {
        // Дата физиологического цикла (по дате пробуждения)
        const dateStr = rec.created_at ? rec.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
        const score = rec.score?.recovery_score || 0;
        const hrv = Math.round(rec.score?.hrv_rmssd_milli || 0);
        const rhr = Math.round(rec.score?.resting_heart_rate || 0);
        const spo2 = rec.score?.spo2_percentage ? Number(rec.score.spo2_percentage.toFixed(1)) : 98.5;
        const skinTemp = rec.score?.skin_temp_celsius ? Number(rec.score.skin_temp_celsius.toFixed(1)) : 36.4;

        let recState = 'green';
        if (score < 34) recState = 'red';
        else if (score < 67) recState = 'yellow';

        // Сопоставляем точный сон по sleep_id (или основной ночной сон)
        let sleep = null;
        if (rec.sleep_id && sleepData?.records) {
          sleep = sleepData.records.find(s => s.id === rec.sleep_id);
        }
        if (!sleep && sleepData?.records) {
          sleep = sleepData.records.find(s => !s.nap && (s.cycle_id === rec.cycle_id || s.created_at?.startsWith(dateStr)));
        }

        const totalInBedMilli = sleep?.score?.stage_summary?.total_in_bed_time_milli || 0;
        const awakeMilli = sleep?.score?.stage_summary?.total_awake_time_milli || 0;
        const actualAsleepMilli = Math.max(0, totalInBedMilli - awakeMilli);

        const sleepActualMin = actualAsleepMilli > 0 ? Math.round(actualAsleepMilli / 60000) : Math.round(totalInBedMilli / 60000);
        const sleepNeedMin = sleep?.score?.sleep_needed?.baseline_milli 
          ? Math.round(sleep.score.sleep_needed.baseline_milli / 60000) : 480;
        const sleepPerfPct = sleep?.score?.sleep_performance_percentage ?? Math.round((sleepActualMin / (sleepNeedMin || 480)) * 100);
        
        const deepMin = sleep?.score?.stage_summary?.total_slow_wave_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_slow_wave_sleep_time_milli / 60000) : 85;
        const remMin = sleep?.score?.stage_summary?.total_rem_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_rem_sleep_time_milli / 60000) : 100;
        const lightMin = sleep?.score?.stage_summary?.total_light_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_light_sleep_time_milli / 60000) : 210;
        const awakeMin = awakeMilli > 0 ? Math.round(awakeMilli / 60000) : 25;
        const respRate = sleep?.score?.respiratory_rate ? Number(sleep.score.respiratory_rate.toFixed(1)) : 15.6;

        // Сопоставляем Cycle / Strain по cycle_id
        const cycle = cycleData?.records?.find(c => c.id === rec.cycle_id || c.created_at?.startsWith(dateStr));
        const strain = cycle?.score?.strain ? Number(cycle.score.strain.toFixed(1)) : 4.4;
        const calories = cycle?.score?.kilojoule ? Math.round(cycle.score.kilojoule * 0.239) : 2050;

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
      console.log('✅ Данные Whoop успешно сохранены в SQLite базу данных!');
      return true;
    }
  } catch (err) {
    console.error('Ошибка вызова Whoop v2 API:', err.message);
  }
  return false;
}

const MASKED_SECRET_SENTINEL = '••••••••';

// 📌 1. Статус подключения Whoop
router.get('/status', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const hasTokens = !!config.accessToken || !!config.refreshToken;

    res.json({
      success: true,
      isConnected: hasTokens,
      sessionToken: hasTokens ? {
        hasSession: true,
        expiresAt: config.expiresAt
      } : null,
      clientId: config.clientId ? config.clientId.slice(0, 8) + '...' : '',
      redirectUri: config.currentDynamicRedirect,
      localRedirectUri: config.defaultLocalRedirect,
      scopes: SCOPES
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.1 Восстановление сессии Whoop
router.post('/restore-session', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresAt, clientId, clientSecret, geminiApiKey } = req.body;
    
    if (accessToken && typeof accessToken === 'string' && accessToken.trim() !== '') {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [accessToken.trim()]);
    }
    if (refreshToken && typeof refreshToken === 'string' && refreshToken.trim() !== '') {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [refreshToken.trim()]);
    }
    if (expiresAt) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);
    }
    if (clientId && typeof clientId === 'string' && clientId.trim() !== '') {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [clientId.trim()]);
    }
    if (clientSecret && typeof clientSecret === 'string' && clientSecret.trim() !== '' && clientSecret.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [clientSecret.trim()]);
    }
    if (geminiApiKey && typeof geminiApiKey === 'string' && geminiApiKey.trim() !== '' && geminiApiKey.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [geminiApiKey.trim()]);
    }

    if (accessToken) {
      await syncLiveWhoopData(accessToken);
    }

    res.json({ success: true, message: 'Сессия Whoop успешно синхронизирована' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.2 Получить сохраненные настройки
router.get('/settings', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const geminiRow = await getOne(`SELECT value FROM app_settings WHERE key = 'gemini_api_key'`);
    res.json({
      success: true,
      settings: {
        whoop_client_id: config.clientId,
        whoop_client_secret: config.clientSecret ? MASKED_SECRET_SENTINEL : '',
        gemini_api_key: geminiRow?.value ? MASKED_SECRET_SENTINEL : ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.3 Сохранить настройки
router.post('/settings', async (req, res) => {
  try {
    const { whoop_client_id, whoop_client_secret, gemini_api_key } = req.body;
    if (whoop_client_id !== undefined && typeof whoop_client_id === 'string' && whoop_client_id.trim() !== '') {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [whoop_client_id.trim()]);
    }
    if (whoop_client_secret !== undefined && typeof whoop_client_secret === 'string' && whoop_client_secret.trim() !== '' && whoop_client_secret.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [whoop_client_secret.trim()]);
    }
    if (gemini_api_key !== undefined && typeof gemini_api_key === 'string' && gemini_api_key.trim() !== '' && gemini_api_key.trim() !== MASKED_SECRET_SENTINEL) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [gemini_api_key.trim()]);
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
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.access_token]);
    if (tokenData.refresh_token) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.refresh_token]);
    }
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);

    await syncLiveWhoopData(tokenData.access_token);

    const redirectUrl = `/?whoop_connected=true&access_token=${encodeURIComponent(tokenData.access_token)}&refresh_token=${encodeURIComponent(tokenData.refresh_token || '')}`;
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
      current: latest,
      history: history.reverse()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
