import { query, getOne } from '../../db.js';

export async function getRitualsToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  const entry = await getOne('SELECT * FROM journal_entries WHERE date = ?', [todayStr]) || {};
  let tags = [];
  if (entry.tags_json) {
    try { tags = JSON.parse(entry.tags_json); } catch (e) {}
  }

  return {
    stressLevel: entry.stress_level ?? 2,
    energyLevel: entry.energy_level ?? 8,
    tags: tags.length > 0 ? tags : ['Магний на ночь', 'Прогулка 10k шагов', 'Медитация / дыхание'],
    notes: entry.notes || ''
  };
}

export async function getRitualHistory(limit = 7) {
  const entries = await query('SELECT * FROM journal_entries ORDER BY date DESC LIMIT ?', [limit]);
  return entries;
}
