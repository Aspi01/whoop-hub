import { query } from '../db.js';
import { getTodayHealthSnapshot } from './todayHealthSnapshot.js';
import { createWhoopHealthAdapter } from './adapters/whoopHealthAdapter.js';
import { createAppleHealthHealthAdapter } from './adapters/appleHealthAdapter.js';

/** Historical evidence remains available explicitly, even when a source is disconnected. */
export async function getCanonicalMetricHistory(metric, { limit = 30 } = {}) {
  const rows = await query('SELECT * FROM whoop_metrics ORDER BY date DESC LIMIT ?', [limit]);
  const whoop = createWhoopHealthAdapter();
  let appleRows = [];
  try {
    appleRows = await query('SELECT * FROM health_samples WHERE metric = ? ORDER BY recorded_at DESC LIMIT ?', [metric, limit]);
  } catch {
    // Additive table is initialized at normal server boot. Do not make an
    // uninitialized local/QA database fabricate native-source history.
    appleRows = [];
  }
  const apple = createAppleHealthHealthAdapter();
  return [
    ...rows.flatMap(row => whoop.normalize(row).filter(sample => sample.metric === metric)),
    ...appleRows.map(row => apple.normalize({ ...row, provenance: JSON.parse(row.provenance_json || '{}') })).filter(Boolean)
  ];
}

export async function getCanonicalTodayForAI(options = {}) {
  return getTodayHealthSnapshot(options);
}

function buildBaseline(samples) {
  const values = samples.map(sample => sample.value).filter(value => typeof value === 'number' && value > 0);
  const available = values.length >= 7;
  return {
    available,
    status: available ? 'REAL' : (values.length ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'),
    sampleCount: values.length,
    value: available ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  };
}

/** Canonical-only compatibility view for existing AI consumers. */
export async function getCanonicalAIReadModel(options = {}) {
  const snapshot = await getTodayHealthSnapshot(options);
  const [hrvSamples, rhrSamples, sleepSamples] = await Promise.all([
    getCanonicalMetricHistory('hrv_rmssd'),
    getCanonicalMetricHistory('resting_heart_rate'),
    getCanonicalMetricHistory('sleep_duration')
  ]);
  const hrv = buildBaseline(hrvSamples);
  const rhr = buildBaseline(rhrSamples);
  const sleep = buildBaseline(sleepSamples);
  const field = metric => snapshot.fields[metric];
  const hasCurrentData = Object.values(snapshot.fields).some(value => value.availability === 'REAL');
  const currentHrv = field('hrv_rmssd').value;
  const currentSleep = field('sleep_duration').value;
  return {
    snapshot,
    today: hasCurrentData ? {
      recoveryScore: field('recovery_score').value,
      state: field('recovery_score').value === null ? 'NO DATA' : field('recovery_score').value >= 67 ? 'GREEN / GOOD TO TRAIN' : field('recovery_score').value >= 34 ? 'YELLOW / MODERATE' : 'RED / RECOVERY FIRST',
      hrv: currentHrv,
      hrvBaseline: hrv.value,
      hrvDeltaPct: currentHrv !== null && hrv.value !== null ? `${Math.round(((currentHrv - hrv.value) / hrv.value) * 100) >= 0 ? '+' : ''}${Math.round(((currentHrv - hrv.value) / hrv.value) * 100)}%` : null,
      rhr: field('resting_heart_rate').value,
      rhrBaseline: rhr.value,
      sleepFormatted: currentSleep === null ? null : `${Math.floor(currentSleep / 60)}ч ${currentSleep % 60}м`,
      sleepScore: field('sleep_score').value,
      sleepDeltaVsBaselineMin: currentSleep !== null && sleep.value !== null ? `${currentSleep - sleep.value >= 0 ? '+' : ''}${currentSleep - sleep.value} мин` : null,
      strain: field('strain').value,
      provenance: snapshot.fields
    } : null,
    baseline: {
      hrv,
      rhr,
      sleep: { ...sleep, hours: sleep.value ? (sleep.value / 60).toFixed(1) : null },
      available: hrv.available && rhr.available && sleep.available,
      isBuilding: !hrv.available || !rhr.available || !sleep.available,
      sampleDays: Math.max(hrv.sampleCount, rhr.sampleCount, sleep.sampleCount)
    }
  };
}

export function createCanonicalAIHealthContext(snapshot) {
  return Object.fromEntries(Object.entries(snapshot.fields).map(([metric, field]) => [metric, {
    value: field.value,
    unit: field.unit,
    availability: field.availability,
    source: field.source,
    timestamp: field.timestamp,
    provenance: field.provenance
  }]));
}
