import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

// 🏋️‍♂️ Список всех тренировок
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

// 📊 Анализ прогрессии весов по упражнениям
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
          
          // Находим максимальный рабочий вес в тренировке
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
      } catch (e) {
        // pass
      }
    });

    res.json({ success: true, progression: exerciseMap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ➕ Добавить новую тренировку
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

    const created = await getOne(`SELECT * FROM workouts WHERE id = ?`, [result.id]);
    res.json({
      success: true,
      workout: {
        ...created,
        exercises
      },
      message: 'Тренировка успешно сохранена!'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑 Удаление тренировки
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM workouts WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Тренировка удалена' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
