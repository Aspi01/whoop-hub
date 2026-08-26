import { nativeHealthBridge } from './nativeHealthBridge.js';

export const APPLE_HEALTH_METRICS = Object.freeze([
  'hrv_sdnn', 'resting_heart_rate', 'sleep_duration', 'steps',
  'active_calories', 'spo2', 'respiratory_rate'
]);
export const SLEEP_SESSION_GAP_MINUTES = 90;
const BOOTSTRAP_DAYS = 90;
const CHECKPOINT_OVERLAP_MS = 60 * 60 * 1000;
const READABLE_STATES = new Set(['AVAILABLE', 'NO_DATA']);
const SLEEP_ASLEEP_STAGES = new Set([1, 3, 4, 5, 'asleep', 'asleep_unspecified', 'asleepcore', 'asleepdeep', 'asleeprem', 'core', 'deep', 'rem']);

const CANONICAL_UNITS = Object.freeze({
  hrv_sdnn: 'ms', resting_heart_rate: 'bpm', sleep_duration: 'minutes', steps: 'count',
  active_calories: 'kcal', spo2: 'percent', respiratory_rate: 'breaths_per_minute',
  workout_duration: 'minutes', workout_calories: 'kcal'
});

const iso = value => new Date(value).toISOString();
const validDate = value => Number.isFinite(new Date(value).getTime());

export function appleHealthDedupKey(sample) {
  return `${sample.source || 'apple_health'}:${sample.source_record_id || sample.id}:${sample.metric}`;
}

