import { query, getOne, run } from '../db.js';

export async function getConversationHistory(limit = 6) {
  try {
    const messages = await query(`
      SELECT sender, message FROM (
        SELECT * FROM chat_messages 
        ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `, [limit]);

    return messages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.message
    }));
  } catch (e) {
    return [];
  }
}

export function getDurableUserPreferences() {
  return {
    preferredUnits: 'kg / metric',
    language: 'Russian',
    tone: 'Expert, direct, data-focused, no fluff'
  };
}
