import { getOne, query } from '../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_STATES, createUnavailableMetric } from './healthSourceModel.js';
import { healthSourceRegistry } from './healthSourceRegistry.js';

export async function getTodayHealthSnapshot({ getLatestRecord = () => getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1'), getAppleRecords = () => query("SELECT * FROM health_samples WHERE source = 'apple_health' AND recorded_at >= datetime('now', '-1 day') ORDER BY recorded_at DESC"), registry = healthSourceRegistry } = {}) {
  const fields = Object.fromEntries(Object.keys(CANONICAL_METRICS).map(metric => [metric, createUnavailableMetric(metric)]));
  const whoop = registry.getSource('whoop');
  let whoopStatus = null;
  try {
    whoopStatus = whoop ? await whoop.getStatus() : null;
  } catch {
    whoopStatus = { connection_state: HEALTH_SOURCE_STATES.ERROR };
  }
  // Current truth fails closed: retained records are historical evidence, not
  // current health data, unless the source is currently connected.
  if (whoopStatus?.connection_state === HEALTH_SOURCE_STATES.CONNECTED) {
    const record = await getLatestRecord();
    for (const sample of whoop.normalize(record)) {
      fields[sample.metric] = { value: sample.value, unit: sample.unit, availability: 'REAL', source: sample.source, timestamp: sample.recorded_at, provenance: sample.provenance };
    }
  }
  const apple = registry.getSource('apple_health');
  let appleStatus = null;
  // Registry test doubles may return one adapter for every source. Only the
  // Apple adapter is allowed to make Apple-native samples visible.
  if (apple?.id === 'apple_health') {
    try { appleStatus = await apple.getStatus(); } catch { appleStatus = { connection_state: HEALTH_SOURCE_STATES.ERROR }; }
  }
  if (apple?.id === 'apple_health' && [HEALTH_SOURCE_STATES.CONNECTED, HEALTH_SOURCE_STATES.PARTIALLY_CONNECTED].includes(appleStatus?.connection_state)) {
    for (const record of await getAppleRecords()) {
      const sample = apple.normalize({ ...record, provenance: JSON.parse(record.provenance_json || '{}') });
      if (!sample) continue;
      const current = fields[sample.metric];
      if (!current.timestamp || new Date(sample.recorded_at) >= new Date(current.timestamp)) {
        fields[sample.metric] = { value: sample.value, unit: sample.unit, availability: 'REAL', source: sample.source, timestamp: sample.recorded_at, provenance: sample.provenance };
      }
    }
  }
  return { generated_at: new Date().toISOString(), normalization_version: 1, source_states: { whoop: whoopStatus?.connection_state || HEALTH_SOURCE_STATES.UNAVAILABLE, apple_health: appleStatus?.connection_state || HEALTH_SOURCE_STATES.UNAVAILABLE }, fields };
}
