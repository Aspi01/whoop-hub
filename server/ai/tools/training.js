import { query, getOne } from '../../db.js';

export const CANONICAL_EXERCISES = [
  {
    canonicalId: 'bench_press',
    displayName: 'Жим лёжа',
    aliases: [
      'bench press', 'bench', 'incline bench', 'flat bench', 'dumbbell bench', 'chest press',
      'жим', 'жима', 'жиме', 'жиму', 'жимом', 'жимов',
      'жим лёжа', 'жим лежа', 'жим гантелей', 'жим штанги', 'жим штанги лёжа', 'жим штанги лежа',
      'штанга лёжа', 'штанга лежа', 'жал', 'пожал', 'жал лёжа', 'жал лежа'
    ]
  },
  {
    canonicalId: 'squat',
    displayName: 'Приседания',
    aliases: [
      'squat', 'squats', 'back squat', 'front squat', 'leg press',
      'присед', 'приседа', 'приседе', 'приседу', 'приседом', 'приседаний',
      'приседания', 'приседание', 'приседания со штангой', 'приседал', 'поприседал'
    ]
  },
  {
    canonicalId: 'deadlift',
    displayName: 'Становая тяга',
    aliases: [
      'deadlift', 'deadlifts', 'romanian deadlift', 'rdl',
      'становая', 'становая тяга', 'тяга', 'тяги', 'тяге', 'тягу', 'тягой', 'тянул', 'потянул'
    ]
  },
  {
    canonicalId: 'pullup',
    displayName: 'Подтягивания',
    aliases: [
      'pullup', 'pullups', 'pull-up', 'chin-up', 'lat pulldown',
      'подтягивания', 'подтягиваний', 'подтягивание', 'подтягивался', 'тяга верхнего блока'
    ]
  }
];

export function resolveExerciseAlias(queryOrStoredName) {
  const clean = String(queryOrStoredName || '').toLowerCase().trim();
  if (!clean) return null;

  for (const item of CANONICAL_EXERCISES) {
    if (clean === item.canonicalId || clean === item.displayName.toLowerCase()) {
      return item;
    }
    for (const alias of item.aliases) {
      if (clean === alias || clean.includes(alias) || alias.includes(clean)) {
        return item;
      }
    }
  }

  return {
    canonicalId: clean.replace(/\s+/g, '_'),
    displayName: queryOrStoredName,
    aliases: [clean]
  };
}

export function isExerciseMatch(storedName, targetQuery) {
  const targetCanonical = resolveExerciseAlias(targetQuery);
  const storedCanonical = resolveExerciseAlias(storedName);

  if (targetCanonical && storedCanonical && targetCanonical.canonicalId === storedCanonical.canonicalId) {
    return true;
  }

  const s = String(storedName || '').toLowerCase();
  const q = String(targetQuery || '').toLowerCase();
  if (s.includes(q) || q.includes(s)) return true;

  if (targetCanonical) {
    for (const a of targetCanonical.aliases) {
      if (s.includes(a)) return true;
    }
  }

  return false;
}

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
      duration_min: w.duration_min,
      strain: w.strain,
      fatigueRpe: w.fatigue_rpe,
      exercises
    };
  });
}

export async function getExerciseHistory(exerciseName, limit = 5) {
  const workouts = await query('SELECT * FROM workouts ORDER BY id DESC LIMIT 20');
  const target = resolveExerciseAlias(exerciseName);
  const sessions = [];

  for (const w of workouts) {
    if (!w.exercises_json) continue;
    try {
      const exs = JSON.parse(w.exercises_json);
      const match = exs.find(e => e.name && isExerciseMatch(e.name, exerciseName));
      if (match) {
        sessions.push({
          date: w.date,
          workoutTitle: w.title,
          exercise: match.name,
          canonicalId: target?.canonicalId || 'exercise',
          sets: match.sets || [],
          topSetWeight: Math.max(...(match.sets || []).map(s => Number(s.weight) || 0), 0)
        });
      }
    } catch (e) {}
    if (sessions.length >= limit) break;
  }

  return sessions;
}
