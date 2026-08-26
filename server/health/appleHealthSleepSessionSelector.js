// Canonical server dates are stored and queried as ISO/SQLite UTC timestamps.
// Keep primary sleep selection in that same convention rather than introducing
// an inconsistent secondary timezone model.
export const APPLE_MAIN_SLEEP_WINDOW = Object.freeze({ startHourUtc: 18, endHourUtc: 14, morningBoundaryHourUtc: 7, minimumMeaningfulMinutes: 90 });

function isValidSession(session) {
  return session?.metric === 'sleep_duration'
    && session?.source === 'apple_health'
    && Number.isFinite(Number(session.value))
    && new Date(session.start_at).getTime() < new Date(session.end_at).getTime();
}

function utcAt(referenceDate, dayOffset, hour) {
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate() + dayOffset, hour));
}

function overlaps(session, start, end) {
  return new Date(session.start_at) < end && new Date(session.end_at) > start;
}

/**
 * Selects the main Apple Health sleep episode for Today, not the latest sleep
 * sample. Candidates first need to overlap the previous-evening-to-current-
 * afternoon window. Meaningful sessions (>=90 min) outrank naps; then duration,
 * distance from the 07:00 UTC morning boundary, and stable timestamps/IDs make
 * the result deterministic regardless of database or array order.
 */
export function selectPrimaryAppleHealthSleepSession(sessions = [], referenceDate = new Date()) {
  const reference = new Date(referenceDate);
  if (!Number.isFinite(reference.getTime())) return null;
  const windowStart = utcAt(reference, -1, APPLE_MAIN_SLEEP_WINDOW.startHourUtc);
  const windowEnd = utcAt(reference, 0, APPLE_MAIN_SLEEP_WINDOW.endHourUtc);
  const morningBoundary = utcAt(reference, 0, APPLE_MAIN_SLEEP_WINDOW.morningBoundaryHourUtc);
  const relevant = sessions.filter(isValidSession).filter(session => overlaps(session, windowStart, windowEnd));
  if (!relevant.length) return null;
  const meaningful = relevant.filter(session => Number(session.value) >= APPLE_MAIN_SLEEP_WINDOW.minimumMeaningfulMinutes);
  const candidates = meaningful.length ? meaningful : relevant;
  return [...candidates].sort((left, right) => {
    const duration = Number(right.value) - Number(left.value);
    if (duration) return duration;
    const morningDistance = Math.abs(new Date(left.end_at) - morningBoundary) - Math.abs(new Date(right.end_at) - morningBoundary);
    if (morningDistance) return morningDistance;
    const endDelta = new Date(right.end_at) - new Date(left.end_at);
    if (endDelta) return endDelta;
    return String(left.source_record_id || '').localeCompare(String(right.source_record_id || ''));
  })[0];
}
