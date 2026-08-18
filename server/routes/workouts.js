import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const STANDARD_PRESETS = [
  'Жим гантелей лежа',
  'Жим штанги лежа',
  'Жим гантелей под углом',
  'Приседания со штангой',
  'Становая тяга',
  'Подтягивания с весом',
  'Тяга штанги в наклоне',
  'Тяга верхнего блока',
  'Армейский жим стоя',
  'Махи гантелями в стороны',
  'Отжимания на брусьях',
  'Подъем на бицепс со штангой',
  'Молотки с гантелями',
  'Французский жим',
  'Разгибания ног в тренажере',
  'Сгибания ног лежа',
  'Жим ногами в платформе',
  'Скручивания на пресс'
];

// 🏋️‍♂️ 1. Список всех тренировок
router.get('/', async (req, res) => {
  try {
    const workouts = await query(`
      SELECT * FROM workouts 
      ORDER BY date DESC, id DESC LIMIT 30
    `);

    const formatted = workouts.map(w => ({
      ...w,
      exercises: w.exercises_json ? JSON.parse(w.exercises_json) : []
    }));

    res.json({ success: true, workouts: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 1.1 Пресеты упражнений (из истории пользователя + стандартные)
router.get('/presets', async (req, res) => {
  try {
    const workouts = await query(`SELECT exercises_json FROM workouts ORDER BY id DESC LIMIT 50`);
    const historySet = new Set();
    const lastSetsMap = {};

    workouts.forEach(w => {
      if (!w.exercises_json) return;
      try {
        const exercises = JSON.parse(w.exercises_json);
        exercises.forEach(ex => {
          if (ex.name && ex.name.trim()) {
            const cleanName = ex.name.trim();
            historySet.add(cleanName);
            if (!lastSetsMap[cleanName] && ex.sets?.length > 0) {
              lastSetsMap[cleanName] = ex.sets;
            }
          }
        });
      } catch (e) {}
    });

    const userExercises = Array.from(historySet);
    const combined = Array.from(new Set([...userExercises, ...STANDARD_PRESETS]));

    res.json({
      success: true,
      presets: combined,
      userHistory: userExercises,
      lastSetsMap
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📋 1.2 Шаблоны тренировок
router.get('/templates', async (req, res) => {
  try {
    const templates = await query(`SELECT * FROM workout_templates ORDER BY id DESC`);
    const formatted = templates.map(t => ({
      ...t,
      exercises: t.exercises_json ? JSON.parse(t.exercises_json) : []
    }));
    res.json({ success: true, templates: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ➕ 1.3 Создать шаблон тренировки
router.post('/templates', async (req, res) => {
  try {
    const { title = 'Моя тренировка', type = 'Силовая', exercises = [] } = req.body;
    await run(`
      INSERT INTO workout_templates (title, type, exercises_json)
      VALUES (?, ?, ?)
    `, [title.trim(), type, JSON.stringify(exercises)]);

    const templates = await query(`SELECT * FROM workout_templates ORDER BY id DESC`);
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 1.4 Удалить шаблон
router.delete('/templates/:id', async (req, res) => {
  try {
    await run(`DELETE FROM workout_templates WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📊 2. Анализ прогрессии весов по упражнениям
router.get('/progression', async (req, res) => {
  try {
    const workouts = await query(`
      SELECT date, exercises_json, fatigue_rpe FROM workouts 
      ORDER BY date ASC
    `);

    const exerciseMap = {};

    workouts.forEach(w => {
      if (!w.exercises_json) return;
      try {
        const exercises = JSON.parse(w.exercises_json);
        exercises.forEach(ex => {
          if (!ex.name) return;
          if (!exerciseMap[ex.name]) {
            exerciseMap[ex.name] = [];
          }
          
          let maxWeight = 0;
          let totalReps = 0;
          let totalVolume = 0;

          if (Array.isArray(ex.sets)) {
            ex.sets.forEach(s => {
              const weight = Number(s.weight) || 0;
              const reps = Number(s.reps) || 0;
              if (weight > maxWeight) maxWeight = weight;
              totalReps += reps;
              totalVolume += weight * reps;
            });
          }

          exerciseMap[ex.name].push({
            date: w.date,
            maxWeight,
            totalReps,
            totalVolume,
            fatigueRpe: w.fatigue_rpe || 5,
            setsCount: ex.sets?.length || 0
          });
        });
      } catch (e) {}
    });

    res.json({ success: true, progression: exerciseMap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ➕ 3. Добавить новую тренировку
router.post('/', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const {
      title = 'Силовая тренировка',
      type = 'Силовая',
      duration_min = 60,
      strain = 12.5,
      avg_hr = 135,
      max_hr = 168,
      fatigue_rpe = 6,
      notes = '',
      exercises = []
    } = req.body;

    const result = await run(`
      INSERT INTO workouts (
        date, title, type, duration_min, strain, avg_hr, max_hr,
        fatigue_rpe, notes, exercises_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      todayStr,
      title,
      type,
      duration_min,
      strain,
      avg_hr,
      max_hr,
      fatigue_rpe,
      notes,
      JSON.stringify(exercises)
    ]);

    const workout = await getOne(`SELECT * FROM workouts WHERE id = ?`, [result.id]);

    res.json({
      success: true,
      workout: {
        ...workout,
        exercises
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 4. Удалить тренировку
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM workouts WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
