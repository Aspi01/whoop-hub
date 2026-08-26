/**
 * Phase F2 policy contracts only. Future preference/quality scoring can extend this
 * without changing provider adapters or Today consumers.
 */
export function getSampleDedupIdentity(sample) {
  return [
    sample.metric,
    sample.source,
    sample.source_record_id || '',
    sample.start_at || '',
    sample.end_at || '',
    sample.value
  ].join('|');
}

export function selectPreferredSample(samples = [], { preferredSource = null, sourcePriority = [] } = {}) {
  return [...samples].filter(Boolean).sort((left, right) => {
    const preferredDelta = Number(right.source === preferredSource) - Number(left.source === preferredSource);
    if (preferredDelta) return preferredDelta;
    const qualityDelta = String(right.quality || '').localeCompare(String(left.quality || ''));
    if (qualityDelta) return qualityDelta;
    const timestampDelta = String(right.recorded_at || '').localeCompare(String(left.recorded_at || ''));
    if (timestampDelta) return timestampDelta;
    return sourcePriority.indexOf(left.source) - sourcePriority.indexOf(right.source);
  })[0] || null;
}

export const DEFAULT_SOURCE_PRIORITY_POLICY = Object.freeze({
  order: ['explicit_user_preference', 'source_quality', 'newest_sample', 'deterministic_source_priority'],
  sourcePriority: ['whoop', 'apple_health', 'health_connect', 'garmin', 'manual'],
  note: 'Default only; product business priority is intentionally not finalized in F2.'
});
