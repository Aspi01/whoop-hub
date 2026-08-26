import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNativeHealthBridge } from '../src/services/nativeHealthBridge.js';
import { aggregateAppleHealthSleepSessions, createAppleHealthAdapter, deriveAppleHealthSourceState, getAppleHealthSyncStart, selectPrimaryAppleHealthSleepSession } from '../src/services/appleHealthAdapter.js';
import { applyCanonicalSamplesToToday } from '../src/services/canonicalHealthSnapshot.js';
import { createCanonicalAIHealthContext } from '../server/health/canonicalHealthReadService.js';
import { getTodayHealthSnapshot } from '../server/health/todayHealthSnapshot.js';
import { HEALTH_SOURCE_STATES } from '../server/health/healthSourceModel.js';
import { createAppleHealthHealthAdapter } from '../server/health/adapters/appleHealthAdapter.js';

const nativeCapacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
const webCapacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
const at = (hour, minute = 0) => `2026-08-01T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
const asleep = (id, start, end, stage = 1) => ({ id, metric: 'sleep_duration', start_at: start, end_at: end, recorded_at: end, sleep_stage: stage, source_bundle: 'com.apple.health' });

assert.equal((await createNativeHealthBridge({ capacitor: webCapacitor }).isAvailable()).state, 'REQUIRES_NATIVE_APP');
assert.equal((await createNativeHealthBridge({ capacitor: nativeCapacitor, plugin: { async isAvailable() { throw new Error('missing'); } } }).isAvailable()).state, 'UNAVAILABLE');

const rawSdnn = { id: 'sdnn-1', metric: 'hrv_sdnn', value: 42, start_at: at(0), end_at: at(0, 1), source_bundle: 'com.apple.health' };
const partialPlugin = {
  async isAvailable() { return { available: true }; },
  async getAuthorizationStatus() { return { state: 'REQUEST_NOT_NEEDED', can_request: false }; },
  async requestAuthorization() { return { request_completed: true, state: 'PENDING_READ_VERIFICATION' }; },
  async readSamples({ metric }) {
    if (metric === 'steps') return { metric, state: 'AVAILABLE', samples: [{ id: 'steps-1', value: 9000, start_at: at(0), end_at: at(1) }] };
    if (metric === 'sleep_duration') return { metric, state: 'DENIED_OR_UNAVAILABLE', reason: 'denied_or_unavailable', samples: [] };
    if (metric === 'hrv_sdnn') return { metric, state: 'DENIED_OR_UNAVAILABLE', reason: 'denied_or_unavailable', samples: [] };
    return { metric, state: 'NO_DATA', samples: [] };
  },
  async readWorkouts() { return { state: 'AVAILABLE', workouts: [{ id: 'workout-1', start_at: at(2), end_at: at(3), duration_minutes: 60, active_calories: 420 }] }; }
};
const partialAdapter = createAppleHealthAdapter({ bridge: createNativeHealthBridge({ capacitor: nativeCapacitor, plugin: partialPlugin }), persistSync: async payload => ({ success: true, last_successful_sync_at: payload.sync_to }) });
const partialSync = await partialAdapter.sync({ metrics: ['steps', 'sleep_duration', 'hrv_sdnn'], to: '2026-08-01T12:00:00.000Z' });
assert.equal(partialSync.sourceState, 'PARTIALLY_CONNECTED');
assert.equal(partialSync.metricResults.steps.state, 'AVAILABLE');
assert.equal(partialSync.metricResults.workouts.state, 'AVAILABLE');
assert.equal(partialSync.metricResults.sleep_duration.state, 'DENIED_OR_UNAVAILABLE');
assert.equal(partialSync.metricResults.hrv_sdnn.state, 'DENIED_OR_UNAVAILABLE');
assert.equal(partialSync.synced, true);
assert.equal(deriveAppleHealthSourceState({ a: { state: 'RESTRICTED' } }), 'DISCONNECTED');
assert.equal(deriveAppleHealthSourceState({ a: { state: 'ERROR' } }), 'ERROR');
const persistedStatusAdapter = createAppleHealthHealthAdapter({ getSyncState: async () => ({
  last_successful_sync_at: new Date().toISOString(), source_state: 'PARTIALLY_CONNECTED',
  metric_states_json: JSON.stringify({ steps: { state: 'AVAILABLE' }, sleep_duration: { state: 'DENIED_OR_UNAVAILABLE' } })
}) });
const persistedStatus = await persistedStatusAdapter.getStatus();
assert.equal(persistedStatus.connection_state, 'PARTIALLY_CONNECTED');
assert.equal(persistedStatus.capabilities.find(capability => capability.metric === 'steps').available, true);
assert.equal(persistedStatus.capabilities.find(capability => capability.metric === 'sleep_duration').available, false);

let checkpoint = null;
const syncCalls = [];
const checkpointPlugin = {
  async isAvailable() { return { available: true }; }, async getAuthorizationStatus() { return { state: 'REQUEST_NOT_NEEDED' }; },
  async readSamples({ metric, from }) { syncCalls.push({ metric, from }); return { metric, state: 'AVAILABLE', samples: metric === 'hrv_sdnn' ? [rawSdnn] : [] }; },
  async readWorkouts() { return { state: 'NO_DATA', workouts: [] }; }
};
const makeCheckpointAdapter = (persistSync) => createAppleHealthAdapter({
  bridge: createNativeHealthBridge({ capacitor: nativeCapacitor, plugin: checkpointPlugin }),
  now: () => new Date('2026-08-01T12:00:00.000Z'), getLastSync: async () => checkpoint,
  setLastSync: async value => { checkpoint = value; }, persistSync
});
const first = await makeCheckpointAdapter(async payload => ({ success: true, last_successful_sync_at: payload.sync_to })).sync({ metrics: ['hrv_sdnn'], to: '2026-08-01T12:00:00.000Z' });
assert.equal(first.synced, true);
assert.equal(checkpoint, '2026-08-01T12:00:00.000Z');
assert.equal(syncCalls[0].from, getAppleHealthSyncStart({ checkpoint: null, now: new Date('2026-08-01T12:00:00.000Z') }));
const restart = await makeCheckpointAdapter(async payload => ({ success: true, last_successful_sync_at: payload.sync_to })).sync({ metrics: ['hrv_sdnn'], to: '2026-08-02T12:00:00.000Z' });
assert.equal(restart.from, '2026-08-01T11:00:00.000Z');
assert.equal(checkpoint, '2026-08-02T12:00:00.000Z');
const failed = await makeCheckpointAdapter(async () => ({ success: false })).sync({ metrics: ['hrv_sdnn'], to: '2026-08-03T12:00:00.000Z' });
assert.equal(failed.synced, false);
assert.equal(failed.failure_reason, 'persistence_failed');
assert.equal(checkpoint, '2026-08-02T12:00:00.000Z');

const primary = selectPrimaryAppleHealthSleepSession(aggregateAppleHealthSleepSessions([
  asleep('sleep-a', at(0), at(6)), asleep('awake', at(6), at(6, 30), 2), asleep('short-secondary', at(9), at(9, 30))
]));
assert.equal(primary.value, 360, 'awake/short secondary interval cannot replace the overnight session');
const overlap = selectPrimaryAppleHealthSleepSession(aggregateAppleHealthSleepSessions([
  asleep('core', at(0), at(2), 3), asleep('deep', at(1), at(1, 30), 4)
]));
assert.equal(overlap.value, 120, 'overlapping stages count wall-clock time once');
const fragmented = selectPrimaryAppleHealthSleepSession(aggregateAppleHealthSleepSessions([
  asleep('fragment-1', '2026-08-01T23:30:00.000Z', '2026-08-02T03:00:00.000Z'), asleep('fragment-2', '2026-08-02T03:20:00.000Z', '2026-08-02T06:30:00.000Z')
]));
assert.equal(fragmented.value, 400);
assert.equal(fragmented.provenance.interval_count, 2);

const apple = { id: 'apple_health', async getStatus() { return { connection_state: HEALTH_SOURCE_STATES.PARTIALLY_CONNECTED }; }, normalize: record => record };
const whoop = { id: 'whoop', async getStatus() { return { connection_state: HEALTH_SOURCE_STATES.CONNECTED }; }, normalize: () => [{ metric: 'recovery_score', value: 71, unit: 'percent', source: 'whoop', recorded_at: at(7), provenance: { source: 'whoop' } }] };
const snapshot = await getTodayHealthSnapshot({ registry: { getSource: id => id === 'whoop' ? whoop : id === 'apple_health' ? apple : null }, getLatestRecord: async () => ({}), getAppleRecords: async () => [
  primary, { metric: 'steps', value: 9000, unit: 'count', source: 'apple_health', recorded_at: at(8), provenance: { source: 'apple_health' } }
] });
assert.equal(snapshot.fields.recovery_score.source, 'whoop');
assert.equal(snapshot.fields.steps.source, 'apple_health');
assert.equal(snapshot.fields.sleep_duration.value, 360);
assert.equal(createCanonicalAIHealthContext(snapshot).sleep_duration.value, 360);
const clientToday = applyCanonicalSamplesToToday({ fields: { sleep_duration: { value: null, availability: 'UNAVAILABLE', timestamp: null } } }, [primary]);
assert.equal(clientToday.fields.sleep_duration.value, 360);

const dbSource = fs.readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../server/routes/health.js', import.meta.url), 'utf8');
const nativeSource = fs.readFileSync(new URL('../ios/App/App/AppDelegate.swift', import.meta.url), 'utf8');
assert.match(dbSource, /health_source_sync_state/);
assert.match(routeSource, /last_successful_sync_at/);
assert.match(nativeSource, /DENIED_OR_UNAVAILABLE/);
assert.doesNotMatch(nativeSource, /toShare: \[[^\]]+\]/);

console.log('PHASE_F31_QA=PASS');
