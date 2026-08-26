import express from 'express';
import { healthSourceRegistry } from '../health/healthSourceRegistry.js';
import { getTodayHealthSnapshot } from '../health/todayHealthSnapshot.js';
import { DEFAULT_SOURCE_PRIORITY_POLICY } from '../health/sourcePolicy.js';
import { getOne, run } from '../db.js';
import { normalizeAppleHealthMetricRecord } from '../health/adapters/appleHealthAdapter.js';

const ACCESS_STATES = new Set(['AVAILABLE', 'NO_DATA', 'DENIED_OR_UNAVAILABLE', 'RESTRICTED', 'ERROR', 'NOT_REQUESTED']);

function normalizeMetricResults(input) {
  return Object.fromEntries(Object.entries(input || {}).flatMap(([metric, outcome]) => {
    if (!outcome || !ACCESS_STATES.has(outcome.state)) return [];
    return [[metric, { state: outcome.state, reason: typeof outcome.reason === 'string' ? outcome.reason : null, sample_count: Number.isInteger(outcome.sample_count) ? outcome.sample_count : 0 }]];
  }));
}

const router = express.Router();

router.get('/sources', async (req, res) => {
  try { res.json({ success: true, sources: await healthSourceRegistry.listSources() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/today', async (req, res) => {
  try { res.json({ success: true, snapshot: await getTodayHealthSnapshot(), priority_policy: DEFAULT_SOURCE_PRIORITY_POLICY }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/apple/sync-state', async (req, res) => {
  try {
    const state = await getOne("SELECT source, last_successful_sync_at, source_state, metric_states_json FROM health_source_sync_state WHERE source = 'apple_health'");
    res.json({ success: true, last_successful_sync_at: state?.last_successful_sync_at || null, source_state: state?.source_state || 'REQUIRES_NATIVE_APP', metric_results: JSON.parse(state?.metric_states_json || '{}') });
  } catch (error) {
    // An additive migration may not have run in an isolated local harness yet.
    res.json({ success: true, last_successful_sync_at: null, source_state: 'REQUIRES_NATIVE_APP', metric_results: {} });
  }
});

// Called only by the native shell after HealthKit has returned read samples.
// Raw HealthKit objects and credentials never cross this boundary.
router.post('/apple/sync', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.samples) ? req.body.samples : [];
    const metricResults = normalizeMetricResults(req.body?.metric_results);
    const syncTo = typeof req.body?.sync_to === 'string' && Number.isFinite(new Date(req.body.sync_to).getTime()) ? new Date(req.body.sync_to).toISOString() : null;
    const sourceState = req.body?.source_state === 'PARTIALLY_CONNECTED' ? 'PARTIALLY_CONNECTED' : req.body?.source_state === 'CONNECTED' ? 'CONNECTED' : null;
    if (!syncTo || !sourceState || !Object.keys(metricResults).length) return res.status(400).json({ success: false, error: 'Invalid Apple Health sync checkpoint payload' });
    if (Object.values(metricResults).some(result => result.state === 'ERROR')) return res.status(409).json({ success: false, error: 'HealthKit query failed; checkpoint preserved' });
    const samples = incoming.map(normalizeAppleHealthMetricRecord).filter(Boolean);
    for (const sample of samples) {
      if (!sample.source_record_id || !sample.recorded_at) continue;
      await run(`INSERT INTO health_samples (source, source_record_id, metric, value, unit, start_at, end_at, recorded_at, quality, provenance_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, source_record_id, metric) DO UPDATE SET value = excluded.value, unit = excluded.unit, start_at = excluded.start_at, end_at = excluded.end_at, recorded_at = excluded.recorded_at, quality = excluded.quality, provenance_json = excluded.provenance_json, synced_at = CURRENT_TIMESTAMP`,
      [sample.source, sample.source_record_id, sample.metric, sample.value, sample.unit, sample.start_at, sample.end_at, sample.recorded_at, sample.quality, JSON.stringify(sample.provenance)]);
    }
    await run(`INSERT INTO health_source_sync_state (source, last_successful_sync_at, source_state, metric_states_json)
      VALUES ('apple_health', ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET last_successful_sync_at = excluded.last_successful_sync_at, source_state = excluded.source_state, metric_states_json = excluded.metric_states_json, updated_at = CURRENT_TIMESTAMP`, [syncTo, sourceState, JSON.stringify(metricResults)]);
    res.json({ success: true, accepted: samples.length, last_successful_sync_at: syncTo, source_state: sourceState });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

export default router;
