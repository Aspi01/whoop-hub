/**
 * Phase F2 canonical contracts. These objects never contain credentials or raw tokens.
 */
export const HEALTH_SOURCE_IDS = Object.freeze({
  WHOOP: 'whoop',
  APPLE_HEALTH: 'apple_health',
  HEALTH_CONNECT: 'health_connect',
  GARMIN: 'garmin',
  MANUAL: 'manual'
});

export const HEALTH_SOURCE_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  REQUIRES_NATIVE_APP: 'REQUIRES_NATIVE_APP',
  COMING_SOON: 'COMING_SOON',
  ERROR: 'ERROR',
  UNAVAILABLE: 'UNAVAILABLE'
});

export const CANONICAL_METRICS = Object.freeze({
  recovery_score: { unit: 'percent' },
  sleep_duration: { unit: 'minutes' },
  sleep_score: { unit: 'percent' },
  sleep_efficiency: { unit: 'percent' },
  hrv_rmssd: { unit: 'ms' },
  // Apple Health exposes SDNN. It is intentionally a distinct metric and is
  // never substituted for Whoop's RMSSD measurement.
  hrv_sdnn: { unit: 'ms' },
  resting_heart_rate: { unit: 'bpm' },
  strain: { unit: 'score' },
  steps: { unit: 'count' },
  active_calories: { unit: 'kcal' },
  spo2: { unit: 'percent' },
  skin_temperature: { unit: 'celsius' },
  respiratory_rate: { unit: 'breaths_per_minute' },
  workout_duration: { unit: 'minutes' },
  workout_calories: { unit: 'kcal' }
});

export const NORMALIZATION_VERSION = 1;

export function createUnavailableMetric(metric) {
  return {
    value: null,
    unit: CANONICAL_METRICS[metric]?.unit || null,
    availability: 'UNAVAILABLE',
    source: null,
    timestamp: null,
    provenance: null
  };
}

export function createNormalizedSample({ metric, value, unit, start_at = null, end_at = null, recorded_at, source, source_record_id = null, quality = 'unknown', provenance = {} }) {
  if (!CANONICAL_METRICS[metric]) throw new Error(`Unknown canonical health metric: ${metric}`);
  if (value === null || value === undefined) return null;
  return {
    metric,
    value,
    unit: unit || CANONICAL_METRICS[metric].unit,
    start_at,
    end_at,
    recorded_at: recorded_at || end_at || start_at || null,
    source,
    source_record_id,
    quality,
    provenance: {
      source,
      original_metric_name: provenance.original_metric_name || metric,
      source_record_id,
      raw_timestamp: provenance.raw_timestamp || recorded_at || end_at || start_at || null,
      normalization_version: NORMALIZATION_VERSION,
      ...provenance
    }
  };
}
