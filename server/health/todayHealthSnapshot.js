import { getOne, query } from '../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_STATES, createUnavailableMetric } from './healthSourceModel.js';
import { healthSourceRegistry } from './healthSourceRegistry.js';
import { selectPrimaryAppleHealthSleepSession } from './appleHealthSleepSessionSelector.js';

export async function getTodayHealthSnapshot({ getLatestRecord = () => getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1'), getAppleRecords = () => query("SELECT * FROM health_samples WHERE source = 'apple_health' AND recorded_at >= datetime('now', '-1 day') ORDER BY recorded_at DESC"), registry = healthSourceRegistry, now = () => new Date() } = {}) {
  const generatedAt = now();
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
    const appleSamples = [];
    for (const record of await getAppleRecords()) {
      const sample = apple.normalize({ ...record, provenance: JSON.parse(record.provenance_json || '{}') });
      if (sample) appleSamples.push(sample);
    }
    for (const sample of appleSamples) {
      // Sleep uses the canonical primary-session selector below. Every other
      // metric keeps the established newest-sample behavior.
      if (sample.metric === 'sleep_duration') continue;
      const current = fields[sample.metric];
      if (!current.timestamp || new Date(sample.recorded_at) >= new Date(current.timestamp)) {
        fields[sample.metric] = { value: sample.value, unit: sample.unit, availability: 'REAL', source: sample.source, timestamp: sample.recorded_at, provenance: sample.provenance };
      }
    }
    const primarySleep = selectPrimaryAppleHealthSleepSession(appleSamples.filter(sample => sample.metric === 'sleep_duration'), generatedAt);
    // Whoop remains preferred if it already supplied current sleep. Apple
    // session selection resolves only Apple candidates within that policy.
    if (primarySleep && (fields.sleep_duration.availability !== 'REAL' || fields.sleep_duration.source === 'apple_health')) {
      fields.sleep_duration = { value: primarySleep.value, unit: primarySleep.unit, availability: 'REAL', source: primarySleep.source, timestamp: primarySleep.recorded_at, provenance: primarySleep.provenance };
    }
  }
  return { generated_at: generatedAt.toISOString(), normalization_version: 1, source_states: { whoop: whoopStatus?.connection_state || HEALTH_SOURCE_STATES.UNAVAILABLE, apple_health: appleStatus?.connection_state || HEALTH_SOURCE_STATES.UNAVAILABLE }, fields };
}
