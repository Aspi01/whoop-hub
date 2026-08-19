import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const INITIAL_HABITS = [
  { icon: '💊', title: 'Магний на ночь' },
  { icon: '🧖‍♂️', title: 'Сауна / Баня' },
  { icon: '🥶', title: 'Холодный душ' },
  { icon: '☕', title: 'Кофе после 15:00' },
  { icon: '🍷', title: 'Алкоголь' },
  { icon: '🚶‍♂️', title: 'Прогулка 10k шагов' },
  { icon: '🧘‍♂️', title: 'Медитация / Дыхание' },
  { icon: '🍕', title: 'Поздний плотный ужин' },
  { icon: '🕶️', title: 'Очки Blue-Blockers' },
  { icon: '💧', title: '3+ литра воды' }
];

let habitsInitialized = false;
async function ensureDefaultHabits() {
  if (habitsInitialized) return;
  try {
    const existing = await query(`SELECT COUNT(*) as count FROM custom_habits`);
    if (existing[0]?.count === 0) {
      for (const h of INITIAL_HABITS) {
        await run(`INSERT OR IGNORE INTO custom_habits (title, icon) VALUES (?, ?)`, [h.title, h.icon]);
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
    const habits = await query(`SELECT * FROM custom_habits ORDER BY id ASC`);

    let tags = [];
    if (entry?.tags_json) {
      try {
        tags = JSON.parse(entry.tags_json);
      } catch (e) {}
    }

    res.json({
      success: true,
      habits: habits.length > 0 ? habits : INITIAL_HABITS,
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
    const { title, icon = '⚡' } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Укажите название привычки' });
    }

    const cleanTitle = title.trim();
    const cleanIcon = (icon || '⚡').trim();

    await run(`
      INSERT INTO custom_habits (title, icon) 
      VALUES (?, ?)
      ON CONFLICT(title) DO UPDATE SET icon = excluded.icon
    `, [cleanTitle, cleanIcon]);

    const habits = await query(`SELECT * FROM custom_habits ORDER BY id ASC`);
    res.json({ success: true, habits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 3. Удалить привычку
router.delete('/habits/:id', async (req, res) => {
  try {
    await run(`DELETE FROM custom_habits WHERE id = ?`, [req.params.id]);
    const habits = await query(`SELECT * FROM custom_habits ORDER BY id ASC`);
    res.json({ success: true, habits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 💾 4. Сохранить дневник за сегодня
router.post('/today', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const {
      date = todayStr,
      tags = [],
      stress_level = 2,
      energy_level = 8,
      notes = ''
    } = req.body;

    const targetDate = date || todayStr;
    const existing = await getOne(`SELECT id FROM journal_entries WHERE date = ?`, [targetDate]);

    if (existing) {
      await run(`
        UPDATE journal_entries 
        SET tags_json = ?, stress_level = ?, energy_level = ?, notes = ?
        WHERE date = ?
      `, [JSON.stringify(tags), stress_level, energy_level, notes, targetDate]);
    } else {
      await run(`
        INSERT INTO journal_entries (date, tags_json, stress_level, energy_level, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [targetDate, JSON.stringify(tags), stress_level, energy_level, notes]);
    }

    const updated = await getOne(`SELECT * FROM journal_entries WHERE date = ?`, [targetDate]);
    res.json({
      success: true,
      entry: {
        ...updated,
        tags
      },
      message: 'Дневник успешно сохранен!'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
