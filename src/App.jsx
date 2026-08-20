import React, { useState, useEffect } from 'react';
import { Settings, Sparkles, WifiOff, CloudUpload } from 'lucide-react';
import { FormGlyph } from './components/BrandGlyphs.jsx';
import { api } from './services/api.js';
import { flushOfflineQueue, getOfflineQueue } from './services/offlineSync.js';

import Navigation from './components/Navigation.jsx';
import WhoopDashboard from './components/WhoopDashboard.jsx';
import MealScanner from './components/MealScanner.jsx';
import WorkoutLogger from './components/WorkoutLogger.jsx';
import DailyJournal from './components/DailyJournal.jsx';
import AiCoachChat from './components/AiCoachChat.jsx';
import SettingsModal from './components/SettingsModal.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (['dashboard', 'meals', 'workouts', 'journal', 'coach'].includes(urlTab)) return urlTab;
    return 'dashboard';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Сетевой статус и оффлайн-очередь
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(getOfflineQueue().length);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  // Глобальные состояния данных
  const [whoopData, setWhoopData] = useState(null);
  const [mealsData, setMealsData] = useState(null);
  const [workoutsData, setWorkoutsData] = useState(null);
  const [progressionData, setProgressionData] = useState(null);
  const [journalData, setJournalData] = useState(null);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachInsights, setCoachInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Отслеживание онлайн/оффлайн событий
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const queue = getOfflineQueue();
      if (queue.length > 0) {
        setIsSyncingQueue(true);
        await flushOfflineQueue(api);
        setPendingSyncCount(getOfflineQueue().length);
        setIsSyncingQueue(false);
        await loadAllData();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Загрузка всех данных приложения
  const loadAllData = async () => {
    try {
      // 0. Проверяем URL параметры после OAuth возврата
      const urlParams = new URLSearchParams(window.location.search);
      const urlAccessToken = urlParams.get('access_token');
      const urlRefreshToken = urlParams.get('refresh_token');

      if (urlAccessToken) {
        const sessionPayload = {
          accessToken: urlAccessToken,
          refreshToken: urlRefreshToken || ''
        };
        try {
          localStorage.setItem('whoop_session_backup', JSON.stringify(sessionPayload));
          const savedKeys = localStorage.getItem('whoop_saved_keys');
          const parsedKeys = savedKeys ? JSON.parse(savedKeys) : {};
          await api.restoreWhoopSession({
            ...sessionPayload,
            ...parsedKeys
          });
        } catch (e) {
          console.warn('Ошибка восстановления сессии из URL:', e);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // 1. Проверяем статус подключения Whoop
      if (navigator.onLine) {
        try {
          const statusRes = await api.getWhoopStatus();
          if (statusRes?.success) {
            if (statusRes.isConnected && statusRes.sessionToken) {
              try {
                localStorage.setItem('whoop_session_backup', JSON.stringify(statusRes.sessionToken));
              } catch (e) {}
            } else if (!statusRes.isConnected) {
              try {
                const backup = localStorage.getItem('whoop_session_backup');
                const savedKeys = localStorage.getItem('whoop_saved_keys');
                if (backup) {
                  const parsedBackup = JSON.parse(backup);
                  const parsedKeys = savedKeys ? JSON.parse(savedKeys) : {};
                  await api.restoreWhoopSession({
                    ...parsedBackup,
                    ...parsedKeys
                  });
                }
              } catch (parseErr) {
                console.warn('Ошибка парсинга бэкапа сессии:', parseErr);
              }
            }
          }
        } catch (statusErr) {
          console.warn('Проверка статуса сессии:', statusErr.message);
        }
      }

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
      
      setPendingSyncCount(getOfflineQueue().length);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const currentRec = whoopData?.current?.recovery_score ?? 78;
  const isGreen = currentRec >= 67;
  const isYellow = currentRec >= 34 && currentRec < 67;

  // Форматирование сегодняшней даты
  const todayFormatted = new Date().toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const pendingMealsCount = (mealsData?.meals || []).filter(m => m.status === 'needs_clarification').length;

  return (
    <div className="flex justify-center min-h-screen bg-[#020508]">
      <div className="app">
        {/* Оффлайн индикаторы */}
        {!isOnline && (
          <div className="mb-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Оффлайн режим (кэш активен)</span>
            </div>
            {pendingSyncCount > 0 && (
              <span className="bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {pendingSyncCount} в очереди
              </span>
            )}
          </div>
        )}

        {isOnline && isSyncingQueue && (
          <div className="mb-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <CloudUpload className="w-3.5 h-3.5 animate-bounce" />
              <span>Синхронизация данных с сервером...</span>
            </div>
          </div>
        )}

        {/* Контент активной вкладки */}
        <main className="flex-1">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Sparkles className="w-7 h-7 text-[#7cf0a5] animate-spin" />
              <span className="text-xs font-medium">Загрузка данных Whoop Hub...</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <WhoopDashboard
                  whoopData={whoopData}
                  onRefresh={loadAllData}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
              {activeTab === 'meals' && (
                <MealScanner
                  mealsData={mealsData}
                  onRefresh={loadAllData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
              {activeTab === 'workouts' && (
                <WorkoutLogger
                  workoutsData={workoutsData}
                  progressionData={progressionData}
                  onRefresh={loadAllData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
              {activeTab === 'journal' && (
                <DailyJournal
                  journalData={journalData}
                  onRefresh={loadAllData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
              {activeTab === 'coach' && (
                <AiCoachChat
                  coachMessages={coachMessages}
                  coachInsights={coachInsights}
                  insights={coachInsights}
                  onRefresh={loadAllData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
            </>
          )}
        </main>

        {/* Нижняя навигация */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingMealsCount={pendingMealsCount}
        />

        {/* Модальное окно настроек и API ключей */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onRefresh={loadAllData}
            onSaveSuccess={loadAllData}
          />
        )}
      </div>
    </div>
  );
}
