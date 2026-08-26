import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNativeHealthBridge } from '../src/services/nativeHealthBridge.js';
import { createAppleHealthAdapter, deduplicateAppleHealthSamples, normalizeAppleHealthSample } from '../src/services/appleHealthAdapter.js';
import { applyCanonicalSamplesToToday, createCanonicalAppleHealthAIContext } from '../src/services/canonicalHealthSnapshot.js';
import { normalizeAppleHealthMetricRecord } from '../server/health/adapters/appleHealthAdapter.js';

const nativeCapacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
const webCapacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
const rawSdnn = { id: 'sdnn-1', metric: 'hrv_sdnn', value: 42, unit: 'ms', start_at: '2026-08-01T08:00:00.000Z', end_at: '2026-08-01T08:01:00.000Z', source_bundle: 'com.apple.health' };

// PWA/browser truth and bridge absence are separate, explicit states.
assert.equal((await createNativeHealthBridge({ capacitor: webCapacitor }).isAvailable()).state, 'REQUIRES_NATIVE_APP');
assert.equal((await createNativeHealthBridge({ capacitor: nativeCapacitor, plugin: { async isAvailable() { throw new Error('missing'); } } }).isAvailable()).state, 'UNAVAILABLE');

const plugin = {
  async isAvailable() { return { available: true }; },
  async getAuthorizationStatus() { return { state: 'NOT_REQUESTED', can_request: true }; },
  async requestAuthorization() { return { request_completed: true, state: 'PENDING_READ_VERIFICATION' }; },
  async readSamples({ metric }) { return metric === 'hrv_sdnn' ? { metric, samples: [rawSdnn, rawSdnn] } : { metric, samples: [] }; },
  async readWorkouts() { return { workouts: [{ id: 'workout-1', start_at: rawSdnn.start_at, end_at: rawSdnn.end_at, duration_minutes: 45, active_calories: 320 }] }; }
};
const bridge = createNativeHealthBridge({ capacitor: nativeCapacitor, plugin });
const persisted = [];
const adapter = createAppleHealthAdapter({ bridge, now: () => new Date('2026-08-02T00:00:00.000Z'), persistSamples: async samples => persisted.push(...samples) });
assert.equal((await adapter.getStatus()).connection_state, 'AVAILABLE');
assert.equal((await adapter.requestAuthorization()).state, 'PENDING_READ_VERIFICATION');
const sync = await adapter.sync({ metrics: ['hrv_sdnn'] });
assert.equal(sync.state, 'CONNECTED');
assert.equal(sync.samples.filter(sample => sample.metric === 'hrv_sdnn').length, 1, 'duplicate HealthKit UUID must not duplicate a sample');
assert.equal(sync.samples.find(sample => sample.metric === 'hrv_sdnn').provenance.source, 'apple_health');
assert.equal(sync.samples.some(sample => sample.metric === 'hrv_rmssd'), false, 'SDNN must never be mapped to RMSSD');
assert.equal(persisted.length, sync.samples.length);

const normalized = normalizeAppleHealthSample(rawSdnn);
assert.equal(normalized.metric, 'hrv_sdnn');
assert.equal(normalized.unit, 'ms');
assert.equal(deduplicateAppleHealthSamples([normalized, normalized]).length, 1);
assert.equal(normalizeAppleHealthMetricRecord({ ...normalized }).metric, 'hrv_sdnn');

const today = applyCanonicalSamplesToToday({ fields: { hrv_sdnn: { value: null, availability: 'UNAVAILABLE', timestamp: null } }, source_states: {} }, [normalized]);
assert.equal(today.fields.hrv_sdnn.value, 42);
assert.equal(today.fields.hrv_sdnn.source, 'apple_health');
assert.equal(createCanonicalAppleHealthAIContext(today).hrv_sdnn.source, 'apple_health');

const info = fs.readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
const entitlements = fs.readFileSync(new URL('../ios/App/App/App.entitlements', import.meta.url), 'utf8');
const nativeSource = fs.readFileSync(new URL('../ios/App/App/AppDelegate.swift', import.meta.url), 'utf8');
assert.match(info, /NSHealthShareUsageDescription/);
assert.doesNotMatch(info, /NSHealthUpdateUsageDescription/);
assert.match(entitlements, /com\.apple\.developer\.healthkit/);
assert.match(nativeSource, /toShare: \[\]/);
assert.match(nativeSource, /heartRateVariabilitySDNN/);
assert.doesNotMatch(nativeSource, /hrv_rmssd/);

console.log('PHASE_F3_QA=PASS');
