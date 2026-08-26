import { nativeHealthBridge } from './nativeHealthBridge.js';

export const APPLE_HEALTH_METRICS = Object.freeze([
  'hrv_sdnn', 'resting_heart_rate', 'heart_rate', 'sleep_duration', 'steps',
  'active_calories', 'spo2', 'respiratory_rate'
]);

const CANONICAL_UNITS = Object.freeze({
  hrv_sdnn: 'ms', resting_heart_rate: 'bpm', heart_rate: 'bpm', sleep_duration: 'minutes',
  steps: 'count', active_calories: 'kcal', spo2: 'percent', respiratory_rate: 'breaths_per_minute',
  workout_duration: 'minutes', workout_calories: 'kcal'
});

export function appleHealthDedupKey(sample) {
  return `${sample.source || 'apple_health'}:${sample.source_record_id || sample.id}:${sample.metric}`;
}

export function deduplicateAppleHealthSamples(samples) {
  const seen = new Set();
  return samples.filter(sample => {
    const key = appleHealthDedupKey(sample);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeAppleHealthSample(raw, metric = raw?.metric) {
  if (!raw || !APPLE_HEALTH_METRICS.includes(metric)) return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    metric, value, unit: CANONICAL_UNITS[metric], start_at: raw.start_at || null,
    end_at: raw.end_at || null, recorded_at: raw.recorded_at || raw.end_at || raw.start_at || null,
    source: 'apple_health', source_record_id: raw.id || null, quality: 'source_reported',
    provenance: {
      source: 'apple_health',
      original_metric_name: metric === 'hrv_sdnn' ? 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' : metric,
      source_record_id: raw.id || null, raw_timestamp: raw.recorded_at || raw.end_at || raw.start_at || null,
      source_bundle: raw.source_bundle || null, normalization_version: 1
    }
  };
}

export function normalizeAppleHealthWorkouts(workouts = []) {
  return workouts.flatMap(workout => {
    const base = {
      source: 'apple_health', source_record_id: workout.id || null, start_at: workout.start_at || null,
      end_at: workout.end_at || null, recorded_at: workout.end_at || workout.start_at || null,
      quality: 'source_reported', provenance: {
        source: 'apple_health', original_metric_name: 'HKWorkout', source_record_id: workout.id || null,
        raw_timestamp: workout.end_at || workout.start_at || null, normalization_version: 1
      }
    };
    return [
      Number.isFinite(Number(workout.duration_minutes)) ? { ...base, metric: 'workout_duration', value: Number(workout.duration_minutes), unit: 'minutes' } : null,
      Number.isFinite(Number(workout.active_calories)) ? { ...base, metric: 'workout_calories', value: Number(workout.active_calories), unit: 'kcal' } : null
    ].filter(Boolean);
  });
}

export function createAppleHealthAdapter({ bridge = nativeHealthBridge, now = () => new Date(), getLastSync = () => null, setLastSync = () => {}, persistSamples = async () => ({ success: true }) } = {}) {
  return {
    id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native',
    getCapabilities() {
      return APPLE_HEALTH_METRICS.filter(metric => metric !== 'heart_rate').map(metric => ({ metric, available: bridge.isNativeRuntime(), planned: false }));
    },
    async getStatus() {
      const availability = await bridge.isAvailable();
      if (!availability.available) return { id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native', connection_state: availability.state, capabilities: this.getCapabilities(), last_sync_at: getLastSync(), error_state: null, metadata: { normalization_version: 1 } };
      const authorization = await bridge.getAuthorizationStatus(APPLE_HEALTH_METRICS);
      return { id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native', connection_state: authorization.state === 'NOT_REQUESTED' ? 'AVAILABLE' : 'DISCONNECTED', capabilities: this.getCapabilities(), last_sync_at: getLastSync(), error_state: null, metadata: { authorization, normalization_version: 1 } };
    },
    async requestAuthorization(metrics = APPLE_HEALTH_METRICS) { return bridge.requestAuthorization(metrics); },
    async sync({ from, to = now().toISOString(), metrics = APPLE_HEALTH_METRICS } = {}) {
      const availability = await bridge.isAvailable();
      if (!availability.available) return { samples: [], state: availability.state, synced: false };
      const start = from || getLastSync() || new Date(now().getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const responses = await Promise.all(metrics.map(metric => bridge.readSamples(metric, start, to)));
      const workouts = await bridge.readWorkouts(start, to);
      const samples = deduplicateAppleHealthSamples([
        ...responses.flatMap(response => (response?.samples || []).map(raw => normalizeAppleHealthSample(raw, response.metric)).filter(Boolean)),
        ...normalizeAppleHealthWorkouts(workouts?.workouts || [])
      ]);
      if (samples.length) await persistSamples(samples);
      setLastSync(to);
      return { samples, state: samples.length ? 'CONNECTED' : 'DISCONNECTED', synced: true, from: start, to };
    },
    normalize(raw, metric) { return normalizeAppleHealthSample(raw, metric); },
    async disconnect() { setLastSync(null); return { disconnected: true }; }
  };
}
