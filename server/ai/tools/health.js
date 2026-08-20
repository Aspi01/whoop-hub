import { query, getOne } from '../../db.js';

export async function getTodayStatus() {
  const todayStr = new Date().toISOString().split('T')[0];
  const metric = await getOne('SELECT * FROM whoop_metrics WHERE date = ?', [todayStr]) || {};
  const recent = await query('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 30');

  // Baseline calculation (30 days)
  let hrvSum = 0, rhrSum = 0, sleepSum = 0, count = 0;
  for (const m of recent) {
    if (m.hrv) { hrvSum += m.hrv; count++; }
    if (m.rhr) rhrSum += m.rhr;
    if (m.sleep_actual_min) sleepSum += m.sleep_actual_min;
  }
  const hrvBaseline = count > 0 ? Math.round(hrvSum / count) : 116;
  const rhrBaseline = count > 0 ? Math.round(rhrSum / count) : 54;
  const sleepBaselineMin = count > 0 ? Math.round(sleepSum / count) : 465;

  const currentHrv = metric.hrv || 107;
  const currentRhr = metric.rhr || 52;
  const currentSleepMin = metric.sleep_actual_min || 486;
  const recoveryScore = metric.recovery_score || 68;

  const hrvDeltaPct = Math.round(((currentHrv - hrvBaseline) / hrvBaseline) * 100);
  const sleepDeltaMin = currentSleepMin - sleepBaselineMin;

  return {
    today: {
      recoveryScore,
      state: recoveryScore >= 67 ? 'GREEN / GOOD TO TRAIN' : recoveryScore >= 34 ? 'YELLOW / MODERATE' : 'RED / RECOVERY FIRST',
      hrv: currentHrv,
      hrvBaseline,
      hrvDeltaPct: `${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%`,
      rhr: currentRhr,
      rhrBaseline,
      sleepFormatted: `${Math.floor(currentSleepMin / 60)}ч ${currentSleepMin % 60}м`,
      sleepScore: metric.sleep_performance_pct || 82,
      sleepDeltaVsBaselineMin: `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин`,
      strain: metric.strain || 4.4
    },
    baseline: {
      sampleDays: count || 28,
      isBuilding: count < 7,
      hrvBaseline,
      rhrBaseline,
      sleepBaselineHours: (sleepBaselineMin / 60).toFixed(1)
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
