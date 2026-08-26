import { getOne } from '../../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_IDS, HEALTH_SOURCE_STATES, createNormalizedSample } from '../healthSourceModel.js';

const hasPositiveNumber = (value) => typeof value === 'number' && value > 0;
const hasNonNegativeNumber = (value) => typeof value === 'number' && value >= 0;
const recordTimestamp = (record) => record?.date ? `${record.date}T00:00:00.000Z` : null;

export function normalizeWhoopMetricRecord(record = {}) {
  const recorded_at = recordTimestamp(record);
  const source_record_id = record.id ? String(record.id) : record.date || null;
  const base = { source: HEALTH_SOURCE_IDS.WHOOP, source_record_id, recorded_at, quality: 'provider_recorded' };
  const candidates = [
    ['recovery_score', record.recovery_score, hasNonNegativeNumber, 'recovery_score'],
    ['sleep_duration', record.sleep_actual_min, hasPositiveNumber, 'sleep_actual_min'],
    ['sleep_score', record.sleep_performance_pct, hasPositiveNumber, 'sleep_performance_pct'],
    ['sleep_efficiency', record.sleep_efficiency_pct, hasPositiveNumber, 'sleep_efficiency_pct'],
    ['hrv_rmssd', record.hrv, hasPositiveNumber, 'hrv'],
    ['resting_heart_rate', record.rhr, hasPositiveNumber, 'rhr'],
    ['strain', record.strain, hasNonNegativeNumber, 'strain'],
    ['respiratory_rate', record.respiratory_rate, hasPositiveNumber, 'respiratory_rate']
  ];
  return candidates
    .filter(([, value, valid]) => valid(value))
    .map(([metric, value, , original_metric_name]) => createNormalizedSample({
      metric,
      value,
      unit: CANONICAL_METRICS[metric].unit,
      ...base,
      provenance: { original_metric_name, raw_timestamp: recorded_at }
    }));
}

export function createWhoopHealthAdapter({ getLatestRecord = () => getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1'), getAccessToken = () => getOne(`SELECT value FROM app_settings WHERE key = 'whoop_access_token'`) } = {}) {
  return {
    id: HEALTH_SOURCE_IDS.WHOOP,
    async getStatus() {
      const token = await getAccessToken();
      const latest = await getLatestRecord();
      const connected = Boolean(token?.value);
      return {
        id: HEALTH_SOURCE_IDS.WHOOP,
        display_name: 'WHOOP',
        platform: 'server_oauth',
        connection_state: connected ? HEALTH_SOURCE_STATES.CONNECTED : HEALTH_SOURCE_STATES.DISCONNECTED,
        capabilities: this.getCapabilities(),
        last_sync_at: recordTimestamp(latest),
        error_state: null,
        metadata: { normalization_version: 1 }
      };
    },
    getCapabilities() {
      return [
        ...['recovery_score', 'sleep_duration', 'sleep_score', 'hrv_rmssd', 'resting_heart_rate', 'strain']
          .map(metric => ({ metric, available: true, planned: false })),
        // These are not emitted by the current Whoop ingestion/storage path.
        { metric: 'sleep_efficiency', available: false, planned: true },
        { metric: 'respiratory_rate', available: false, planned: true }
      ];
    },
    async sync() { return { supported: true, delegated_to: 'whoop_routes' }; },
    normalize(raw) { return normalizeWhoopMetricRecord(raw); },
    async disconnect() { return { supported: false, reason: 'Use existing Whoop OAuth disconnect flow when introduced.' }; }
  };
}
