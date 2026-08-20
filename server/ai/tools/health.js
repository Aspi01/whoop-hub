import { query, getOne } from '../../db.js';

export async function getTodayStatus() {
  const todayStr = new Date().toISOString().split('T')[0];
  let metric = await getOne('SELECT * FROM whoop_metrics WHERE date = ?', [todayStr]);
  if (!metric) {
    metric = await getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1');
  }

  const recent = await query('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 30');

  // If no metrics at all in DB, return explicit unavailable state
  if (!metric && (!recent || recent.length === 0)) {
    return {
      available: false,
      message: 'Данные физиологии и восстановления отсутствуют. Подключите Whoop в настройках.',
      today: null,
      baseline: null
    };
  }

  // Baseline calculation (30 days) from real records only
  let hrvSum = 0, rhrSum = 0, sleepSum = 0, count = 0;
  for (const m of recent) {
    if (m.hrv) { hrvSum += m.hrv; count++; }
    if (m.rhr) rhrSum += m.rhr;
    if (m.sleep_actual_min) sleepSum += m.sleep_actual_min;
  }

  const hrvBaseline = count > 0 ? Math.round(hrvSum / count) : null;
  const rhrBaseline = count > 0 ? Math.round(rhrSum / count) : null;
  const sleepBaselineMin = count > 0 ? Math.round(sleepSum / count) : null;

  const currentHrv = metric?.hrv ?? null;
  const currentRhr = metric?.rhr ?? null;
  const currentSleepMin = metric?.sleep_actual_min ?? null;
  const recoveryScore = metric?.recovery_score ?? null;

  const hrvDeltaPct = (currentHrv && hrvBaseline) ? Math.round(((currentHrv - hrvBaseline) / hrvBaseline) * 100) : null;
  const sleepDeltaMin = (currentSleepMin && sleepBaselineMin) ? currentSleepMin - sleepBaselineMin : null;

  return {
    available: true,
    today: {
      recoveryScore,
      state: recoveryScore === null ? 'NO DATA' : recoveryScore >= 67 ? 'GREEN / GOOD TO TRAIN' : recoveryScore >= 34 ? 'YELLOW / MODERATE' : 'RED / RECOVERY FIRST',
      hrv: currentHrv,
      hrvBaseline,
      hrvDeltaPct: hrvDeltaPct !== null ? `${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%` : null,
      rhr: currentRhr,
      rhrBaseline,
      sleepFormatted: currentSleepMin !== null ? `${Math.floor(currentSleepMin / 60)}ч ${currentSleepMin % 60}м` : null,
      sleepScore: metric?.sleep_performance_pct ?? null,
      sleepDeltaVsBaselineMin: sleepDeltaMin !== null ? `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин` : null,
      strain: metric?.strain ?? null
    },
    baseline: {
      sampleDays: count,
      isBuilding: count < 7,
      hrvBaseline,
      rhrBaseline,
      sleepBaselineHours: sleepBaselineMin ? (sleepBaselineMin / 60).toFixed(1) : null
    }
  };
}

export async function getHrvTrend(limit = 7) {
  const metrics = await query('SELECT date, hrv, rhr, recovery_score FROM whoop_metrics ORDER BY date DESC LIMIT ?', [limit]);
  return metrics;
}

export async function getSleepSummary(limit = 7) {
  const metrics = await query('SELECT date, sleep_actual_min, sleep_performance_pct, deep_sleep_min, rem_sleep_min FROM whoop_metrics ORDER BY date DESC LIMIT ?', [limit]);
  return metrics;
}
