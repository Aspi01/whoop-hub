// Provider-neutral client projection used by Today cards. It only consumes
// already-normalized samples, so no provider-specific raw payload reaches UI.
export function applyCanonicalSamplesToToday(snapshot, samples = []) {
  const fields = { ...(snapshot?.fields || {}) };
  for (const sample of samples) {
    if (!sample?.metric || sample.value === null || sample.value === undefined) continue;
    const current = fields[sample.metric];
    if (!current || !current.timestamp || new Date(sample.recorded_at) >= new Date(current.timestamp)) {
      fields[sample.metric] = { value: sample.value, unit: sample.unit, availability: 'REAL', source: sample.source, timestamp: sample.recorded_at, provenance: sample.provenance };
    }
  }
  return { ...snapshot, fields, source_states: { ...(snapshot?.source_states || {}), apple_health: samples.length ? 'CONNECTED' : snapshot?.source_states?.apple_health || 'UNAVAILABLE' } };
}

export function createCanonicalAppleHealthAIContext(snapshot) {
  return Object.fromEntries(Object.entries(snapshot?.fields || {}).map(([metric, field]) => [metric, {
    value: field?.value ?? null, unit: field?.unit ?? null, availability: field?.availability || 'UNAVAILABLE',
    source: field?.source || null, timestamp: field?.timestamp || null
  }]));
}
