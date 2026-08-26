import { getTodayStatus, getHrvTrend, getSleepSummary } from './tools/health.js';
import { getTodayHealthSnapshot } from '../health/todayHealthSnapshot.js';
import { getTodayNutrition, getRecentMeals } from './tools/nutrition.js';
import { getRecentWorkouts, getExerciseHistory, resolveExerciseFromQuery } from './tools/training.js';
import { getRitualsToday, getRitualHistory } from './tools/rituals.js';
import { getAppHelp } from './tools/appHelp.js';
import { getMessageText } from './conversationMemory.js';

export async function buildSelectiveContext(classification, userMessage, conversationHistory = []) {
  const startTime = Date.now();
  const needed = classification.needed_context || [];
  const context = {};

  const tasks = [];

  // Build combined text for multi-turn entity extraction excluding current incoming message
  let combinedText = userMessage;
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const cleanUserMsg = String(userMessage || '').trim();
    const previousHistory = conversationHistory.filter(m => getMessageText(m).trim() !== cleanUserMsg);
    const recentMessages = previousHistory.slice(-4).map(getMessageText).join(' ');
    combinedText = `${userMessage} ${recentMessages}`;
  }

  if (needed.includes('today_status') || needed.includes('recovery_today') || /recovery|восстановл|hrv|пульс/i.test(combinedText)) {
    tasks.push(getTodayStatus().then(res => { context.today = res.today; context.baseline = res.baseline; }).catch(() => {}));
    tasks.push(getTodayHealthSnapshot().then(snapshot => { context.healthSnapshot = snapshot; }).catch(() => {}));
  }

  if (needed.includes('sleep_summary') || needed.includes('hrv_trend') || /с(он|на|ну|не|ном)|сп|высп/i.test(combinedText)) {
    tasks.push(getSleepSummary(5).then(res => { context.recentSleep = res; }).catch(() => {}));
    tasks.push(getHrvTrend(5).then(res => { context.recentHrv = res; }).catch(() => {}));
  }

  if (needed.includes('nutrition_today') || needed.includes('user_goals') || /калор|белк|протеин|пищ|съес|ужин/i.test(combinedText)) {
    tasks.push(getTodayNutrition().then(res => {
      context.nutrition = {
        consumedCalories: res.totals.calories,
        consumedProtein: res.totals.protein,
        calorieGoal: res.goals.calorieGoal,
        proteinGoal: res.goals.proteinGoal,
        caloriesRemaining: res.remaining.caloriesRemaining,
        proteinRemaining: res.remaining.proteinRemaining,
        mealsToday: res.mealsList
      };
    }).catch(() => {}));
  }

  if (needed.includes('recent_workouts') || /тренировк|нагрузк|жим|жал|присед|тяг/i.test(combinedText)) {
    tasks.push(getRecentWorkouts(3).then(res => { context.recentWorkouts = res; }).catch(() => {}));
  }

  if (needed.includes('exercise_history') || /жим|жал|пожал|присед|тяг|ногам/i.test(combinedText)) {
    const target = resolveExerciseFromQuery(combinedText);
    const exerciseName = target?.displayName || 'Жим лёжа';
    tasks.push(getExerciseHistory(exerciseName, 3).then(res => {
      context.exerciseHistory = res;
    }).catch(() => {}));
  }

  if (needed.includes('rituals_today') || /ритуал|привычк|магний|сауна/i.test(combinedText)) {
    tasks.push(getRitualsToday().then(res => { context.rituals = res; }).catch(() => {}));
  }

  if (needed.includes('app_knowledge')) {
    tasks.push(getAppHelp(userMessage).then(res => { context.appHelp = res; }).catch(() => {}));
  }

  // Parallel non-blocking resolution
  await Promise.allSettled(tasks);

  return {
    context,
    context_ms: Date.now() - startTime
  };
}
