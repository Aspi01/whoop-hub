import express from 'express';
import { query, getOne, run } from '../db.js';

const router = express.Router();

const DEFAULT_TAGS = [
  '☕ Кофе после 15:00',
  '🍷 Алкоголь',
  '🧖‍♂️ Сауна / Баня',
  '💊 Магний на ночь',
  '🥶 Холодный душ',
  '🚶‍♂️ Прогулка 10k шагов',
  '🧘‍♂️ Медитация / Дыхание',
  '🍕 Поздний плотный ужин'
];

// 📝 Получить запись за сегодня
router.get('/today', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    let entry = await getOne(`SELECT * FROM journal_entries WHERE date = ?`, [todayStr]);

    res.json({
      success: true,
      defaultTags: DEFAULT_TAGS,
      entry: entry ? {
        ...entry,
        tags: entry.tags_json ? JSON.parse(entry.tags_json) : []
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

// 💾 Сохранить запись за сегодня
router.post('/today', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const {
      tags = [],
      stress_level = 2,
      energy_level = 8,
      notes = ''
    } = req.body;

    const existing = await getOne(`SELECT id FROM journal_entries WHERE date = ?`, [todayStr]);

    if (existing) {
      await run(`
        UPDATE journal_entries 
        SET tags_json = ?, stress_level = ?, energy_level = ?, notes = ?
        WHERE date = ?
      `, [JSON.stringify(tags), stress_level, energy_level, notes, todayStr]);
    } else {
      await run(`
        INSERT INTO journal_entries (date, tags_json, stress_level, energy_level, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [todayStr, JSON.stringify(tags), stress_level, energy_level, notes]);
    }

    const updated = await getOne(`SELECT * FROM journal_entries WHERE date = ?`, [todayStr]);
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
