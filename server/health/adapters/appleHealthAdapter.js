import { getOne, query } from '../../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_IDS, HEALTH_SOURCE_STATES, createNormalizedSample } from '../healthSourceModel.js';

const APPLE_METRICS = ['hrv_sdnn', 'resting_heart_rate', 'sleep_duration', 'steps', 'active_calories', 'spo2', 'respiratory_rate', 'workout_duration', 'workout_calories'];

export function normalizeAppleHealthMetricRecord(record = {}) {
  if (!APPLE_METRICS.includes(record.metric) || !CANONICAL_METRICS[record.metric]) return null;
  const value = Number(record.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return createNormalizedSample({
    metric: record.metric,
    value,
    unit: CANONICAL_METRICS[record.metric].unit,
    start_at: record.start_at || null,
    end_at: record.end_at || null,
    recorded_at: record.recorded_at || record.end_at || record.start_at || null,
    source: HEALTH_SOURCE_IDS.APPLE_HEALTH,
    source_record_id: record.source_record_id || record.id || null,
    quality: 'source_reported',
    provenance: {
      ...(record.provenance || {}),
      original_metric_name: record.provenance?.original_metric_name || record.metric,
      raw_timestamp: record.recorded_at || record.end_at || record.start_at || null
    }
  });
}

export function createAppleHealthHealthAdapter({ getLatestSync = () => getOne("SELECT MAX(synced_at) AS synced_at FROM health_samples WHERE source = 'apple_health'"), getRecentSamples = () => query("SELECT * FROM health_samples WHERE source = 'apple_health' ORDER BY recorded_at DESC") } = {}) {
  return {
    id: HEALTH_SOURCE_IDS.APPLE_HEALTH,
    async getStatus() {
      // Isolated QA and pre-migration databases may not have the additive
      // canonical table yet. They must truthfully remain native-required.
      let latest = null;
      try { latest = await getLatestSync(); } catch { latest = null; }
      const lastSync = latest?.synced_at || null;
      const connected = lastSync && Date.now() - new Date(lastSync).getTime() < 24 * 60 * 60 * 1000;
      return {
        id: HEALTH_SOURCE_IDS.APPLE_HEALTH,
        display_name: 'Apple Health',
        platform: 'ios_native',
        connection_state: connected ? HEALTH_SOURCE_STATES.CONNECTED : HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP,
        capabilities: this.getCapabilities(),
        last_sync_at: lastSync,
        error_state: null,
        metadata: { normalization_version: 1, read_only: true }
      };
    },
    getCapabilities() { return APPLE_METRICS.map(metric => ({ metric, available: true, planned: false })); },
    async sync() { return { supported: true, delegated_to: 'ios_native_bridge' }; },
    normalize(raw) { return normalizeAppleHealthMetricRecord(raw); },
    async getTodaySamples() { return (await getRecentSamples()).map(this.normalize).filter(Boolean); },
    async disconnect() { return { supported: false, reason: 'Disconnect is handled by removing Apple Health authorization in the iOS app.' }; }
  };
}