export function deduplicateAppleHealthSamples(samples) {
  const seen = new Set();
  return samples.filter(sample => {
    const key = appleHealthDedupKey(sample);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeAppleHealthSample(raw, metric = raw?.metric) {
  // Sleep intervals are source evidence, not daily sleep_duration. They are
  // consumed only by aggregateAppleHealthSleepSessions below.
  if (!raw || metric === 'sleep_duration' || !APPLE_HEALTH_METRICS.includes(metric)) return null;
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    metric, value, unit: CANONICAL_UNITS[metric], start_at: raw.start_at || null,
    end_at: raw.end_at || null, recorded_at: raw.recorded_at || raw.end_at || raw.start_at || null,
    source: 'apple_health', source_record_id: raw.id || null, quality: 'source_reported',
    provenance: {
      source: 'apple_health',
      original_metric_name: metric === 'hrv_sdnn' ? 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' : metric,
      source_record_id: raw.id || null, raw_timestamp: raw.recorded_at || raw.end_at || raw.start_at || null,
      source_bundle: raw.source_bundle || null, normalization_version: 1
    }
  };
}

export function normalizeAppleHealthWorkouts(workouts = []) {
  return workouts.flatMap(workout => {
    const base = {
      source: 'apple_health', source_record_id: workout.id || null, start_at: workout.start_at || null,
      end_at: workout.end_at || null, recorded_at: workout.end_at || workout.start_at || null,
      quality: 'source_reported', provenance: {
        source: 'apple_health', original_metric_name: 'HKWorkout', source_record_id: workout.id || null,
        raw_timestamp: workout.end_at || workout.start_at || null, normalization_version: 1
      }
    };
    return [
      Number.isFinite(Number(workout.duration_minutes)) ? { ...base, metric: 'workout_duration', value: Number(workout.duration_minutes), unit: 'minutes' } : null,
      Number.isFinite(Number(workout.active_calories)) ? { ...base, metric: 'workout_calories', value: Number(workout.active_calories), unit: 'kcal' } : null
    ].filter(Boolean);
  });
}

function isAsleepInterval(interval) {
  return SLEEP_ASLEEP_STAGES.has(interval?.sleep_stage) || SLEEP_ASLEEP_STAGES.has(String(interval?.sleep_stage || '').toLowerCase());
}

function unionDurationMinutes(intervals) {
  const ranges = intervals
    .map(interval => [new Date(interval.start_at).getTime(), new Date(interval.end_at).getTime()])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);
  let total = 0;
  let active = null;
  for (const range of ranges) {
    if (!active || range[0] > active[1]) {
      if (active) total += active[1] - active[0];
      active = range;
    } else {
      active[1] = Math.max(active[1], range[1]);
    }
  }
  if (active) total += active[1] - active[0];
  return Math.round(total / 60000);
}

/**
 * Groups asleep-stage intervals separated by no more than 90 minutes. The gap
 * groups a fragmented episode but is not counted as sleep; overlapping stage
 * intervals are unioned so wall-clock time is counted once.
 */
export function aggregateAppleHealthSleepSessions(intervals = []) {
  const asleep = intervals
    .filter(interval => isAsleepInterval(interval) && validDate(interval.start_at) && validDate(interval.end_at))
    .filter(interval => new Date(interval.end_at) > new Date(interval.start_at))
    .sort((left, right) => new Date(left.start_at) - new Date(right.start_at));
  const groups = [];
  for (const interval of asleep) {
    const group = groups.at(-1);
    if (!group || new Date(interval.start_at).getTime() - group.latestEnd > SLEEP_SESSION_GAP_MINUTES * 60000) {
      groups.push({ intervals: [interval], latestEnd: new Date(interval.end_at).getTime() });
    } else {
      group.intervals.push(interval);
      group.latestEnd = Math.max(group.latestEnd, new Date(interval.end_at).getTime());
    }
  }
  return groups.map(group => {
    const starts = group.intervals.map(interval => new Date(interval.start_at).getTime());
    const ends = group.intervals.map(interval => new Date(interval.end_at).getTime());
    const ids = group.intervals.map(interval => interval.id).filter(Boolean).sort();
    const start_at = iso(Math.min(...starts));
    const end_at = iso(Math.max(...ends));
    return {
      metric: 'sleep_duration', value: unionDurationMinutes(group.intervals), unit: 'minutes',
      start_at, end_at, recorded_at: end_at, source: 'apple_health',
      source_record_id: `sleep-session:${ids.join('|') || `${start_at}:${end_at}`}`,
      quality: 'source_aggregated',
      provenance: {
        source: 'apple_health', original_metric_name: 'HKCategoryTypeIdentifierSleepAnalysis',
        source_record_id: ids, raw_timestamp: end_at, normalization_version: 1,
        aggregation: 'asleep_interval_union', session_gap_minutes: SLEEP_SESSION_GAP_MINUTES,
        interval_count: group.intervals.length
      }
    };
  });
}

export function deriveAppleHealthSourceState(metricResults = {}) {
  const outcomes = Object.values(metricResults);
  const readable = outcomes.filter(result => READABLE_STATES.has(result.state)).length;
  const inaccessible = outcomes.filter(result => ['DENIED_OR_UNAVAILABLE', 'RESTRICTED', 'NOT_REQUESTED'].includes(result.state)).length;
  const errors = outcomes.filter(result => result.state === 'ERROR').length;
  if (!outcomes.length) return 'DISCONNECTED';
  if (readable && (inaccessible || errors)) return 'PARTIALLY_CONNECTED';
  if (readable) return 'CONNECTED';
  if (outcomes.every(result => result.state === 'NOT_REQUESTED')) return 'AUTH_REQUIRED';
  return errors ? 'ERROR' : 'DISCONNECTED';
}

export function getAppleHealthSyncStart({ checkpoint, now = new Date() }) {
  if (!checkpoint || !validDate(checkpoint)) return new Date(now.getTime() - BOOTSTRAP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return new Date(new Date(checkpoint).getTime() - CHECKPOINT_OVERLAP_MS).toISOString();
}

export function createAppleHealthAdapter({ bridge = nativeHealthBridge, now = () => new Date(), getLastSync = async () => null, setLastSync = async () => {}, persistSync = async () => ({ success: true }) } = {}) {
  return {
    id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native',
    getCapabilities() { return APPLE_HEALTH_METRICS.map(metric => ({ metric, available: bridge.isNativeRuntime(), planned: false })); },
    async getStatus() {
      const availability = await bridge.isAvailable();
      const checkpoint = await getLastSync();
      if (!availability.available) return { id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native', connection_state: availability.state, capabilities: this.getCapabilities(), last_sync_at: checkpoint, error_state: null, metadata: { normalization_version: 1 } };
      const authorization = await bridge.getAuthorizationStatus(APPLE_HEALTH_METRICS);
      return { id: 'apple_health', display_name: 'Apple Health', platform: 'ios_native', connection_state: authorization.state === 'NOT_REQUESTED' ? 'AUTH_REQUIRED' : 'AVAILABLE', capabilities: this.getCapabilities(), last_sync_at: checkpoint, error_state: null, metadata: { authorization, normalization_version: 1 } };
    },
    async requestAuthorization(metrics = APPLE_HEALTH_METRICS) { return bridge.requestAuthorization(metrics); },
    async sync({ from, to = now().toISOString(), metrics = APPLE_HEALTH_METRICS } = {}) {
      const availability = await bridge.isAvailable();
      if (!availability.available) return { samples: [], sourceState: availability.state, synced: false, metricResults: {} };
      const checkpoint = await getLastSync();
      const start = from || getAppleHealthSyncStart({ checkpoint, now: now() });
      const safeRead = async metric => {
        try { return await bridge.readSamples(metric, start, to); }
        catch { return { metric, state: 'ERROR', reason: 'bridge_error', samples: [] }; }
      };
      const responses = await Promise.all(metrics.map(safeRead));
      let workouts;
      try { workouts = await bridge.readWorkouts(start, to); } catch { workouts = { state: 'ERROR', reason: 'bridge_error', workouts: [] }; }
      const metricResults = Object.fromEntries(responses.map(response => [response.metric, { state: response.state || ((response.samples || []).length ? 'AVAILABLE' : 'NO_DATA'), reason: response.reason || null, sample_count: (response.samples || []).length }]));
      metricResults.workouts = { state: workouts.state || ((workouts.workouts || []).length ? 'AVAILABLE' : 'NO_DATA'), reason: workouts.reason || null, sample_count: (workouts.workouts || []).length };
      const sourceState = deriveAppleHealthSourceState(metricResults);
      if (Object.values(metricResults).some(result => result.state === 'ERROR')) return { samples: [], sourceState, synced: false, metricResults, from: start, to, failure_reason: 'bridge_read_failed' };
      const sleepIntervals = responses.find(response => response.metric === 'sleep_duration')?.samples || [];
      // Persist every aggregated session. Today applies the sole canonical
      // primary-session policy, while naps remain valid historical evidence.
      const sleepSessions = aggregateAppleHealthSleepSessions(sleepIntervals);
      const samples = deduplicateAppleHealthSamples([
        ...responses.flatMap(response => (response.samples || []).map(raw => normalizeAppleHealthSample(raw, response.metric)).filter(Boolean)),
        ...sleepSessions,
        ...normalizeAppleHealthWorkouts(workouts.workouts || [])
      ]);
      try {
        const persisted = await persistSync({ samples, metric_results: metricResults, source_state: sourceState, sync_to: to });
        if (!persisted?.success) throw new Error('persistence_failed');
        await setLastSync(persisted.last_successful_sync_at || to);
        return { samples, sourceState, synced: true, metricResults, from: start, to };
      } catch {
        return { samples, sourceState, synced: false, metricResults, from: start, to, failure_reason: 'persistence_failed' };
      }
    },
    normalize(raw, metric) { return normalizeAppleHealthSample(raw, metric); },
    async disconnect() { return { disconnected: true }; }
  };
}
