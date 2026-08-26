import express from 'express';
import { healthSourceRegistry } from '../health/healthSourceRegistry.js';
import { getTodayHealthSnapshot } from '../health/todayHealthSnapshot.js';
import { DEFAULT_SOURCE_PRIORITY_POLICY } from '../health/sourcePolicy.js';

const router = express.Router();

router.get('/sources', async (req, res) => {
  try { res.json({ success: true, sources: await healthSourceRegistry.listSources() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/today', async (req, res) => {
  try { res.json({ success: true, snapshot: await getTodayHealthSnapshot(), priority_policy: DEFAULT_SOURCE_PRIORITY_POLICY }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
