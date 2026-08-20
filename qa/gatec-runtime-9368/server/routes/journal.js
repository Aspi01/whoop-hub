import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const INITIAL_HABITS = [
  { icon: '💊', title: 'Магний на ночь', type: 'builtin' },
  { icon: '🧖‍♂️', title: 'Сауна / Баня', type: 'builtin' },
  { icon: '🥶', title: 'Холодный душ', type: 'builtin' },
  { icon: '☕', title: 'Кофе после 15:00', type: 'builtin' },
  { icon: '🍷', title: 'Алкоголь', type: 'builtin' },
  { icon: '🚶‍♂️', title: 'Прогулка 10k шагов', type: 'builtin' },
  { icon: '🧘‍♂️', title: 'Медитация / Дыхание', type: 'builtin' },
  { icon: '🍕', title: 'Поздний плотный ужин', type: 'builtin' },
  { icon: '🕶️', title: 'Очки Blue-Blockers', type: 'builtin' },
  { icon: '💧', title: '3+ литра воды', type: 'builtin' }
];

let habitsInitialized = false;
async function ensureDefaultHabits() {
  if (habitsInitialized) return;
  try {
    const existing = await query(`SELECT COUNT(*) as count FROM custom_habits`);
    if (existing[0]?.count === 0) {
      for (const h of INITIAL_HABITS) {
        await run(`INSERT OR IGNORE INTO custom_habits (title, icon, is_builtin) VALUES (?, ?, 1)`, [h.title, h.icon]);
      }
    } else {
      // Ensure initial habits are marked as builtin
      for (const h of INITIAL_HABITS) {
        await run(`UPDATE custom_habits SET is_builtin = 1 WHERE title = ?`, [h.title]);
      }
    }
    habitsInitialized = true;
  } catch (e) {}
}

// 📝 1. Получить дневник за сегодня и список всех привычек
router.get('/today', async (req, res) => {
  try {
    await ensureDefaultHabits();
    const todayStr = new Date().toISOString().split('T')[0];
    const entry = await getOne(`SELECT * FROM journal_entries WHERE date = ?`, [todayStr]);
    const habitRows = await query(`SELECT * FROM custom_habits ORDER BY is_builtin DESC, id ASC`);

    const formattedHabits = habitRows.map(h => ({
      id: h.id,
      title: h.title,
      icon: h.icon || '⚡',
      category: h.category || 'Общее',
      type: h.is_builtin === 1 ? 'builtin' : 'custom',
      is_builtin: Boolean(h.is_builtin)
    }));

    let tags = [];
    if (entry?.tags_json) {
      try {
        tags = JSON.parse(entry.tags_json);
      } catch (e) {}
    }

    res.json({
      success: true,
      habits: formattedHabits.length > 0 ? formattedHabits : INITIAL_HABITS,
      entry: entry ? {
        ...entry,
        tags
      } : {
        date: todayStr,
        tags: [],
        stress_level: 2,
        energy_level: 8,
        notes: ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ➕ 2. Добавить новую пользовательскую привычку с кастомной иконкой
router.post('/habits', async (req, res) => {
  try {
    await ensureDefaultHabits();
    const { title, icon = '⚡' } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Укажите название привычки' });
    }

    const cleanTitle = title.trim();
    const cleanIcon = (icon || '⚡').trim();

    await run(`
      INSERT INTO custom_habits (title, icon, is_builtin) 
      VALUES (?, ?, 0)
      ON CONFLICT(title) DO UPDATE SET icon = excluded.icon
    `, [cleanTitle, cleanIcon]);

    const habitRows = await query(`SELECT * FROM custom_habits ORDER BY is_builtin DESC, id ASC`);
    const formattedHabits = habitRows.map(h => ({
      id: h.id,
      title: h.title,
      icon: h.icon || '⚡',
      category: h.category || 'Общее',
      type: h.is_builtin === 1 ? 'builtin' : 'custom',
      is_builtin: Boolean(h.is_builtin)
    }));

    res.json({ success: true, habits: formattedHabits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 3. Удалить пользовательскую привычку (Серверная защита системных привычек)
router.delete('/habits/:id', async (req, res) => {
  try {
    await ensureDefaultHabits();
    const habitId = req.params.id;
    const existing = await getOne(`SELECT * FROM custom_habits WHERE id = ?`, [habitId]);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Привычка не найдена' });
    }

    if (existing.is_builtin === 1) {
      return res.status(403).json({ success: false, error: 'Встроенные системные привычки нельзя удалить' });
    }

    await run(`DELETE FROM custom_habits WHERE id = ? AND is_builtin = 0`, [habitId]);

    const habitRows = await query(`SELECT * FROM custom_habits ORDER BY is_builtin DESC, id ASC`);
    const formattedHabits = habitRows.map(h => ({
      id: h.id,
      title: h.title,
      icon: h.icon || '⚡',
      category: h.category || 'Общее',
      type: h.is_builtin === 1 ? 'builtin' : 'custom',
      is_builtin: Boolean(h.is_builtin)
    }));

    res.json({ success: true, habits: formattedHabits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💾 4. Сохранить дневник за день (исторические записи сохраняются независимо от списка привычек)
router.post('/today', async (req, res) => {
  try {
    const { date, tags = [], stress_level = 2, energy_level = 7, notes = '', custom_answers = {} } = req.body;
    const saveDate = date || new Date().toISOString().split('T')[0];

    await run(`
      INSERT INTO journal_entries (date, tags_json, stress_level, energy_level, notes, custom_answers_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        tags_json = excluded.tags_json,
        stress_level = excluded.stress_level,
        energy_level = excluded.energy_level,
        notes = excluded.notes,
        custom_answers_json = excluded.custom_answers_json
    `, [
      saveDate,
      JSON.stringify(tags),
      stress_level,
      energy_level,
      notes,
      JSON.stringify(custom_answers)
    ]);

    res.json({ success: true, message: 'Дневник успешно сохранен' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
