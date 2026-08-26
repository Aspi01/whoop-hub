import { getCanonicalAIReadModel, getCanonicalMetricHistory } from '../../health/canonicalHealthReadService.js';

// Legacy-shaped helper retained for callers, but populated exclusively from canonical fields.
export async function getTodayStatus() {
  const readModel = await getCanonicalAIReadModel();
  return { available: Boolean(readModel.today), today: readModel.today, baseline: readModel.baseline };
}

export async function getHrvTrend(limit = 7) {
  return getCanonicalMetricHistory('hrv_rmssd', { limit });
}

export async function getSleepSummary(limit = 7) {
  return getCanonicalMetricHistory('sleep_duration', { limit });
}
