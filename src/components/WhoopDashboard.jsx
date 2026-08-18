import React, { useState } from 'react';
import { RefreshCw, Heart, Moon, Flame, Zap, ShieldCheck, Wind, BatteryCharging, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function WhoopDashboard({ whoopData, onRefresh, onNavigate }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const current = whoopData?.current || {};
  const history = whoopData?.history || [];

  const handleSync = async () => {
    setIsSyncing(true);
    await onRefresh();
    setIsSyncing(false);
    if ((current?.recovery_score || 0) >= 80) {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    }
  };

  const recScore = current.recovery_score || 0;
  const isGreen = recScore >= 67;
  const isYellow = recScore >= 34 && recScore < 67;
  const isRed = recScore < 34;

  const recoveryColor = isGreen
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : isYellow
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  const recoveryStroke = isGreen ? '#22c55e' : isYellow ? '#f59e0b' : '#f43f5e';

  // Расчет часов и минут сна
  const sleepHours = Math.floor((current.sleep_actual_min || 0) / 60);
  const sleepMins = (current.sleep_actual_min || 0) % 60;

  const deepSleepMins = current.deep_sleep_min || 0;
  const remSleepMins = current.rem_sleep_min || 0;
  const totalSleepMins = (current.sleep_actual_min || 1);
  const deepPct = Math.round((deepSleepMins / totalSleepMins) * 100);
  const remPct = Math.round((remSleepMins / totalSleepMins) * 100);

  return (
    <div className="space-y-4 pb-24">
      {/* Верхний заголовок статуса */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
              Whoop Дашборд
            </span>
            {whoopData?.isConnected ? (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                LIVE API
              </span>
            ) : (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                ДЕМО-РЕЖИМ
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Готовность тела
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${isGreen ? 'bg-emerald-400 shadow-emerald-500/50 shadow-lg' : isYellow ? 'bg-amber-400' : 'bg-rose-400'}`} />
          </h1>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-300 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{isSyncing ? 'Синхронизация...' : 'Обновить'}</span>
        </button>
      </div>

      {/* 🔋 Статус устройства Whoop */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-2.5 px-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white text-xs">Whoop Sensor</span>
          <span className="text-[10px] text-slate-400">• В сети (BLE Sync)</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
          <BatteryCharging className="w-3.5 h-3.5" />
          <span>85%</span>
        </div>
      </div>

      {/* Главная карточка Recovery Dial (оригинальная боковая структура) */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          {/* Круговой индикатор Recovery */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  className="stroke-slate-800"
                  strokeWidth="9"
                  fill="transparent"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke={recoveryStroke}
                  strokeWidth="9"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 * (1 - recScore / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl sm:text-3xl font-black tracking-tighter text-white font-mono">
                  {recScore}%
                </span>
                <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${recoveryColor}`}>
                  {isGreen ? 'Зеленая' : isYellow ? 'Желтая' : 'Красная'}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
              Recovery
            </span>
          </div>

          {/* Ключевые биомаркеры (HRV, Пульс) */}
          <div className="flex-1 space-y-2">
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Вариабельность (HRV)
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-white font-mono">{current.hrv || 0}</span>
                <span className="text-xs text-slate-400 font-medium">мс</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  Пульс в покое (RHR)
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-white font-mono">{current.rhr || 0}</span>
                <span className="text-xs text-slate-400 font-medium">уд/мин</span>
              </div>
            </div>
          </div>
        </div>

        {/* Дополнительные датчики (SpO2, Частота дыхания) */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Wind className="w-3.5 h-3.5 text-cyan-400" />
            <span>Кислород (SpO2): <strong className="text-white">{current.spo2 || 95.3}%</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Дыхание: <strong className="text-white">{current.respiratory_rate || 15.6} в/мин</strong></span>
          </div>
        </div>
      </div>

      {/* Карточка сна */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Качество сна</h2>
              <span className="text-xs text-slate-400">
                Эффективность: <strong className="text-indigo-300">{current.sleep_performance_pct || 90}%</strong>
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-white font-mono">
              {sleepHours}ч {sleepMins}м
            </span>
            <div className="text-[11px] text-slate-400">
              из {Math.floor((current.sleep_need_min || 480) / 60)}ч потребности
            </div>
          </div>
        </div>

        {/* Прогресс-бар фаз сна */}
        <div className="space-y-1.5 pt-2">
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${deepPct}%` }}
              className="bg-indigo-500 h-full"
              title="Глубокий сон"
            />
            <div
              style={{ width: `${remPct}%` }}
              className="bg-teal-400 h-full"
              title="REM сон"
            />
            <div
              style={{ width: `${100 - deepPct - remPct}%` }}
              className="bg-slate-600 h-full"
              title="Легкий сон"
            />
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Глубокий: <strong className="text-white">{deepSleepMins}м ({deepPct}%)</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span>REM: <strong className="text-white">{remSleepMins}м ({remPct}%)</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Дневная нагрузка (Strain) */}
      <div className="glass-card rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Дневной Strain</h2>
              <span className="text-xs text-slate-400">
                Сожжено: <strong className="text-amber-300">{current.calories_burned || 2400} ккал</strong>
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-amber-400 font-mono">
              {current.strain || 0}
            </span>
            <span className="text-xs text-slate-400"> / 21.0</span>
          </div>
        </div>

        {/* Strain Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2.5 mt-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, ((current.strain || 0) / 21) * 100)}%` }}
          />
        </div>
      </div>

      {/* Быстрый совет от AI Коуча */}
      <div
        onClick={() => onNavigate && onNavigate('coach')}
        className="glass-card glass-card-hover rounded-3xl p-4 border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 to-slate-900/60 cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              AI Инсайт дня
            </div>
            <div className="text-xs text-slate-200 mt-0.5 line-clamp-1">
              {isGreen 
                ? 'Отличный день для силовой тренировки и прогрессии весов!'
                : 'Рекомендуется легкая активность и ранний ужин для восстановления.'}
            </div>
          </div>
        </div>
        <span className="text-xs font-semibold text-emerald-400 shrink-0 ml-2">Спросить &rarr;</span>
      </div>
    </div>
  );
}
