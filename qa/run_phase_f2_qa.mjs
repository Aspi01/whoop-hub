import assert from 'node:assert/strict';
import { CANONICAL_METRICS, HEALTH_SOURCE_STATES, createNormalizedSample } from '../server/health/healthSourceModel.js';
import { createWhoopHealthAdapter, normalizeWhoopMetricRecord } from '../server/health/adapters/whoopHealthAdapter.js';
import { createHealthSourceRegistry } from '../server/health/healthSourceRegistry.js';
import { getTodayHealthSnapshot } from '../server/health/todayHealthSnapshot.js';
import { getSampleDedupIdentity, selectPreferredSample } from '../server/health/sourcePolicy.js';

export async function runPhaseF2QA() {
  assert.ok(CANONICAL_METRICS.recovery_score);
  assert.ok(CANONICAL_METRICS.workout_calories);

  const partialRecord = { id: 42, date: '2026-08-26', recovery_score: 71, rhr: 49, hrv: null, sleep_actual_min: null, strain: 8.4 };
  const normalized = normalizeWhoopMetricRecord(partialRecord);
  const hrv = normalized.find(sample => sample.metric === 'hrv_rmssd');
  const recovery = normalized.find(sample => sample.metric === 'recovery_score');
  assert.equal(hrv, undefined);
  assert.equal(recovery.provenance.source, 'whoop');
  assert.equal(recovery.provenance.original_metric_name, 'recovery_score');
  assert.equal(recovery.provenance.normalization_version, 1);

  const whoop = createWhoopHealthAdapter({
    getLatestRecord: async () => partialRecord,
    getAccessToken: async () => ({ value: 'encrypted-token-placeholder' })
  });
  const registry = createHealthSourceRegistry({ whoopAdapter: whoop });
  const sourceStatuses = await registry.listSources();
  assert.equal(sourceStatuses.find(source => source.id === 'whoop').connection_state, HEALTH_SOURCE_STATES.CONNECTED);
  assert.equal(sourceStatuses.find(source => source.id === 'apple_health').connection_state, HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP);
  assert.equal(sourceStatuses.find(source => source.id === 'health_connect').connection_state, HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP);
  assert.equal(sourceStatuses.find(source => source.id === 'garmin').connection_state, HEALTH_SOURCE_STATES.COMING_SOON);

  const snapshot = await getTodayHealthSnapshot({ getLatestRecord: async () => partialRecord, registry });
  assert.equal(snapshot.fields.recovery_score.value, 71);
  assert.equal(snapshot.fields.recovery_score.source, 'whoop');
  assert.equal(snapshot.fields.resting_heart_rate.value, 49);
  assert.equal(snapshot.fields.hrv_rmssd.value, null);
  assert.equal(snapshot.fields.hrv_rmssd.availability, 'UNAVAILABLE');
  assert.equal(snapshot.fields.steps.value, null);

  const noSourceSnapshot = await getTodayHealthSnapshot({
    getLatestRecord: async () => null,
    registry: { getSource: () => null }
  });
  assert.ok(Object.values(noSourceSnapshot.fields).every(field => field.value === null && field.availability === 'UNAVAILABLE'));

  const first = createNormalizedSample({ metric: 'hrv_rmssd', value: 54, source: 'whoop', source_record_id: '1', recorded_at: '2026-08-26T08:00:00Z' });
  const second = createNormalizedSample({ metric: 'hrv_rmssd', value: 54, source: 'whoop', source_record_id: '1', recorded_at: '2026-08-26T08:00:00Z' });
  assert.equal(getSampleDedupIdentity(first), getSampleDedupIdentity(second));
  const preferred = selectPreferredSample([
    { ...first, source: 'manual', recorded_at: '2026-08-26T09:00:00Z' },
    first
  ], { preferredSource: 'whoop', sourcePriority: ['whoop', 'manual'] });
  assert.equal(preferred.source, 'whoop');

  console.log('PHASE_F2_QA=PASS');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/qa/run_phase_f2_qa.mjs')) {
  runPhaseF2QA().catch(error => { console.error(error); process.exit(1); });
}
