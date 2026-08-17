import React, { useState, useEffect } from 'react';
import { Settings, Shield, Zap, Sparkles } from 'lucide-react';
import { api } from './services/api.js';

import Navigation from './components/Navigation.jsx';
import WhoopDashboard from './components/WhoopDashboard.jsx';
import MealScanner from './components/MealScanner.jsx';
import WorkoutLogger from './components/WorkoutLogger.jsx';
import DailyJournal from './components/DailyJournal.jsx';
import AiCoachChat from './components/AiCoachChat.jsx';
import SettingsModal from './components/SettingsModal.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Глобальные состояния данных
  const [whoopData, setWhoopData] = useState(null);
  const [mealsData, setMealsData] = useState(null);
  const [workoutsData, setWorkoutsData] = useState(null);
  const [progressionData, setProgressionData] = useState(null);
  const [journalData, setJournalData] = useState(null);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachInsights, setCoachInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Загрузка всех данных приложения
  const loadAllData = async () => {
    try {
      const [
        whoopRes,
        mealsRes,
        workoutsRes,
        progRes,
        journalRes,
        coachMsgRes,
        coachInsRes
      ] = await Promise.allSettled([
        api.getWhoopSummary(),
        api.getMeals(),
        api.getWorkouts(),
        api.getProgression(),
        api.getJournalToday(),
        api.getCoachMessages(),
        api.getCoachInsights()
      ]);

      if (whoopRes.status === 'fulfilled') setWhoopData(whoopRes.value);
      if (mealsRes.status === 'fulfilled') setMealsData(mealsRes.value);
      if (workoutsRes.status === 'fulfilled') setWorkoutsData(workoutsRes.value);
      if (progRes.status === 'fulfilled') setProgressionData(progRes.value);
      if (journalRes.status === 'fulfilled') setJournalData(journalRes.value);
      if (coachMsgRes.status === 'fulfilled') setCoachMessages(coachMsgRes.value?.messages || []);
      if (coachInsRes.status === 'fulfilled') setCoachInsights(coachInsRes.value?.insights || []);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const currentRec = whoopData?.current?.recovery_score || 78;
  const isGreen = currentRec >= 67;
  const isYellow = currentRec >= 34 && currentRec < 67;

  // Форматирование сегодняшней даты
  const todayFormatted = new Date().toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  // Количество блюд, требующих уточнения
  const pendingMealsCount = (mealsData?.meals || []).filter(m => m.status === 'needs_clarification').length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex justify-center selection:bg-emerald-500 selection:text-black">
      {/* Главный адаптивный контейнер (mobile first) */}
      <div className="w-full max-w-md min-h-screen flex flex-col px-4 pt-3 pb-safe relative">
        
        {/* Верхняя панель (App Header) */}
        <header className="flex items-center justify-between py-2.5 mb-2 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-black font-black text-xs shadow-lg shadow-emerald-500/20">
              W
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">
                {todayFormatted}
              </span>
              <span className="text-sm font-black tracking-tight text-white">
                WHOOP HUB <span className="text-emerald-400 text-xs">AI</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Recovery Badge */}
            <div
              onClick={() => setActiveTab('dashboard')}
              className={`px-2.5 py-1 rounded-full border text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer ${
                isGreen
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : isYellow
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{currentRec}%</span>
            </div>

            {/* Кнопка настроек */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Контент активной вкладки */}
        <main className="flex-1">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Sparkles className="w-7 h-7 text-emerald-400 animate-spin" />
              <span className="text-xs font-medium">Загрузка данных Whoop Hub...</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <WhoopDashboard
                  whoopData={whoopData}
                  onRefresh={loadAllData}
                  onNavigate={(tab) => setActiveTab(tab)}
                />
              )}
              {activeTab === 'meals' && (
                <MealScanner
                  mealsData={mealsData}
                  onRefresh={loadAllData}
                />
              )}
              {activeTab === 'workouts' && (
                <WorkoutLogger
                  workoutsData={workoutsData}
                  progressionData={progressionData}
                  onRefresh={loadAllData}
                />
              )}
              {activeTab === 'journal' && (
                <DailyJournal
                  journalData={journalData}
                  onRefresh={loadAllData}
                />
              )}
              {activeTab === 'coach' && (
                <AiCoachChat
                  coachMessages={coachMessages}
                  insights={coachInsights}
                  onRefresh={loadAllData}
                />
              )}
            </>
          )}
        </main>

        {/* Нижняя мобильная панель навигации */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingMealsCount={pendingMealsCount}
        />

        {/* Модальное окно настроек */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onRefresh={loadAllData}
        />
      </div>
    </div>
  );
}
