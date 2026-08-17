import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2';
const SCOPES = 'read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline';

// Вспомогательная функция: получить настройки Whoop
async function getWhoopConfig(req) {
  const rows = await query(`SELECT key, value FROM app_settings WHERE key IN ('whoop_client_id', 'whoop_client_secret', 'whoop_access_token', 'whoop_refresh_token', 'whoop_token_expires_at', 'whoop_redirect_uri')`);
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });

  // Автоматический расчет Redirect URI на основе хоста запроса
  const host = req.get('host') || 'localhost:3001';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const dynamicRedirectUri = `${protocol}://${host}/api/whoop/oauth/callback`;

  return {
    clientId: config.whoop_client_id || '',
    clientSecret: config.whoop_client_secret || '',
    accessToken: config.whoop_access_token || '',
    refreshToken: config.whoop_refresh_token || '',
    redirectUri: config.whoop_redirect_uri || dynamicRedirectUri,
    defaultLocalRedirect: `http://localhost:3001/api/whoop/oauth/callback`,
    currentDynamicRedirect: dynamicRedirectUri
  };
}

// 📌 1. Статус подключения Whoop и Redirect URI для кабинета
router.get('/status', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const hasTokens = !!config.accessToken;

    res.json({
      success: true,
      isConnected: hasTokens,
      clientId: config.clientId ? config.clientId.slice(0, 6) + '...' : '',
      redirectUri: config.currentDynamicRedirect,
      localRedirectUri: config.defaultLocalRedirect,
      scopes: SCOPES
    });
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

    const redirectUri = encodeURIComponent(config.redirectUri);
    const authUrl = `${WHOOP_AUTH_URL}?client_id=${config.clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=whoophub_auth`;

    res.json({
      success: true,
      authUrl,
      redirectUri: config.redirectUri
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 3. Callback от Whoop после подтверждения пользователем
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

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

    // Обмениваем code на access_token и refresh_token
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri
    });

    const tokenRes = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Ошибка обмена токена Whoop:', tokenData);
      return res.send(`
        <html>
          <body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <h2 style="color:#f43f5e;">Ошибка получения токена Whoop</h2>
            <p>${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}</p>
            <p>Убедитесь, что Redirect URI в кабинете разработчика в точности равен: <br><code>${config.redirectUri}</code></p>
            <a href="/" style="color:#22c55e;text-decoration:none;font-weight:bold;">← Вернуться в приложение</a>
          </body>
        </html>
      `);
    }

    // Сохраняем токены в БД
    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.access_token]);
    if (tokenData.refresh_token) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.refresh_token]);
    }
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);

    // Сразу запрашиваем свежие данные из Whoop
    await syncLiveWhoopData(tokenData.access_token);

    // Успешный редирект обратно в приложение
    res.redirect('/?whoop_connected=true');
  } catch (err) {
    console.error('Whoop Callback Error:', err);
    res.status(500).send('Внутренняя ошибка авторизации Whoop: ' + err.message);
  }
});

// 🔄 Вспомогательная функция обновления Access токена по Refresh токену
async function refreshWhoopToken(config) {
  if (!config.refreshToken || !config.clientId || !config.clientSecret) return null;

  try {
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: SCOPES
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
      return data.access_token;
    }
  } catch (e) {
    console.error('Ошибка обновления Whoop токена:', e);
  }
  return null;
}

