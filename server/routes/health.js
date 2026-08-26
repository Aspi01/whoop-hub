import express from 'express';
import { healthSourceRegistry } from '../health/healthSourceRegistry.js';
import { getTodayHealthSnapshot } from '../health/todayHealthSnapshot.js';
import { DEFAULT_SOURCE_PRIORITY_POLICY } from '../health/sourcePolicy.js';
import { run } from '../db.js';
import { normalizeAppleHealthMetricRecord } from '../health/adapters/appleHealthAdapter.js';

const router = express.Router();

router.get('/sources', async (req, res) => {
  try { res.json({ success: true, sources: await healthSourceRegistry.listSources() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/today', async (req, res) => {
  try { res.json({ success: true, snapshot: await getTodayHealthSnapshot(), priority_policy: DEFAULT_SOURCE_PRIORITY_POLICY }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Called only by the native shell after HealthKit has returned read samples.
// Raw HealthKit objects and credentials never cross this boundary.
router.post('/apple/sync', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.samples) ? req.body.samples : [];
    const samples = incoming.map(normalizeAppleHealthMetricRecord).filter(Boolean);
    for (const sample of samples) {
      if (!sample.source_record_id || !sample.recorded_at) continue;
      await run(`INSERT INTO health_samples (source, source_record_id, metric, value, unit, start_at, end_at, recorded_at, quality, provenance_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, source_record_id, metric) DO UPDATE SET value = excluded.value, unit = excluded.unit, start_at = excluded.start_at, end_at = excluded.end_at, recorded_at = excluded.recorded_at, quality = excluded.quality, provenance_json = excluded.provenance_json, synced_at = CURRENT_TIMESTAMP`,
      [sample.source, sample.source_record_id, sample.metric, sample.value, sample.unit, sample.start_at, sample.end_at, sample.recorded_at, sample.quality, JSON.stringify(sample.provenance)]);
    }
    res.json({ success: true, accepted: samples.length });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

export default router;
