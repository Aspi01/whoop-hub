import { getOne } from '../../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_IDS, HEALTH_SOURCE_STATES, createNormalizedSample } from '../healthSourceModel.js';

const APPLE_METRICS = ['hrv_sdnn', 'resting_heart_rate', 'sleep_duration', 'steps', 'active_calories', 'spo2', 'respiratory_rate', 'workout_duration', 'workout_calories'];

export function normalizeAppleHealthMetricRecord(record = {}) {
  if (!APPLE_METRICS.includes(record.metric) || !CANONICAL_METRICS[record.metric]) return null;
  const value = Number(record.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return createNormalizedSample({
    metric: record.metric, value, unit: CANONICAL_METRICS[record.metric].unit,
    start_at: record.start_at || null, end_at: record.end_at || null,
    recorded_at: record.recorded_at || record.end_at || record.start_at || null,
    source: HEALTH_SOURCE_IDS.APPLE_HEALTH, source_record_id: record.source_record_id || record.id || null,
    quality: record.quality || 'source_reported',
    provenance: {
      ...(record.provenance || {}), original_metric_name: record.provenance?.original_metric_name || record.metric,
      raw_timestamp: record.recorded_at || record.end_at || record.start_at || null
    }
  });
}

export function createAppleHealthHealthAdapter({ getSyncState = () => getOne("SELECT * FROM health_source_sync_state WHERE source = 'apple_health'") } = {}) {
  return {
    id: HEALTH_SOURCE_IDS.APPLE_HEALTH,
    async getStatus() {
      let state = null;
      try { state = await getSyncState(); } catch { state = null; }
      const lastSync = state?.last_successful_sync_at || null;
      const fresh = lastSync && Date.now() - new Date(lastSync).getTime() < 24 * 60 * 60 * 1000;
      const persistedState = state?.source_state;
      const connection_state = fresh && persistedState === HEALTH_SOURCE_STATES.PARTIALLY_CONNECTED
        ? HEALTH_SOURCE_STATES.PARTIALLY_CONNECTED
        : fresh && persistedState === HEALTH_SOURCE_STATES.CONNECTED
        ? HEALTH_SOURCE_STATES.CONNECTED
        : HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP;
      const metricStates = JSON.parse(state?.metric_states_json || '{}');
      return {
        id: HEALTH_SOURCE_IDS.APPLE_HEALTH, display_name: 'Apple Health', platform: 'ios_native', connection_state,
        capabilities: this.getCapabilities(metricStates), last_sync_at: lastSync, error_state: null,
        metadata: { normalization_version: 1, read_only: true, metric_states: metricStates }
      };
    },
    getCapabilities(metricStates = {}) {
      return APPLE_METRICS.map(metric => ({ metric, available: ['AVAILABLE', 'NO_DATA'].includes(metricStates[metric]?.state), planned: false, access_state: metricStates[metric]?.state || 'NOT_REQUESTED' }));
    },
    async sync() { return { supported: true, delegated_to: 'ios_native_bridge' }; },
    normalize(raw) { return normalizeAppleHealthMetricRecord(raw); },
    async disconnect() { return { supported: false, reason: 'Disconnect is handled by removing Apple Health authorization in the iOS app.' }; }
  };
}
