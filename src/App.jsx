import React, { useState, useEffect } from 'react';
import { Settings, Sparkles, WifiOff, CloudUpload, ChevronDown } from 'lucide-react';
import { api } from './services/api.js';
import { flushOfflineQueue, getOfflineQueue } from './services/offlineSync.js';

import Navigation from './components/Navigation.jsx';
import WhoopDashboard from './components/WhoopDashboard.jsx';
import MealScanner from './components/MealScanner.jsx';
import WorkoutLogger from './components/WorkoutLogger.jsx';
import DailyJournal from './components/DailyJournal.jsx';
import AiCoachChat from './components/AiCoachChat.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { MarkGlyph } from './components/BrandGlyphs.jsx';

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
    <div className="min-h-screen text-slate-100 flex justify-center app-shell">
      {/* Главный адаптивный контейнер */}
      <div className="w-full max-w-md min-h-screen flex flex-col px-3.5 sm:px-4 pt-safe pb-safe relative">
        
        {/* Баннер оффлайн-режима / фоновой синхронизации */}
        {!isOnline && (
          <div className="mb-2 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-2xl px-3 py-1.5 flex items-center justify-between text-xs animate-pulse">
            <div className="flex items-center gap-1.5 font-bold">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Оффлайн-режим (PWA)</span>
            </div>
            <span className="text-[10px] text-amber-400 font-mono">
              {pendingSyncCount > 0 ? `${pendingSyncCount} в очереди` : 'Кэш активен'}
            </span>
          </div>
        )}

        {isOnline && isSyncingQueue && (
          <div className="mb-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-2xl px-3 py-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <CloudUpload className="w-3.5 h-3.5 animate-bounce" />
              <span>Синхронизация данных с сервером...</span>
            </div>
          </div>
        )}

        {/* Авторская мобильная шапка */}
        <header className="flex items-center justify-between py-2.5 mb-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="brand-mark w-9 h-9 rounded-[14px] grid place-items-center text-[#07100d] shrink-0">
              <MarkGlyph className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-extrabold tracking-[-.02em] text-white">WHOOP HUB</span>
                <span className="text-[8px] font-black tracking-[.14em] uppercase text-emerald-300/80">OS</span>
              </div>
              <button type="button" className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-slate-500 pressable">
                <span>{todayFormatted}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className={`px-2.5 h-8 rounded-full border flex items-center gap-1.5 ${
              isGreen
                ? 'bg-emerald-400/[.08] border-emerald-300/[.15] text-emerald-300'
                : isYellow
                  ? 'bg-amber-400/[.08] border-amber-300/[.15] text-amber-300'
                  : 'bg-rose-400/[.08] border-rose-300/[.15] text-rose-300'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_9px_currentColor]" />
              <span className="metric-number text-[12px] font-extrabold">{currentRec}</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Настройки"
              className="pressable w-8 h-8 rounded-[12px] bg-white/[.035] border border-white/[.06] text-slate-400 grid place-items-center"
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
                  coachInsights={coachInsights}
                  insights={coachInsights}
                  onRefresh={loadAllData}
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
