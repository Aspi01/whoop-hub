import { setCachedData, getCachedData, enqueueOfflineAction } from './offlineSync.js';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const err = new Error(errorData.error || `HTTP error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return { success: true };
    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
  } catch (err) {
    console.warn(`Сетевой запрос к ${endpoint} не удался:`, err.message);
    throw err;
  }
}

export const api = {
  // 🟢 Whoop
  async getWhoopSummary() {
    try {
      const data = await request('/whoop/summary');
      if (data?.success) setCachedData('whoop_summary', data);
      return data;
    } catch (e) {
      const cached = getCachedData('whoop_summary');
      if (cached) return { ...cached, isOfflineCached: true };
      throw e;
    }
  },

  getWhoopToday() {
    return this.getWhoopSummary();
  },

  async getProgression() {
    try {
      const data = await request('/workouts/progression');
      return data || { success: true, progression: [] };
    } catch (e) {
      return { success: true, progression: [] };
    }
  },

  getWhoopStatus() {
    return request('/whoop/status');
  },

  restoreWhoopSession(payload) {
    return request('/whoop/restore-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  getWhoopOAuthUrl() {
    return request('/whoop/oauth/url');
  },

  getSettings() {
    return request('/whoop/settings').catch(() => ({ success: true, settings: {} }));
  },

  saveSettings(settings) {
    return request('/whoop/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  },

  syncWhoop() {
    return request('/whoop/sync', { method: 'POST' });
  },

  // 🥑 Питание
  async getMeals() {
    try {
      const data = await request('/meals');
      if (data?.success) setCachedData('meals', data);
      return data;
    } catch (e) {
      const cached = getCachedData('meals');
      if (cached) return { ...cached, isOfflineCached: true };
      throw e;
    }
  },

  async analyzeFood(formData) {
    const res = await fetch(`${API_BASE}/meals/analyze`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || (res.status === 400 ? 'На фото не обнаружена еда. Пожалуйста, сфотографируйте ваше блюдо!' : `Ошибка сервера (${res.status})`));
    }
    return data;
  },

  async saveMeal(mealData) {
    return request('/meals/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mealData)
    });
  },

  async uploadMeal(formData) {
    const res = await fetch(`${API_BASE}/meals/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || (res.status === 400 ? 'На фото не обнаружена еда. Пожалуйста, сфотографируйте ваше блюдо или напиток!' : `Ошибка сервера (${res.status})`));
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
  async getWorkouts() {
    try {
      const data = await request('/workouts');
      if (data?.success) setCachedData('workouts', data);
      return data;
    } catch (e) {
      const cached = getCachedData('workouts');
      if (cached) return { ...cached, isOfflineCached: true };
      throw e;
    }
  },

  async getWorkoutPresets() {
    try {
      const data = await request('/workouts/presets');
      if (data?.success) setCachedData('workout_presets', data);
      return data;
    } catch (e) {
      const cached = getCachedData('workout_presets');
      if (cached) return cached;
      return { success: true, presets: [], lastSetsMap: {} };
    }
  },

  async getWorkoutTemplates() {
    try {
      const data = await request('/workouts/templates');
      if (data?.success) setCachedData('workout_templates', data);
      return data;
    } catch (e) {
      const cached = getCachedData('workout_templates');
      if (cached) return cached;
      return { success: true, templates: [] };
    }
  },

  createWorkoutTemplate(data) {
    return request('/workouts/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  deleteWorkoutTemplate(id) {
    return request(`/workouts/templates/${id}`, { method: 'DELETE' });
  },

  async getProgression() {
    try {
      const data = await request('/workouts/progression');
      if (data?.success) setCachedData('progression', data);
      return data;
    } catch (e) {
      const cached = getCachedData('progression');
      if (cached) return cached;
      return { success: true, progression: {} };
    }
  },

  async saveWorkout(workoutData, bypassQueue = false) {
    if (!navigator.onLine && !bypassQueue) {
      enqueueOfflineAction({ type: 'workout', payload: workoutData });
      return {
        success: true,
        isOfflineSaved: true,
        workout: {
          id: 'offline_' + Date.now(),
          date: new Date().toISOString().split('T')[0],
          ...workoutData
        }
      };
    }

    try {
      return await request('/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workoutData)
      });
    } catch (e) {
      if (!bypassQueue) {
        enqueueOfflineAction({ type: 'workout', payload: workoutData });
        return {
          success: true,
          isOfflineSaved: true,
          workout: {
            id: 'offline_' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            ...workoutData
          }
        };
      }
      throw e;
    }
  },

  deleteWorkout(id) {
    return request(`/workouts/${id}`, { method: 'DELETE' });
  },

  // 📝 Дневник
  async getJournalToday() {
    try {
      const data = await request('/journal/today');
      if (data?.success) setCachedData('journal_today', data);
      return data;
    } catch (e) {
      const cached = getCachedData('journal_today');
      if (cached) return { ...cached, isOfflineCached: true };
      throw e;
    }
  },

  createJournalHabit(data) {
    return request('/journal/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  deleteJournalHabit(id) {
    return request(`/journal/habits/${id}`, { method: 'DELETE' });
  },

  async saveJournalToday(data, bypassQueue = false) {
    if (!navigator.onLine && !bypassQueue) {
      enqueueOfflineAction({ type: 'journal', payload: data });
      return {
        success: true,
        isOfflineSaved: true,
        entry: {
          date: new Date().toISOString().split('T')[0],
          ...data
        },
        message: 'Сохранено локально в оффлайн-режиме!'
      };
    }

    try {
      return await request('/journal/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      if (!bypassQueue) {
        enqueueOfflineAction({ type: 'journal', payload: data });
        return {
          success: true,
          isOfflineSaved: true,
          entry: {
            date: new Date().toISOString().split('T')[0],
            ...data
          },
          message: 'Сохранено локально в оффлайн-режиме!'
        };
      }
      throw e;
    }
  },

  // 🧠 AI Коуч
  async getCoachMessages() {
    try {
      const data = await request('/coach/messages');
      if (data?.success) setCachedData('coach_messages', data);
      return data;
    } catch (e) {
      const cached = getCachedData('coach_messages');
      if (cached) return cached;
      return { success: true, messages: [] };
    }
  },

  askCoach(question) {
    return request('/coach/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
  },

  async getCoachInsights() {
    try {
      const data = await request('/coach/insights');
      if (data?.success) setCachedData('coach_insights', data);
      return data;
    } catch (e) {
      const cached = getCachedData('coach_insights');
      if (cached) return cached;
      return { success: true, insights: [] };
    }
  }
};
