import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CANONICAL_METRICS, HEALTH_SOURCE_STATES, createNormalizedSample } from '../server/health/healthSourceModel.js';
import { createWhoopHealthAdapter, normalizeWhoopMetricRecord } from '../server/health/adapters/whoopHealthAdapter.js';
import { createHealthSourceRegistry } from '../server/health/healthSourceRegistry.js';
import { getTodayHealthSnapshot } from '../server/health/todayHealthSnapshot.js';
import { getSampleDedupIdentity, selectPreferredSample } from '../server/health/sourcePolicy.js';
import { createCanonicalAIHealthContext } from '../server/health/canonicalHealthReadService.js';

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

export async function runPhaseF21QA() {
  const retainedRecord = { id: 73, date: '2026-08-26', recovery_score: 71, rhr: 55, hrv: 60, sleep_actual_min: 420, sleep_performance_pct: 90, strain: 8.4 };
  const connectedAdapter = createWhoopHealthAdapter({
    getLatestRecord: async () => retainedRecord,
    getAccessToken: async () => ({ value: 'encrypted-token-placeholder' })
  });
  const disconnectedAdapter = { ...connectedAdapter, getStatus: async () => ({ connection_state: HEALTH_SOURCE_STATES.DISCONNECTED }) };
  const errorAdapter = { ...connectedAdapter, getStatus: async () => { throw new Error('status unavailable'); } };

  const disconnectedSnapshot = await getTodayHealthSnapshot({
    getLatestRecord: async () => retainedRecord,
    registry: { getSource: () => disconnectedAdapter }
  });
  for (const metric of ['recovery_score', 'resting_heart_rate', 'hrv_rmssd']) {
    assert.equal(disconnectedSnapshot.fields[metric].value, null);
    assert.equal(disconnectedSnapshot.fields[metric].availability, 'UNAVAILABLE');
  }
  assert.equal(disconnectedSnapshot.source_states.whoop, HEALTH_SOURCE_STATES.DISCONNECTED);

  const connectedSnapshot = await getTodayHealthSnapshot({
    getLatestRecord: async () => retainedRecord,
    registry: { getSource: () => connectedAdapter }
  });
  assert.equal(connectedSnapshot.fields.recovery_score.value, 71);
  assert.equal(connectedSnapshot.fields.recovery_score.availability, 'REAL');
  assert.equal(connectedSnapshot.fields.hrv_rmssd.value, 60);

  const errorSnapshot = await getTodayHealthSnapshot({
    getLatestRecord: async () => retainedRecord,
    registry: { getSource: () => errorAdapter }
  });
  assert.equal(errorSnapshot.source_states.whoop, HEALTH_SOURCE_STATES.ERROR);
  assert.ok(Object.values(errorSnapshot.fields).every(field => field.availability === 'UNAVAILABLE'));

  const capabilities = connectedAdapter.getCapabilities();
  assert.deepEqual(capabilities.find(capability => capability.metric === 'sleep_efficiency'), { metric: 'sleep_efficiency', available: false, planned: true });
  const emittedMetrics = new Set(connectedAdapter.normalize(retainedRecord).map(sample => sample.metric));
  for (const capability of capabilities.filter(capability => capability.available)) {
    assert.ok(emittedMetrics.has(capability.metric), `Available capability must emit: ${capability.metric}`);
  }

  const contextBuilderSource = fs.readFileSync(new URL('../server/ai/contextBuilder.js', import.meta.url), 'utf8');
  const healthToolSource = fs.readFileSync(new URL('../server/ai/tools/health.js', import.meta.url), 'utf8');
  assert.ok(!contextBuilderSource.includes('getTodayStatus'));
  assert.ok(!contextBuilderSource.includes('whoop_metrics'));
  assert.ok(!healthToolSource.includes('whoop_metrics'));
  const aiContext = createCanonicalAIHealthContext(disconnectedSnapshot);
  assert.equal(aiContext.recovery_score.value, null);
  assert.equal(aiContext.recovery_score.availability, 'UNAVAILABLE');
  assert.equal(aiContext.recovery_score.provenance, null);

  // Retained record remains intact; only current source eligibility changes exposure.
  assert.equal(retainedRecord.recovery_score, 71);
  assert.equal(retainedRecord.hrv, 60);
  console.log('PHASE_F21_QA=PASS');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/qa/run_phase_f2_qa.mjs')) {
  Promise.all([runPhaseF2QA(), runPhaseF21QA()]).catch(error => { console.error(error); process.exit(1); });
}
