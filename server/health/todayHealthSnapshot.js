import { getOne } from '../db.js';
import { CANONICAL_METRICS, HEALTH_SOURCE_STATES, createUnavailableMetric } from './healthSourceModel.js';
import { healthSourceRegistry } from './healthSourceRegistry.js';

export async function getTodayHealthSnapshot({ getLatestRecord = () => getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1'), registry = healthSourceRegistry } = {}) {
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
  return { generated_at: new Date().toISOString(), normalization_version: 1, source_states: { whoop: whoopStatus?.connection_state || HEALTH_SOURCE_STATES.UNAVAILABLE }, fields };
}
