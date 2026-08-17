const API_BASE = '/api';

// Надежная обертка для всех запросов (с обходом защиты туннеля и безопасным парсингом JSON)
async function request(endpoint, options = {}) {
  const headers = {
    'Bypass-Tunnel-Reminder': 'true',
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!response.ok) {
      throw new Error(`Ошибка сервера (${response.status}): ${text.slice(0, 100)}`);
    }
    throw new Error('Некорректный ответ сервера: ' + text.slice(0, 100));
  }

  if (!response.ok && data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export const api = {
  // 🟢 Whoop
  getWhoopSummary() {
    return request('/whoop/summary');
  },

  syncWhoop() {
    return request('/whoop/sync', { method: 'POST' });
  },

  getWhoopStatus() {
    return request('/whoop/status');
  },

  restoreWhoopSession(sessionData) {
    return request('/whoop/restore-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });
  },

  getWhoopOAuthUrl() {
    return request('/whoop/oauth/url');
  },

  // 🥗 Питание
  getMeals() {
    return request('/meals');
  },

  async uploadMeal(formData) {
    const res = await fetch(`${API_BASE}/meals/upload`, {
      method: 'POST',
      headers: {
        'Bypass-Tunnel-Reminder': 'true'
      },
      body: formData
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || 'Ошибка загрузки фото');
    }
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'На фото не обнаружена еда. Пожалуйста, сфотографируйте ваше блюдо или напиток!');
    }
    return data;
  },

  replyMealClarification(mealId, reply) {
    return request(`/meals/${mealId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    });
  },

  deleteMeal(id) {
    return request(`/meals/${id}`, { method: 'DELETE' });
  },

  // 🏋️‍♂️ Тренировки
  getWorkouts() {
    return request('/workouts');
  },

  getProgression() {
    return request('/workouts/progression');
  },

  saveWorkout(workoutData) {
    return request('/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workoutData)
    });
  },

  deleteWorkout(id) {
    return request(`/workouts/${id}`, { method: 'DELETE' });
  },

  // 📝 Дневник
  getJournalToday() {
    return request('/journal/today');
  },

  saveJournalToday(data) {
    return request('/journal/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  // 🧠 AI Коуч
  getCoachMessages() {
    return request('/coach/messages');
  },

  askCoach(question) {
    return request('/coach/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
  },

  getCoachInsights() {
    return request('/coach/insights');
  },

  // ⚙️ Настройки
  getSettings() {
    return request('/settings');
  },

  saveSettings(settings) {
    return request('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  }
};
