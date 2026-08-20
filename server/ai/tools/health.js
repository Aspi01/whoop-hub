import { query, getOne } from '../../db.js';

export async function getTodayStatus() {
  const todayStr = new Date().toISOString().split('T')[0];
  let metric = await getOne('SELECT * FROM whoop_metrics WHERE date = ?', [todayStr]);
  if (!metric) {
    metric = await getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1');
  }

  const recent = await query('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 30');

  // Per-Metric Baseline calculations (>= 7 valid observations required PER METRIC)
  let hrvSum = 0, hrvCount = 0;
  let rhrSum = 0, rhrCount = 0;
  let sleepSumMin = 0, sleepCount = 0;

  for (const m of (recent || [])) {
    if (typeof m.hrv === 'number' && m.hrv > 0) {
      hrvSum += m.hrv;
      hrvCount++;
    }
    if (typeof m.rhr === 'number' && m.rhr > 0) {
      rhrSum += m.rhr;
      rhrCount++;
    }
    if (typeof m.sleep_actual_min === 'number' && m.sleep_actual_min > 0) {
      sleepSumMin += m.sleep_actual_min;
      sleepCount++;
    }
  }

  const hasHrvBaseline = hrvCount >= 7;
  const hasRhrBaseline = rhrCount >= 7;
  const hasSleepBaseline = sleepCount >= 7;

  const hrvBaseline = hasHrvBaseline ? Math.round(hrvSum / hrvCount) : null;
  const rhrBaseline = hasRhrBaseline ? Math.round(rhrSum / rhrCount) : null;
  const sleepBaselineMin = hasSleepBaseline ? Math.round(sleepSumMin / sleepCount) : null;

  // Real per-metric value extraction (0 is NOT real for HRV/RHR/Sleep)
  const currentHrv = (typeof metric?.hrv === 'number' && metric.hrv > 0) ? metric.hrv : null;
  const currentRhr = (typeof metric?.rhr === 'number' && metric.rhr > 0) ? metric.rhr : null;
  const currentSleepMin = (typeof metric?.sleep_actual_min === 'number' && metric.sleep_actual_min > 0) ? metric.sleep_actual_min : null;
  const recoveryScore = (typeof metric?.recovery_score === 'number' && metric.recovery_score >= 0) ? metric.recovery_score : null;
  const strain = (typeof metric?.strain === 'number' && metric.strain >= 0) ? metric.strain : null;

  const hasAnyTodayMetric = recoveryScore !== null || currentHrv !== null || currentSleepMin !== null || strain !== null;

  if (!hasAnyTodayMetric && hrvCount === 0 && rhrCount === 0 && sleepCount === 0) {
    return {
      available: false,
      message: 'Данные физиологии и восстановления отсутствуют. Подключите Whoop в настройках.',
      today: null,
      baseline: {
        hrv: { available: false, status: 'UNAVAILABLE', sampleCount: 0, value: null },
        rhr: { available: false, status: 'UNAVAILABLE', sampleCount: 0, value: null },
        sleep: { available: false, status: 'UNAVAILABLE', sampleCount: 0, value: null, hours: null },
        available: false,
        isBuilding: true
      }
    };
  }

  const hrvDeltaPct = (currentHrv !== null && hrvBaseline !== null) ? Math.round(((currentHrv - hrvBaseline) / hrvBaseline) * 100) : null;
  const sleepDeltaMin = (currentSleepMin !== null && sleepBaselineMin !== null) ? currentSleepMin - sleepBaselineMin : null;

  return {
    available: hasAnyTodayMetric,
    today: hasAnyTodayMetric ? {
      recoveryScore,
      state: recoveryScore === null ? 'NO DATA' : recoveryScore >= 67 ? 'GREEN / GOOD TO TRAIN' : recoveryScore >= 34 ? 'YELLOW / MODERATE' : 'RED / RECOVERY FIRST',
      hrv: currentHrv,
      hrvBaseline,
      hrvDeltaPct: hrvDeltaPct !== null ? `${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%` : null,
      rhr: currentRhr,
      rhrBaseline,
      sleepFormatted: currentSleepMin !== null ? `${Math.floor(currentSleepMin / 60)}ч ${currentSleepMin % 60}м` : null,
      sleepScore: (typeof metric?.sleep_performance_pct === 'number' && metric.sleep_performance_pct > 0) ? metric.sleep_performance_pct : null,
      sleepDeltaVsBaselineMin: sleepDeltaMin !== null ? `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин` : null,
      strain
    } : null,
    baseline: {
      hrv: {
        available: hasHrvBaseline,
        status: hasHrvBaseline ? 'REAL' : (hrvCount > 0 ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'),
        sampleCount: hrvCount,
        value: hrvBaseline
      },
      rhr: {
        available: hasRhrBaseline,
        status: hasRhrBaseline ? 'REAL' : (rhrCount > 0 ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'),
        sampleCount: rhrCount,
        value: rhrBaseline
      },
      sleep: {
        available: hasSleepBaseline,
        status: hasSleepBaseline ? 'REAL' : (sleepCount > 0 ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'),
        sampleCount: sleepCount,
        value: sleepBaselineMin,
        hours: sleepBaselineMin ? (sleepBaselineMin / 60).toFixed(1) : null
      },
      available: hasHrvBaseline && hasRhrBaseline && hasSleepBaseline,
      isBuilding: !hasHrvBaseline || !hasRhrBaseline || !hasSleepBaseline,
      sampleDays: Math.max(hrvCount, rhrCount, sleepCount)
    }
  };
}

export async function getHrvTrend(limit = 7) {
  const metrics = await query('SELECT date, hrv, rhr, recovery_score FROM whoop_metrics WHERE hrv IS NOT NULL AND hrv > 0 ORDER BY date DESC LIMIT ?', [limit]);
  return metrics;
}

export async function getSleepSummary(limit = 7) {
  const metrics = await query('SELECT date, sleep_actual_min, sleep_performance_pct, deep_sleep_min, rem_sleep_min FROM whoop_metrics WHERE sleep_actual_min IS NOT NULL AND sleep_actual_min > 0 ORDER BY date DESC LIMIT ?', [limit]);
  return metrics;
}
