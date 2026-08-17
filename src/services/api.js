const API_BASE = '/api';

export const api = {
  // 🟢 Whoop
  async getWhoopSummary() {
    const res = await fetch(`${API_BASE}/whoop/summary`);
    return res.json();
  },

  async syncWhoop() {
    const res = await fetch(`${API_BASE}/whoop/sync`, { method: 'POST' });
    return res.json();
  },

  // 🥗 Питание
  async getMeals() {
    const res = await fetch(`${API_BASE}/meals`);
    return res.json();
  },

  async uploadMeal(formData) {
    const res = await fetch(`${API_BASE}/meals/upload`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async replyMealClarification(mealId, reply) {
    const res = await fetch(`${API_BASE}/meals/${mealId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    });
    return res.json();
  },

  async deleteMeal(id) {
    const res = await fetch(`${API_BASE}/meals/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // 🏋️‍♂️ Тренировки
  async getWorkouts() {
    const res = await fetch(`${API_BASE}/workouts`);
    return res.json();
  },

  async getProgression() {
    const res = await fetch(`${API_BASE}/workouts/progression`);
    return res.json();
  },

  async saveWorkout(workoutData) {
    const res = await fetch(`${API_BASE}/workouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workoutData)
    });
    return res.json();
  },

  async deleteWorkout(id) {
    const res = await fetch(`${API_BASE}/workouts/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // 📝 Дневник
  async getJournalToday() {
    const res = await fetch(`${API_BASE}/journal/today`);
    return res.json();
  },

  async saveJournalToday(data) {
    const res = await fetch(`${API_BASE}/journal/today`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // 🧠 AI Коуч
  async getCoachMessages() {
    const res = await fetch(`${API_BASE}/coach/messages`);
    return res.json();
  },

  async askCoach(question) {
    const res = await fetch(`${API_BASE}/coach/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    return res.json();
  },

  async getCoachInsights() {
    const res = await fetch(`${API_BASE}/coach/insights`);
    return res.json();
  },

  // ⚙️ Настройки
  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    return res.json();
  },

  async saveSettings(settings) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return res.json();
  }
};
