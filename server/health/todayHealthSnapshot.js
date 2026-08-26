import { getOne } from '../db.js';
import { CANONICAL_METRICS, createUnavailableMetric } from './healthSourceModel.js';
import { healthSourceRegistry } from './healthSourceRegistry.js';

export async function getTodayHealthSnapshot({ getLatestRecord = () => getOne('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT 1'), registry = healthSourceRegistry } = {}) {
  const fields = Object.fromEntries(Object.keys(CANONICAL_METRICS).map(metric => [metric, createUnavailableMetric(metric)]));
  const whoop = registry.getSource('whoop');
  const record = await getLatestRecord();
  if (record && whoop) {
    for (const sample of whoop.normalize(record)) {
      fields[sample.metric] = { value: sample.value, unit: sample.unit, availability: 'REAL', source: sample.source, timestamp: sample.recorded_at, provenance: sample.provenance };
    }
  }
  return { generated_at: new Date().toISOString(), normalization_version: 1, fields };
}
