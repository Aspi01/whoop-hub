import { query, getOne } from '../../db.js';

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const CANONICAL_EXERCISES = [
  {
    canonicalId: 'leg_press',
    displayName: 'Жим ногами',
    aliases: [
      'leg press', 'legpress',
      'жим ногами', 'жим ногами в платформе', 'жим платформы', 'жим ногами лежа', 'жим ногами сидя'
    ]
  },
  {
    canonicalId: 'shoulder_press',
    displayName: 'Армейский жим',
    aliases: [
      'overhead press', 'military press', 'shoulder press', 'ohp', 'dumbbell shoulder press',
      'армейский жим', 'жим стоя', 'жим штанги стоя', 'жим гантелей сидя', 'жим сидя', 'жим с плеч', 'жим штанги с груди стоя'
    ]
  },
  {
    canonicalId: 'bench_press',
    displayName: 'Жим лёжа',
    aliases: [
      'bench press', 'barbell bench press', 'incline bench press', 'flat bench press', 'dumbbell bench press', 'chest press',
      'жим лежа', 'жим штанги лежа', 'жим гантелей лежа', 'штанга лежа'
    ],
    queryRoots: ['жим', 'жима', 'жиме', 'жиму', 'жимом', 'жал', 'пожал', 'выжал']
  },
  {
    canonicalId: 'squat',
    displayName: 'Приседания',
    aliases: [
      'squat', 'squats', 'back squat', 'front squat', 'barbell squat',
      'присед', 'приседания', 'приседание', 'приседания со штангой', 'приседания со штангой на плечах'
    ],
    queryRoots: ['присед', 'приседа', 'приседе', 'приседу', 'приседом', 'приседал', 'поприседал']
  },
  {
    canonicalId: 'deadlift',
    displayName: 'Становая тяга',
    aliases: [
      'deadlift', 'deadlifts', 'romanian deadlift', 'rdl', 'barbell deadlift',
      'становая', 'становая тяга', 'мертвая тяга', 'румынская тяга'
    ],
    queryRoots: ['тяга', 'тяги', 'тяге', 'тягу', 'тягой', 'становая', 'тянул', 'потянул']
  },
  {
    canonicalId: 'pullup',
    displayName: 'Подтягивания',
    aliases: [
      'pullup', 'pullups', 'pull-up', 'chin-up', 'lat pulldown',
      'подтягивания', 'подтягиваний', 'подтягивание', 'тяга верхнего блока'
    ],
    queryRoots: ['подтягива', 'подтягивания', 'подтягивался']
  }
];

export function resolveStoredExerciseName(rawName) {
  const clean = normalizeText(rawName);
  if (!clean) return null;

  // 1. Exact alias match
  for (const item of CANONICAL_EXERCISES) {
    for (const alias of item.aliases) {
      if (clean === normalizeText(alias)) {
        return item;
      }
    }
  }

  // 2. Specific composite alias phrase matching (longer aliases evaluated first)
  const allAliases = [];
  for (const item of CANONICAL_EXERCISES) {
    for (const alias of item.aliases) {
      allAliases.push({ item, alias, norm: normalizeText(alias) });
    }
  }
  allAliases.sort((a, b) => b.norm.length - a.norm.length);

  for (const { item, norm } of allAliases) {
    if (norm.length >= 4) {
      const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${norm}(?![\\p{L}\\p{N}_])`, 'iu');
      if (regex.test(clean)) {
        return item;
      }
    }
  }

  return null;
}

export function resolveExerciseFromQuery(rawQuery) {
  const clean = normalizeText(rawQuery);
  if (!clean) return null;

  // 1. Leg Press
  if (/(?<![\p{L}\p{N}_])(ног|ногами|платформ[\p{L}]*)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'leg_press');
  }

  // 2. Shoulder Press
  if (/(?<![\p{L}\p{N}_])(армейск[\p{L}]*|плеч[\p{L}]*|жим стоя|жим сидя)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'shoulder_press');
  }

  // 3. Squat
  if (/(?<![\p{L}\p{N}_])(присед[\p{L}]*|приседа[\p{L}]*)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'squat');
  }

  // 4. Deadlift (specifically matching forms of 'становая', 'тяга', etc., without false positive on 'восстановление')
  if (/(?<![\p{L}\p{N}_])(станов(ая|ой|ую|а|ы)|тяг(а|и|е|у|ой|ам|ах)|тянул|потянул|deadlift[\p{L}]*)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'deadlift');
  }

  // 5. Pullup
  if (/(?<![\p{L}\p{N}_])(подтягив[\p{L}]*|pullup[\p{L}]*)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'pullup');
  }

  // 6. Bench Press
  if (/(?<![\p{L}\p{N}_])(жал|пожал|выжал|жим|жиме|жима|жиму|жимом|bench press)(?![\p{L}\p{N}_])/iu.test(clean)) {
    return CANONICAL_EXERCISES.find(e => e.canonicalId === 'bench_press');
  }

  return resolveStoredExerciseName(rawQuery);
}

export function resolveExerciseAlias(name) {
  const clean = normalizeText(name);
  if (!clean) return null;

  // Strict stored-name resolution only (NO fallthrough to conversational query resolution)
  const stored = resolveStoredExerciseName(name);
  if (stored) return stored;

  return {
    canonicalId: clean.replace(/\s+/g, '_'),
    displayName: name,
    aliases: [clean]
  };
}

export function isExerciseMatch(storedName, targetQueryOrExercise) {
  const storedCanonical = resolveStoredExerciseName(storedName);
  const targetCanonical = resolveStoredExerciseName(targetQueryOrExercise) || resolveExerciseFromQuery(targetQueryOrExercise);

  if (storedCanonical && targetCanonical) {
    return storedCanonical.canonicalId === targetCanonical.canonicalId;
  }

  const s = normalizeText(storedName);
  const q = normalizeText(targetQueryOrExercise);
  if (s && q && (s === q || (s.length >= 4 && q.length >= 4 && (s.includes(q) || q.includes(s))))) {
    return true;
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
  const target = resolveStoredExerciseName(exerciseName) || resolveExerciseFromQuery(exerciseName) || resolveExerciseAlias(exerciseName);
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
