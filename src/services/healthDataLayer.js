/**
 * Health Data Layer & Normalization Service
 * Unifies data across Wearables (Whoop, Apple Health, Garmin), Nutrition, Workouts, and Rituals.
 * Provides strict Per-Metric Availability and Per-Metric Baseline gating (>= 7 valid records per metric).
 * Ensures missing metrics stay null and invalid placeholder zeros are never classified as REAL.
 */

export function normalizeHealthData({ whoopData, mealsData, workoutsData, journalData }) {
  const whoop = whoopData || {};
  const current = whoop.current || null;
  const history = Array.isArray(whoop.history) ? whoop.history : [];
  const readinessRaw = whoop.readiness || {};
  const metricsRaw = whoop.metrics || {};
  const sleepRaw = metricsRaw.sleep || whoop.sleep || {};
  const recoveryRaw = metricsRaw.recovery || whoop.recovery || {};
  const strainRaw = metricsRaw.strain || whoop.strain || {};

  const isWhoopConnected = Boolean(whoopData?.isConnected);

  // 1. Calculate Real Per-Metric Baselines from stored history records
  let hrvSum = 0, hrvCount = 0;
  let rhrSum = 0, rhrCount = 0;
  let sleepSumMin = 0, sleepCount = 0;

  for (const day of history) {
    if (typeof day.hrv === 'number' && day.hrv > 0) {
      hrvSum += day.hrv;
      hrvCount++;
    }
    if (typeof day.rhr === 'number' && day.rhr > 0) {
      rhrSum += day.rhr;
      rhrCount++;
    }
    if (typeof day.sleep_actual_min === 'number' && day.sleep_actual_min > 0) {
      sleepSumMin += day.sleep_actual_min;
      sleepCount++;
    }
  }

  // Baseline sufficiency is strictly PER METRIC (>= 7 required for each)
  const hasHrvBaseline = hrvCount >= 7;
  const hasRhrBaseline = rhrCount >= 7;
  const hasSleepBaseline = sleepCount >= 7;

  const hrvBaseline = hasHrvBaseline ? Math.round(hrvSum / hrvCount) : null;
  const rhrBaseline = hasRhrBaseline ? Math.round(rhrSum / rhrCount) : null;
  const sleepBaselineSec = hasSleepBaseline ? Math.round((sleepSumMin / sleepCount) * 60) : null;

  // 2. Readiness / Recovery (0 is valid ONLY if explicitly reported by provider)
  const rawRec = current?.recovery_score ?? readinessRaw.recovery_score ?? recoveryRaw.score ?? null;
  const recoveryScore = (typeof rawRec === 'number' && rawRec >= 0 && rawRec <= 100) ? Number(rawRec) : null;

  // 3. HRV & RHR (0 is biologically impossible; placeholder 0 -> null)
  const rawHrv = current?.hrv ?? readinessRaw.hrv ?? metricsRaw.hrv ?? null;
  const hrvValue = (typeof rawHrv === 'number' && rawHrv > 0) ? Number(rawHrv) : null;

  const rawRhr = current?.rhr ?? readinessRaw.rhr ?? metricsRaw.rhr ?? null;
  const rhrValue = (typeof rawRhr === 'number' && rawRhr > 20 && rawRhr < 250) ? Number(rawRhr) : null;

  const hrvDeltaPct = (hrvValue !== null && hrvBaseline !== null) ? Math.round(((hrvValue - hrvBaseline) / hrvBaseline) * 100) : null;
  const rhrDeltaBpm = (rhrValue !== null && rhrBaseline !== null) ? rhrValue - rhrBaseline : null;

  // Dynamic readiness mapping
  let readinessState = 'ОЖИДАНИЕ ДАННЫХ';
  let readinessAdvice = 'Подключите Whoop или Apple Health для автоматического расчёта готовности к тренировке.';

  if (recoveryScore === null) {
    readinessState = 'ОЖИДАНИЕ ДАННЫХ';
    readinessAdvice = 'Подключите Whoop или Apple Health для автоматического расчёта готовности к тренировке.';
  } else if (recoveryScore >= 75) {
    readinessState = 'GOOD TO TRAIN';
    readinessAdvice = 'Восстановление позволяет тренироваться по плану. Нагрузку можно держать обычной.';
  } else if (recoveryScore >= 60) {
    readinessState = 'TRAIN, BUT EASIER';
    readinessAdvice = 'Умеренная готовность. Сохраняй технику, но уменьши 1 подход в тяжёлых сетах.';
  } else if (recoveryScore >= 40) {
    readinessState = 'TAKE IT EASY';
    readinessAdvice = 'Сниженное восстановление. Рекомендуется лёгкая сессия, растяжка или отдых.';
  } else {
    readinessState = 'RECOVERY FIRST';
    readinessAdvice = 'Высокая системная усталость. Сегодня приоритет — сон, гидратация и пассивный отдых.';
  }

  // 4. Sleep (missing/0 sleep duration -> null, NOT "0ч 0м")
  const rawSleepPct = current?.sleep_performance_pct ?? readinessRaw.sleep_score ?? sleepRaw.score ?? null;
  const sleepScore = (typeof rawSleepPct === 'number' && rawSleepPct > 0 && rawSleepPct <= 100) ? Number(rawSleepPct) : null;

  const rawSleepMin = current?.sleep_actual_min ?? null;
  const sleepActualMin = (typeof rawSleepMin === 'number' && rawSleepMin > 0) ? Number(rawSleepMin) : null;
  const sleepDurationSec = sleepActualMin !== null ? sleepActualMin * 60 : null;
  const sleepDeltaMin = (sleepDurationSec !== null && sleepBaselineSec !== null) ? Math.round((sleepDurationSec - sleepBaselineSec) / 60) : null;
  const sleepFormatted = sleepActualMin !== null ? `${Math.floor(sleepActualMin / 60)}ч ${sleepActualMin % 60}м` : null;

  // 5. Strain & Workouts (0.0 can be a valid real measurement)
  const rawStrain = current?.strain ?? readinessRaw.day_strain ?? strainRaw.score ?? null;
  const currentStrain = (typeof rawStrain === 'number' && rawStrain >= 0 && rawStrain <= 21) ? Number(rawStrain) : null;

  // 6. Nutrition (Real App Nutrition Context)
  const rawMeals = Array.isArray(mealsData?.meals) ? mealsData.meals : [];
  const mealsTotals = mealsData?.totals || { calories: 0, protein: 0, fats: 0, carbs: 0 };
  const hasLoggedMealsToday = rawMeals.length > 0;

  let calorieGoal = 2250;
  let proteinGoal = 150;
  let isCalorieGoalConfigured = false;
  let isProteinGoalConfigured = false;
  try {
    const savedKcal = localStorage.getItem('whoop_calorie_goal');
    const savedProtein = localStorage.getItem('whoop_protein_goal');
    if (savedKcal) {
      calorieGoal = Number(savedKcal);
      isCalorieGoalConfigured = true;
    }
    if (savedProtein) {
      proteinGoal = Number(savedProtein);
      isProteinGoalConfigured = true;
    }
  } catch (e) {}

  // 7. Rituals / Subjective
  const journalEntry = journalData?.entry || {};
  const stressLevel = journalEntry.stress_level ?? null;
  const energyLevel = journalEntry.energy_level ?? null;
  const journalTags = Array.isArray(journalEntry.tags) ? journalEntry.tags : [];

  // 8. Sources Metadata
  const sources = [
    {
      id: 'whoop',
      name: 'Whoop 4.0',
      connected: isWhoopConnected,
      lastSync: isWhoopConnected ? 'Синхронизировано' : 'Не подключён',
      domains: ['Восстановление', 'Сон & Фазы', 'HRV & Пульс', 'Дневной Strain'],
      statusText: isWhoopConnected ? 'Подключён · Автосинхронизация' : 'Требуется подключение'
    },
    {
      id: 'apple_health',
      name: 'Apple Health',
      connected: false,
      lastSync: null,
      domains: ['Сон', 'Шаги', 'Тренировки', 'Пульс в покое'],
      statusText: 'Не подключён'
    },
    {
      id: 'garmin',
      name: 'Garmin Connect',
      connected: false,
      lastSync: null,
      domains: ['Body Battery', 'HRV Status', 'GPS Треки'],
      statusText: 'Скоро появится',
      isComingSoon: true
    }
  ];

  // 9. Structured Findings (Only when real recovery data AND historical baseline are present)
  const findings = [];
  if (recoveryScore !== null && (hasHrvBaseline || hasRhrBaseline || hasSleepBaseline)) {
    findings.push({
      id: 'f_rec_trend',
      kicker: 'RECOVERY TREND',
      title: recoveryScore >= 67 ? 'Recovery держится в хорошей зоне' : 'Recovery снижен относительно обычной нормы',
      description: readinessAdvice,
      evidence: [
        { label: 'Сон', value: sleepDeltaMin !== null ? `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин к baseline` : (sleepFormatted || 'Нет данных'), status: sleepDeltaMin !== null && sleepDeltaMin >= 0 ? 'pos' : 'neutral' },
        { label: 'HRV', value: hrvValue !== null ? `${hrvValue} мс${hrvDeltaPct !== null ? ` (${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%)` : ''}` : 'Нет данных', status: hrvDeltaPct !== null && hrvDeltaPct >= 0 ? 'pos' : 'amber' },
        { label: 'Субъективный стресс', value: stressLevel !== null ? `${stressLevel}/10` : 'Не заполнен', status: 'neutral' }
      ],
      metrics: [
        { label: 'Сон', value: sleepDeltaMin !== null ? `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин к baseline` : (sleepFormatted || 'Нет данных') },
        { label: 'HRV', value: hrvValue !== null ? `${hrvValue} мс${hrvDeltaPct !== null ? ` (${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%)` : ''}` : 'Нет данных' },
        { label: 'Субъективный стресс', value: stressLevel !== null ? `${stressLevel}/10` : 'Не заполнен' }
      ]
    });
  }

  const hasRealHealthData = Boolean(recoveryScore !== null || hrvValue !== null || sleepActualMin !== null || currentStrain !== null);

  return {
    isWhoopConnected,
    hasRealHealthData,
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
        value: sleepBaselineSec ? Math.round(sleepBaselineSec / 60) : null,
        hours: sleepBaselineSec ? (sleepBaselineSec / 3600).toFixed(1) : null
      },
      available: hasHrvBaseline && hasRhrBaseline && hasSleepBaseline,
      sampleDays: Math.max(hrvCount, rhrCount, sleepCount)
    },
    readiness: {
      available: recoveryScore !== null,
      status: recoveryScore !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      score: recoveryScore,
      state: readinessState,
      advice: readinessAdvice
    },
    recovery: {
      available: recoveryScore !== null,
      status: recoveryScore !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      score: recoveryScore
    },
    hrv: {
      available: hrvValue !== null,
      status: hrvValue !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      value: hrvValue,
      baseline: hrvBaseline,
      deltaPct: hrvDeltaPct
    },
    rhr: {
      available: rhrValue !== null,
      status: rhrValue !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      value: rhrValue,
      baseline: rhrBaseline,
      deltaBpm: rhrDeltaBpm
    },
    sleep: {
      available: sleepActualMin !== null,
      status: sleepActualMin !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      score: sleepScore,
      durationSec: sleepDurationSec,
      durationFormatted: sleepFormatted,
      deltaMin: sleepDeltaMin
    },
    strain: {
      available: currentStrain !== null,
      status: currentStrain !== null ? 'REAL' : 'UNAVAILABLE',
      source: isWhoopConnected ? 'whoop' : null,
      score: currentStrain
    },
    nutrition: {
      hasLoggedMealsToday,
      caloriesConsumed: mealsTotals.calories,
      proteinConsumed: mealsTotals.protein,
      calorieGoal,
      proteinGoal,
      isCalorieGoalConfigured,
      isProteinGoalConfigured,
      caloriesRemaining: Math.max(0, calorieGoal - mealsTotals.calories),
      proteinRemaining: Math.max(0, proteinGoal - mealsTotals.protein)
    },
    rituals: {
      stressLevel,
      energyLevel,
      tags: journalTags
    },
    sources,
    findings,
    patterns: [],
    experiments: []
  };
}
