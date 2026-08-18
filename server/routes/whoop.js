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

  // Автоматический расчет Redirect URI: на любых внешних доменах (onrender.com и т.д.) ВСЕГДА https
  const host = req?.get ? (req.get('host') || 'localhost:3001') : 'localhost:3001';
  let protocol = 'https';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.')) {
    protocol = 'http';
  }
  const dynamicRedirectUri = `${protocol}://${host}/api/whoop/oauth/callback`;

  return {
    clientId: (config.whoop_client_id || '').trim(),
    clientSecret: (config.whoop_client_secret || '').trim(),
    accessToken: (config.whoop_access_token || '').trim(),
    refreshToken: (config.whoop_refresh_token || '').trim(),
    redirectUri: (config.whoop_redirect_uri || dynamicRedirectUri).trim(),
    defaultLocalRedirect: `http://localhost:3001/api/whoop/oauth/callback`,
    currentDynamicRedirect: dynamicRedirectUri
  };
}

// 📌 1. Статус подключения Whoop (с отдачей зашифрованной/сохраненной сессии)
router.get('/status', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    const hasTokens = !!config.accessToken;

    res.json({
      success: true,
      isConnected: hasTokens,
      sessionToken: hasTokens ? {
        accessToken: config.accessToken,
        refreshToken: config.refreshToken,
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

// 📌 1.1 Восстановление сессии Whoop из клиентского localStorage (защита от сброса контейнера Render)
router.post('/restore-session', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresAt, clientId, clientSecret, geminiApiKey } = req.body;
    
    if (accessToken) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [accessToken]);
    }
    if (refreshToken) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [refreshToken]);
    }
    if (expiresAt) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);
    }
    if (clientId) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [clientId]);
    }
    if (clientSecret) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_client_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [clientSecret]);
    }
    if (geminiApiKey) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [geminiApiKey]);
    }

    if (accessToken) {
      await syncLiveWhoopData(accessToken);
    }

    res.json({ success: true, message: 'Сессия Whoop успешно синхронизирована и восстановлена' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 2. Получить ссылку для авторизации в Whoop (с сохранением redirect_uri в state)
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
    // Упаковываем точный redirectUri в state
    const statePayload = JSON.stringify({ redirectUri });
    const state = Buffer.from(statePayload).toString('base64url');

    const authUrl = `${WHOOP_AUTH_URL}?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}`;

    console.log('🔗 Сгенерирована ссылка авторизации Whoop:');
    console.log('Client ID:', config.clientId);
    console.log('Redirect URI:', redirectUri);

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

    console.log('📥 Получен Callback от Whoop:', { code: code ? 'OK' : 'MISSING', error, state });

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

    // Извлекаем точный redirectUri из state
    let targetRedirectUri = config.currentDynamicRedirect;
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (parsed?.redirectUri) {
          targetRedirectUri = parsed.redirectUri;
        }
      } catch (e) {
        console.warn('Не удалось распарсить state:', e.message);
      }
    }

    console.log('🔄 Обмен кода на токен с Redirect URI:', targetRedirectUri);

    // Обмениваем code на access_token и refresh_token
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
      console.error('❌ Ошибка ответа сервера Whoop Token:', tokenData);
      return res.send(`
        <html>
          <body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <h2 style="color:#f43f5e;">Ошибка получения токена Whoop</h2>
            <p><strong>Ответ Whoop:</strong> ${tokenData.error_description || tokenData.error || JSON.stringify(tokenData)}</p>
            <p style="color:#94a3b8;font-size:12px;">Убедитесь, что в Whoop Developer Dashboard в Redirect URIs добавлен:<br><code>${targetRedirectUri}</code></p>
            <br>
            <a href="/" style="display:inline-block;background:#22c55e;color:#000;padding:10px 20px;border-radius:12px;text-decoration:none;font-weight:bold;">← Вернуться в приложение</a>
          </body>
        </html>
      `);
    }

    console.log('✅ Access Token успешно получен от Whoop!');

    // Сохраняем токены в БД
    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_access_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.access_token]);
    if (tokenData.refresh_token) {
      await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_refresh_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tokenData.refresh_token]);
    }
    await run(`INSERT INTO app_settings (key, value) VALUES ('whoop_token_expires_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(expiresAt)]);

    // Сразу запрашиваем реальные данные из Whoop v2
    await syncLiveWhoopData(tokenData.access_token);

    // Успешный редирект обратно в приложение с передачей токена для мгновенного сохранения в localStorage
    const redirectUrl = `/?whoop_connected=true&access_token=${encodeURIComponent(tokenData.access_token)}&refresh_token=${encodeURIComponent(tokenData.refresh_token || '')}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Whoop Callback Exception:', err);
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
export async function syncLiveWhoopData(token) {
  try {
    const headers = { Authorization: `Bearer ${token}` };

    console.log('📡 Запрос свежих данных из Whoop v2 API...');

    // 1. Recovery
    const recRes = await fetch(`${WHOOP_API_BASE}/recovery?limit=14`, { headers });
    const recData = recRes.ok ? await recRes.json() : null;

    // 2. Sleep
    const sleepRes = await fetch(`${WHOOP_API_BASE}/activity/sleep?limit=25`, { headers });
    const sleepData = sleepRes.ok ? await sleepRes.json() : null;

    // 3. Cycle (Strain)
    const cycleRes = await fetch(`${WHOOP_API_BASE}/cycle?limit=14`, { headers });
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

        // 1. Сопоставляем точный сон по sleep_id (или основной ночной сон)
        let sleep = null;
        if (rec.sleep_id && sleepData?.records) {
          sleep = sleepData.records.find(s => s.id === rec.sleep_id);
        }
        if (!sleep && sleepData?.records) {
          sleep = sleepData.records.find(s => !s.nap && (s.cycle_id === rec.cycle_id || s.created_at?.startsWith(dateStr)));
        }

        // Расчет времени сна: общее время в постели минус бодрствование
        const totalInBedMilli = sleep?.score?.stage_summary?.total_in_bed_time_milli || 0;
        const awakeMilli = sleep?.score?.stage_summary?.total_awake_time_milli || 0;
        const actualAsleepMilli = Math.max(0, totalInBedMilli - awakeMilli);

        const sleepActualMin = actualAsleepMilli > 0 ? Math.round(actualAsleepMilli / 60000) : Math.round(totalInBedMilli / 60000);
        const sleepNeedMin = sleep?.score?.sleep_needed?.baseline_milli 
          ? Math.round(sleep.score.sleep_needed.baseline_milli / 60000) : 480;
        const sleepPerfPct = sleep?.score?.sleep_performance_percentage || Math.round((sleepActualMin / (sleepNeedMin || 480)) * 100);
        
        const deepMin = sleep?.score?.stage_summary?.total_slow_wave_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_slow_wave_sleep_time_milli / 60000) : 85;
        const remMin = sleep?.score?.stage_summary?.total_rem_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_rem_sleep_time_milli / 60000) : 100;
        const lightMin = sleep?.score?.stage_summary?.total_light_sleep_time_milli 
          ? Math.round(sleep.score.stage_summary.total_light_sleep_time_milli / 60000) : 210;
        const awakeMin = awakeMilli > 0 ? Math.round(awakeMilli / 60000) : 25;
        const respRate = sleep?.score?.respiratory_rate ? Number(sleep.score.respiratory_rate.toFixed(1)) : 15.6;

        // 2. Сопоставляем Cycle / Strain по cycle_id
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
      console.log('✅ Данные Whoop успешно сохранены в локальную базу данных!');
    }
  } catch (err) {
    console.error('Ошибка вызова Whoop v2 API:', err);
  }
}

// 🟢 Ручная синхронизация Whoop
router.post('/sync', async (req, res) => {
  try {
    const config = await getWhoopConfig(req);
    let token = config.accessToken;

    if (token) {
      await syncLiveWhoopData(token);
    } else {
      // Симулятор для тестов
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
