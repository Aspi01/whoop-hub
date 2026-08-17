import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

// 🟢 Получить текущие показатели Whoop и историю
router.get('/summary', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    let latest = await getOne(`
      SELECT * FROM whoop_metrics 
      ORDER BY date DESC LIMIT 1
    `);

    // Последние 7 дней для графиков
    const history = await query(`
      SELECT * FROM whoop_metrics 
      ORDER BY date DESC LIMIT 7
    `);

    res.json({
      success: true,
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

// 🔄 Симуляция обновления данных из Whoop
router.post('/sync', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = await getOne(`SELECT * FROM whoop_metrics WHERE date = ?`, [todayStr]);

    const randStrain = Number((Math.random() * 6 + 8).toFixed(1));
    const randHrv = Math.floor(Math.random() * 20 + 65);
    const randRec = Math.floor(Math.random() * 25 + 72);

    if (existing) {
      await run(`
        UPDATE whoop_metrics 
        SET strain = ?, hrv = ?, is_synced = 1
        WHERE date = ?
      `, [randStrain, randHrv, todayStr]);
    } else {
      await run(`
        INSERT INTO whoop_metrics (
          date, recovery_score, recovery_state, hrv, rhr, skin_temp, spo2,
          sleep_need_min, sleep_actual_min, sleep_performance_pct,
          deep_sleep_min, rem_sleep_min, light_sleep_min, awake_min,
          respiratory_rate, strain, calories_burned, is_synced
        ) VALUES (?, ?, 'green', ?, 52, 36.5, 98.4, 480, 435, 91, 90, 105, 215, 25, 14.0, ?, 2400, 1)
      `, [todayStr, randRec, randHrv, randStrain]);
    }

    const updated = await getOne(`SELECT * FROM whoop_metrics WHERE date = ?`, [todayStr]);
    res.json({ success: true, message: 'Синхронизация Whoop успешна', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
