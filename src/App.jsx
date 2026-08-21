import React, { useState, useEffect } from 'react';
import { Settings, Sparkles, WifiOff, CloudUpload } from 'lucide-react';
import { FormGlyph } from './components/BrandGlyphs.jsx';
import { api } from './services/api.js';
import { flushOfflineQueue, getOfflineQueue } from './services/offlineSync.js';
import { normalizeHealthData } from './services/healthDataLayer.js';
import { I18nProvider } from './i18n/I18nContext.jsx';

import Navigation from './components/Navigation.jsx';
import WhoopDashboard from './components/WhoopDashboard.jsx';
import MealScanner from './components/MealScanner.jsx';
import WorkoutLogger from './components/WorkoutLogger.jsx';
import DailyJournal from './components/DailyJournal.jsx';
import AiCoachChat from './components/AiCoachChat.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import DataSourcesModal from './components/DataSourcesModal.jsx';
import Onboarding from './components/Onboarding.jsx';

function MainApp() {
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('reset_onboarding') === '1') {
        localStorage.removeItem('onboarding_completed');
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
        return false;
      }
      return localStorage.getItem('onboarding_completed') === 'true';
    } catch (e) {
      return true;
    }
  });

  const [activeTab, setActiveTab] = useState(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (['dashboard', 'meals', 'workouts', 'journal', 'coach'].includes(urlTab)) return urlTab;
    return 'dashboard';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  useEffect(() => {
    const handleUrlTab = () => {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (['dashboard', 'meals', 'workouts', 'journal', 'coach'].includes(urlTab)) {
        setActiveTab(urlTab);
      }
    };
    window.addEventListener('popstate', handleUrlTab);
    return () => window.removeEventListener('popstate', handleUrlTab);
  }, []);

  // Network & offline queue
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(getOfflineQueue().length);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  // Global domain state
  const [whoopData, setWhoopData] = useState(null);
  const [mealsData, setMealsData] = useState(null);
  const [workoutsData, setWorkoutsData] = useState(null);
  const [progressionData, setProgressionData] = useState(null);
  const [journalData, setJournalData] = useState(null);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachInsights, setCoachInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Online / offline listeners
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

  const loadAllData = async () => {
    try {
      // 0. Clean OAuth redirect URL params safely without storing tokens in browser
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('whoop_connected')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      try {
        localStorage.removeItem('whoop_session_backup');
        localStorage.removeItem('whoop_saved_keys');
      } catch (e) {}

      // Load all endpoints in parallel
      const [whoopRes, mealsRes, workoutsRes, progRes, journalRes, coachMsgRes, coachInsRes] = await Promise.allSettled([
        api.getWhoopToday(),
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
      console.error('Data load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOnboardingCompleted) {
      loadAllData();
    }
  }, [isOnboardingCompleted]);

  if (!isOnboardingCompleted) {
    return (
      <Onboarding
        onComplete={() => {
          try {
            localStorage.setItem('onboarding_completed', 'true');
          } catch (e) {}
          setIsOnboardingCompleted(true);
        }}
      />
    );
  }

  const normalizedHealth = normalizeHealthData({ whoopData, mealsData, workoutsData, journalData });
  const pendingMealsCount = (mealsData?.meals || []).filter(m => m.status === 'needs_clarification').length;

  return (
    <div className="flex justify-center min-h-screen bg-[#020508]">
      <div className="app">
        {/* Offline Indicators */}
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

        {/* Tab Content */}
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
                  normalizedHealth={normalizedHealth}
                  onRefresh={loadAllData}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenSources={() => setIsSourcesOpen(true)}
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
                  whoopData={whoopData}
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
                  whoopData={whoopData}
                  mealsData={mealsData}
                  workoutsData={workoutsData}
                  journalData={journalData}
                  coachMessages={coachMessages}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onRefresh={loadAllData}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenSources={() => setIsSourcesOpen(true)}
                />
              )}
            </>
          )}
        </main>

        {/* Navigation Dock */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingMealsCount={pendingMealsCount}
        />

        {/* Settings Modal */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onRefresh={loadAllData}
            onSaveSuccess={loadAllData}
            onOpenSources={() => { setIsSettingsOpen(false); setIsSourcesOpen(true); }}
          />
        )}

        {/* Data Sources Modal */}
        {isSourcesOpen && (
          <DataSourcesModal
            isOpen={isSourcesOpen}
            onClose={() => setIsSourcesOpen(false)}
            sources={normalizedHealth.sources}
            onOpenWhoopSettings={() => { setIsSourcesOpen(false); setIsSettingsOpen(true); }}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <MainApp />
    </I18nProvider>
  );
}
