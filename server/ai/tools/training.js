import { query, getOne } from '../../db.js';

export async function getRecentWorkouts(limit = 5) {
  const workouts = await query('SELECT * FROM workouts ORDER BY id DESC LIMIT ?', [limit]);
  return workouts.map(w => {
    let exercises = [];
    if (w.exercises_json) {
      try { exercises = JSON.parse(w.exercises_json); } catch (e) {}
    }
    return {
      id: w.id,
      date: w.date,
      title: w.title,
      type: w.type,
      strain: w.strain,
      fatigueRpe: w.fatigue_rpe,
      exercises
    };
  });
}

export async function getExerciseHistory(exerciseName, limit = 5) {
  const workouts = await query('SELECT * FROM workouts ORDER BY id DESC LIMIT 20');
  const search = String(exerciseName || '').toLowerCase();
  const sessions = [];

  for (const w of workouts) {
    if (!w.exercises_json) continue;
    try {
      const exs = JSON.parse(w.exercises_json);
      const match = exs.find(e => e.name && e.name.toLowerCase().includes(search));
      if (match) {
        sessions.push({
          date: w.date,
          workoutTitle: w.title,
          exercise: match.name,
          sets: match.sets || [],
          topSetWeight: Math.max(...(match.sets || []).map(s => s.weight || 0), 0)
        });
      }
    } catch (e) {}
    if (sessions.length >= limit) break;
  }

  return sessions;
}
