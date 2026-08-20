/**
 * Health Data Layer & Normalization Service
 * Unifies data across Wearables (Whoop, Apple Health, Garmin), Nutrition, Workouts, and Rituals.
 * Provides Personal Baseline calculations from real historical data only.
 * Ensures zero fabricated health intelligence (no fake patterns, experiments, or hardcoded baselines).
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

  // Check if primary wearable source is connected and has real data
  const isWhoopConnected = Boolean(whoopData?.isConnected);
  const hasRealHealthData = isWhoopConnected && current !== null;

  // 1. Calculate Real Personal 30-day Baseline from stored history records
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

  const hasSufficientBaseline = hrvCount >= 7;
  const hrvBaseline = hasSufficientBaseline ? Math.round(hrvSum / hrvCount) : null;
  const rhrBaseline = hasSufficientBaseline && rhrCount > 0 ? Math.round(rhrSum / rhrCount) : null;
  const sleepBaselineSec = hasSufficientBaseline && sleepCount > 0 ? Math.round((sleepSumMin / sleepCount) * 60) : null;

  // 2. Readiness / Recovery
  const rawRec = current?.recovery_score ?? readinessRaw.recovery_score ?? recoveryRaw.score ?? null;
  const recoveryScore = rawRec !== null ? Number(rawRec) : null;

  const rawHrv = current?.hrv ?? readinessRaw.hrv ?? metricsRaw.hrv ?? null;
  const hrvValue = rawHrv !== null ? Number(rawHrv) : null;

  const rawRhr = current?.rhr ?? readinessRaw.rhr ?? metricsRaw.rhr ?? null;
  const rhrValue = rawRhr !== null ? Number(rawRhr) : null;

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

  // 3. Sleep
  const rawSleepPct = current?.sleep_performance_pct ?? readinessRaw.sleep_score ?? sleepRaw.score ?? null;
  const sleepScore = rawSleepPct !== null ? Number(rawSleepPct) : null;

  const rawSleepMin = current?.sleep_actual_min ?? null;
  const sleepDurationSec = rawSleepMin !== null ? rawSleepMin * 60 : null;
  const sleepDeltaMin = (sleepDurationSec !== null && sleepBaselineSec !== null) ? Math.round((sleepDurationSec - sleepBaselineSec) / 60) : null;
  const sleepFormatted = rawSleepMin !== null ? `${Math.floor(rawSleepMin / 60)}ч ${rawSleepMin % 60}м` : null;

  // 4. Strain & Workouts
  const rawStrain = current?.strain ?? readinessRaw.day_strain ?? strainRaw.score ?? null;
  const currentStrain = rawStrain !== null ? Number(rawStrain) : null;

  // 5. Nutrition (Real App Nutrition Context)
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

  // 6. Rituals / Subjective
  const journalEntry = journalData?.entry || {};
  const stressLevel = journalEntry.stress_level ?? null;
  const energyLevel = journalEntry.energy_level ?? null;
  const journalTags = Array.isArray(journalEntry.tags) ? journalEntry.tags : [];

  // 7. Sources Metadata
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

  // 8. Structured Findings (Only when real recovery data is present)
  const findings = [];
  if (recoveryScore !== null) {
    findings.push({
      id: 'f_rec_trend',
      kicker: 'RECOVERY TREND',
      title: recoveryScore >= 67 ? 'Recovery держится в хорошей зоне' : 'Recovery снижен относительно обычной нормы',
      description: readinessAdvice,
      metrics: [
        { label: 'Сон относительно baseline', value: sleepDeltaMin !== null ? `${sleepDeltaMin >= 0 ? '+' : ''}${sleepDeltaMin} мин` : (sleepFormatted || '--') },
        { label: 'HRV', value: hrvValue !== null ? `${hrvValue} мс${hrvDeltaPct !== null ? ` (${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%)` : ''}` : '--' },
        { label: 'Субъективный стресс', value: stressLevel !== null ? `${stressLevel}/10` : 'Не заполнен' }
      ]
    });
  }

  // 9. Patterns & Experiments: Real Data Only (Empty array when insufficient history)
  const patterns = [];
  const experiments = [];

  return {
    isWhoopConnected,
    hasRealHealthData,
    baseline: {
      available: hasSufficientBaseline,
      status: hasSufficientBaseline ? 'REAL' : (history.length > 0 ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'),
      sampleCount: hrvCount,
      hrv: hrvBaseline,
      rhr: rhrBaseline,
      sleepHours: sleepBaselineSec ? (sleepBaselineSec / 3600).toFixed(1) : null
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
      available: sleepScore !== null,
      status: sleepScore !== null ? 'REAL' : 'UNAVAILABLE',
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
    patterns,
    experiments
  };
}
