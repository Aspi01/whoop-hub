import { query, getOne, run } from '../db.js';

export function getMessageText(m) {
  if (typeof m === 'string') return m.trim();

  const content = typeof m?.content === 'string' ? m.content.trim() : '';
  const message = typeof m?.message === 'string' ? m.message.trim() : '';

  return content || message || '';
}

export function getMessageRole(m) {
  if (!m) return 'user';
  if (m.role) return m.role;
  if (m.sender === 'assistant' || m.sender === 'ai' || m.sender === 'coach') return 'assistant';
  return 'user';
}

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
      content: m.message,
      message: m.message,
      sender: m.sender
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
