import { query, getOne } from '../../db.js';

export async function getTodayNutrition() {
  const todayStr = new Date().toISOString().split('T')[0];
  const meals = await query('SELECT * FROM meals WHERE date = ? ORDER BY id ASC', [todayStr]);

  const totals = meals.reduce((acc, m) => {
    acc.calories += m.calories || 0;
    acc.protein += m.protein || 0;
    acc.fats += m.fats || 0;
    acc.carbs += m.carbs || 0;
    acc.fiber = (acc.fiber || 0) + (m.fiber || 0);
    return acc;
  }, { calories: 0, protein: 0, fats: 0, carbs: 0, fiber: 0 });

  let calorieGoal = 2250;
  let proteinGoal = 150;
  try {
    const calRow = await getOne("SELECT value FROM app_settings WHERE key = 'calorie_goal'");
    if (calRow?.value) calorieGoal = Number(calRow.value);
    const protRow = await getOne("SELECT value FROM app_settings WHERE key = 'protein_goal'");
    if (protRow?.value) proteinGoal = Number(protRow.value);
  } catch (e) {}

  const caloriesRemaining = Math.max(0, calorieGoal - totals.calories);
  const proteinRemaining = Math.max(0, proteinGoal - totals.protein);

  return {
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      fats: Math.round(totals.fats * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fiber: Math.round((totals.fiber || 0) * 10) / 10
    },
    goals: {
      calorieGoal,
      proteinGoal
    },
    remaining: {
      caloriesRemaining,
      proteinRemaining: Math.round(proteinRemaining * 10) / 10
    },
    mealsCount: meals.length,
    mealsList: meals.map(m => ({
      title: m.title,
      time: m.time_str,
      type: m.meal_type,
      calories: m.calories,
      protein: m.protein,
      fats: m.fats,
      carbs: m.carbs,
      fiber: m.fiber
    }))
  };
}

export async function getRecentMeals(limit = 10) {
  const meals = await query('SELECT * FROM meals ORDER BY id DESC LIMIT ?', [limit]);
  return meals;
}
