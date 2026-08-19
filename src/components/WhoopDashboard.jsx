import React, { useState } from 'react';
import { 
  RefreshCw, Moon, Flame, Zap, Wind,
  ChevronRight, Maximize2, Plus, Play, Bell, BedDouble, Heart
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api.js';

export default function WhoopDashboard({ whoopData, onRefresh, onNavigate }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const current = whoopData?.current || {};

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await api.syncWhoop();
      await onRefresh();
      if ((current?.recovery_score || 0) >= 80) {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
      }
    } catch (e) {
      console.warn('Ошибка синхронизации Whoop:', e.message);
      await onRefresh();
    } finally {
      setIsSyncing(false);
    }
  };

  const recScore = current.recovery_score || 68;
  const isGreen = recScore >= 67;
  const isYellow = recScore >= 34 && recScore < 67;
  const recoveryColor = isGreen ? '#00e676' : isYellow ? '#ffb800' : '#ff3b30';

  const sleepScore = current.sleep_performance_pct || 88;
  const sleepHours = Math.floor((current.sleep_actual_min || 490) / 60);
  const sleepMins = (current.sleep_actual_min || 490) % 60;
  const sleepFormatted = `${sleepHours}:${String(sleepMins).padStart(2, '0')}`;

  const strainScore = current.strain || 6.9;
  const strainPct = Math.min(100, Math.round((strainScore / 21) * 100));

  return (
    <div className="space-y-3 pb-28">
      {/* 🔴 ТОП 3 КРУГОВЫХ КОЛЬЦА WHOOP (SLEEP, RECOVERY, STRAIN - Скриншот 1) */}
      <div className="bg-[#141a24] border border-white/5 rounded-3xl p-3.5 shadow-xl">
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* 1. SLEEP RING */}
          <div className="flex flex-col items-center cursor-pointer" onClick={() => onNavigate?.('journal')}>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="24" stroke="#1f2837" strokeWidth="4" fill="transparent" />
                <circle
                  cx="30" cy="30" r="24"
                  stroke="#5b7b99"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - sleepScore / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute text-xs font-black text-white font-mono">
                {sleepScore}%
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">
              SLEEP
            </span>
          </div>

          {/* 2. RECOVERY RING (Главный индикатор готовности) */}
          <div className="flex flex-col items-center cursor-pointer" onClick={handleSync}>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="24" stroke="#1f2837" strokeWidth="4" fill="transparent" />
                <circle
                  cx="30" cy="30" r="24"
                  stroke={recoveryColor}
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - recScore / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute text-xs font-black text-white font-mono">
                {recScore}%
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">
              RECOVERY
            </span>
          </div>

          {/* 3. STRAIN RING */}
          <div className="flex flex-col items-center cursor-pointer" onClick={() => onNavigate?.('workouts')}>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="24" stroke="#1f2837" strokeWidth="4" fill="transparent" />
                <circle
                  cx="30" cy="30" r="24"
                  stroke="#0099ff"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - strainPct / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute text-xs font-black text-white font-mono">
                {strainScore}
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">
              STRAIN
            </span>
          </div>
        </div>
      </div>

      {/* ☀️ Aspik's Daily Outlook Card (Скриншот 1) */}
      <div 
        onClick={() => onNavigate?.('coach')}
        className="bg-[#161c26] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between hover:border-white/10 transition-all cursor-pointer shadow-lg"
      >
        <div className="flex items-center gap-2.5">
          <div className="text-slate-400">
            <span className="text-base">☀️</span>
          </div>
          <div>
            <h3 className="text-xs font-black text-white tracking-tight">
              Aspik's Daily Outlook
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Восстановление {recScore}%. Оптимальная нагрузка на сегодня: <strong className="text-white">10.0 - 13.5</strong>
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
      </div>

      {/* 🏃‍♂️ TODAY'S ACTIVITIES (Скриншот 1) */}
      <div className="bg-[#161c26] border border-white/5 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            TODAY'S ACTIVITIES
          </h2>
          <Maximize2 className="w-3.5 h-3.5 text-slate-500 cursor-pointer" />
        </div>

        {/* Список активностей в фирменном стиле Whoop */}
        <div className="space-y-2">
          {/* Карточка сна */}
          <div className="bg-[#1e2634] border border-white/5 rounded-2xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#485d77] text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold font-mono text-xs shadow-sm">
                <Moon className="w-3.5 h-3.5 fill-current" />
                <span>{sleepFormatted}</span>
              </div>
              <span className="text-xs font-black text-white tracking-wider uppercase">
                SLEEP
              </span>
            </div>
            <div className="flex items-center gap-2 text-right">
              <div className="text-[10px] font-mono text-slate-400 leading-tight">
                <div>[Tue] 11:50 PM</div>
                <div>10:51 AM</div>
              </div>
              <div className="w-1 h-6 bg-[#5b7b99] rounded-full" />
            </div>
          </div>

          {/* Карточка тренировки / ходьбы */}
          <div className="bg-[#1e2634] border border-white/5 rounded-2xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#0099ff] text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-black font-mono text-xs shadow-sm">
                <span>🏃</span>
                <span>{strainScore}</span>
              </div>
              <span className="text-xs font-black text-white tracking-wider uppercase">
                WALKING / ROAD
              </span>
            </div>
            <div className="flex items-center gap-2 text-right">
              <div className="text-[10px] font-mono text-slate-400 leading-tight">
                <div>6:11 PM</div>
                <div>6:59 PM</div>
              </div>
              <div className="w-1 h-6 bg-[#0099ff] rounded-full" />
            </div>
          </div>
        </div>

        {/* Две нижние кнопки действий (+ ADD ACTIVITY / START ACTIVITY) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onNavigate?.('workouts')}
            className="py-2.5 px-3 rounded-2xl bg-[#202735] hover:bg-[#283244] text-slate-300 hover:text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-white/5 cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ADD ACTIVITY</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('workouts')}
            className="py-2.5 px-3 rounded-2xl bg-[#202735] hover:bg-[#283244] text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-white/5 cursor-pointer active:scale-95 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current text-[#0099ff]" />
            <span>START ACTIVITY</span>
          </button>
        </div>
      </div>

      {/* 🌙 TONIGHT'S SLEEP (Скриншот 1) */}
      <div className="bg-[#161c26] border border-white/5 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            TONIGHT'S SLEEP
          </h2>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>

        <div className="flex items-center justify-between text-center px-2">
          {/* Рекомендуемое время отхода ко сну */}
          <div className="text-left space-y-0.5">
            <div className="flex items-center gap-1 text-slate-400 text-xs">
              <BedDouble className="w-3.5 h-3.5" />
              <span className="text-base font-black text-white font-mono">12:05</span>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">
              RECOMMENDED BEDTIME
            </span>
          </div>

          <div className="text-slate-600 text-xs">─────</div>

          {/* Будильник Whoop */}
          <div className="text-right space-y-0.5">
            <div className="flex items-center justify-end gap-1 text-white text-xs">
              <span className="text-base font-black font-mono">8:30</span>
              <Bell className="w-3.5 h-3.5 text-[#00e676]" />
            </div>
            <span className="text-[9px] font-bold text-[#00e676] uppercase block tracking-wider">
              • ALARM ON EXACT TIME
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => alert('Будильник Whoop настроен на 8:30')}
          className="w-full py-2.5 rounded-2xl bg-[#202735] hover:bg-[#283244] text-slate-300 hover:text-white text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border border-white/5 cursor-pointer active:scale-95 transition-all"
        >
          <span>EDIT ALARM</span>
        </button>
      </div>

      {/* 📊 Ключевые биомаркеры (HRV, Пульс в покое, Кислород, Дыхание) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#161c26] border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>HRV (Вариабельность)</span>
            <Zap className="w-3 h-3 text-[#00e676]" />
          </div>
          <div className="text-lg font-black text-white font-mono">
            {current.hrv || 48} <span className="text-[10px] text-slate-400 font-sans">мс</span>
          </div>
        </div>

        <div className="bg-[#161c26] border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>RHR (Пульс в покое)</span>
            <Heart className="w-3 h-3 text-[#ff3b30]" />
          </div>
          <div className="text-lg font-black text-white font-mono">
            {current.rhr || 56} <span className="text-[10px] text-slate-400 font-sans">уд/м</span>
          </div>
        </div>

        <div className="bg-[#161c26] border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Кислород (SpO2)</span>
            <Wind className="w-3 h-3 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-white font-mono">
            {current.spo2 || 98.2}%
          </div>
        </div>

        <div className="bg-[#161c26] border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Калории за день</span>
            <Flame className="w-3 h-3 text-[#ffb800]" />
          </div>
          <div className="text-lg font-black text-white font-mono">
            {current.calories_burned || 2050} <span className="text-[10px] text-slate-400 font-sans">ккал</span>
          </div>
        </div>
      </div>
    </div>
  );
}