// 🟢 Загрузка реальных метрик через Whoop v2 REST API
async function syncLiveWhoopData(token) {
  try {
    const headers = { Authorization: `Bearer ${token}` };

    // 1. Recovery
    const recRes = await fetch(`${WHOOP_API_BASE}/recovery?limit=7`, { headers });
    const recData = recRes.ok ? await recRes.json() : null;

    // 2. Sleep
    const sleepRes = await fetch(`${WHOOP_API_BASE}/activity/sleep?limit=7`, { headers });
    const sleepData = sleepRes.ok ? await sleepRes.json() : null;

    // 3. Cycle (Strain)
    const cycleRes = await fetch(`${WHOOP_API_BASE}/cycle?limit=7`, { headers });
    const cycleData = cycleRes.ok ? await cycleRes.json() : null;

    if (recData?.records && recData.records.length > 0) {
      for (const rec of recData.records) {
        const dateStr = rec.created_at ? rec.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
        const score = rec.score?.recovery_score || 0;
        const hrv = rec.score?.hrv_rmssd_milli || 0;
        const rhr = rec.score?.resting_heart_rate || 0;
        const spo2 = rec.score?.spo2_percentage || 98;
        const skinTemp = rec.score?.skin_temp_celsius || 36.4;

        let recState = 'green';
        if (score < 34) recState = 'red';
        else if (score < 67) recState = 'yellow';

        // Сопоставляем сон
        const sleep = sleepData?.records?.find(s => s.created_at?.startsWith(dateStr));
        const sleepActualMin = sleep?.score?.stage_summary?.total_in_bed_time_milli 
          ? Math.round(sleep.score.stage_summary.total_in_bed_time_milli / 60000) : 450;
        const sleepNeedMin = sleep?.score?.sleep_needed?.baseline_milli 
          ? Math.round(sleep.score.sleep_needed.baseline_milli / 60000) : 480;
        const sleepPerfPct = sleep?.score?.sleep_performance_percentage || Math.round((sleepActualMin / sleepNeedMin) * 100);
        
        const deepMin = sleep?.score?.stage_summary?.slow_wave_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.slow_wave_sleep_time_milli / 60000) : 85;
        const remMin = sleep?.score?.stage_summary?.rem_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.rem_sleep_time_milli / 60000) : 100;
        const lightMin = sleep?.score?.stage_summary?.light_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.light_sleep_time_milli / 60000) : 210;

        // Сопоставляем Cycle / Strain
        const cycle = cycleData?.records?.find(c => c.created_at?.startsWith(dateStr));
        const strain = cycle?.score?.strain || 10.5;
        const calories = cycle?.score?.kilojoule ? Math.round(cycle.score.kilojoule * 0.239) : 2300;

        await run(`
          INSERT INTO whoop_metrics (
            date, recovery_score, recovery_state, hrv, rhr, skin_temp, spo2,
            sleep_need_min, sleep_actual_min, sleep_performance_pct,
            deep_sleep_min, rem_sleep_min, light_sleep_min, awake_min,
            respiratory_rate, strain, calories_burned, is_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 25, 14.1, ?, ?, 1)
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
            strain = excluded.strain,
            calories_burned = excluded.calories_burned,
            is_synced = 1
        `, [
          dateStr, score, recState, hrv, rhr, skinTemp, spo2,
          sleepNeedMin, sleepActualMin, sleepPerfPct,
          deepMin, remMin, lightMin, strain, calories
        ]);
      }
      console.log('✅ Данные Whoop успешно синхронизированы из Live API!');
    }
  } catch (err) {
    console.error('Ошибка вызова Whoop v2 API:', err);
  }
}

// 🟢 Ручная или периодическая синхронизация Whoop
router.post('/sync', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    let token = config.accessToken;

    if (token) {
      await syncLiveWhoopData(token);
    } else {
      // Симулятор обновлений для тестов без ключей
      const todayStr = new Date().toISOString().split('T')[0];
      const randStrain = Number((Math.random() * 5 + 9).toFixed(1));
      const randHrv = Math.floor(Math.random() * 20 + 68);
      await run(`UPDATE whoop_metrics SET strain = ?, hrv = ? WHERE date = ?`, [randStrain, randHrv, todayStr]);
    }

    const latest = await getOne(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1`);
    const history = await query(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 7`);

    res.json({
      success: true,
      message: token ? 'Синхронизировано с серверами Whoop' : 'Обновлено (демо-режим)',
      isLive: !!token,
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
    const todayStr = new Date().toISOString().split('T')[0];
    const latest = await getOne(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1`);
    const history = await query(`SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 7`);
    const config = await getWhoopConfig(req);

    res.json({
      success: true,
      isConnected: !!config.accessToken,
      current: latest || {
        date: todayStr,
        recovery_score: 82,
        recovery_state: 'green',
        hrv: 72,
        rhr: 52,
        skin_temp: 36.4,
        spo2: 98.5,
        sleep_need_min: 480,
        sleep_actual_min: 440,
        sleep_performance_pct: 92,
        deep_sleep_min: 95,
        rem_sleep_min: 110,
        light_sleep_min: 210,
        awake_min: 25,
        respiratory_rate: 14.1,
        strain: 9.4,
        calories_burned: 2350
      },
      history: history.reverse()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
