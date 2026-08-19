import React, { useState } from 'react';
import { RefreshCw, ChevronRight, ArrowUpRight, HeartPulse, Wind, Flame, MoonStar, Activity } from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api.js';
import { PulseGlyph, SleepGlyph, StrainGlyph, TrendGlyph, IntelligenceGlyph } from './BrandGlyphs.jsx';

function Ring({ value, max = 100, color, size = 112, stroke = 7, children, className = '' }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, Number(value || 0) / max));
  return (
    <div className={`relative grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 108 108" className="absolute inset-0 w-full h-full -rotate-90 recovery-orbit">
        <circle cx="54" cy="54" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="animate-breathe-ring"
          style={{ transition: 'stroke-dashoffset .65s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      {children}
    </div>
  );
}

function Metric({ icon: Icon, label, value, unit, accent = 'text-slate-200', meta }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
      <div className="w-9 h-9 rounded-[13px] bg-white/[.035] border border-white/[.05] grid place-items-center shrink-0">
        <Icon className="w-[17px] h-[17px] text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold text-slate-500 tracking-wide">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className={`metric-number text-[22px] leading-none font-extrabold ${accent}`}>{value}</span>
          {unit && <span className="text-[10px] text-slate-500 font-semibold">{unit}</span>}
        </div>
      </div>
      {meta && <div className="text-[10px] text-slate-500 text-right max-w-[90px]">{meta}</div>}
    </div>
  );
}

export default function WhoopDashboard({ whoopData, onRefresh, onNavigate }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const current = whoopData?.current || {};

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await api.syncWhoop();
      await onRefresh();
      if ((current?.recovery_score || 0) >= 80) {
        confetti({ particleCount: 32, spread: 56, origin: { y: 0.62 } });
      }
    } catch (e) {
      console.warn('Ошибка синхронизации Whoop:', e.message);
      await onRefresh();
    } finally {
      setIsSyncing(false);
    }
  };

  const recScore = current.recovery_score ?? 68;
  const sleepScore = current.sleep_performance_pct ?? 88;
  const strainScore = current.strain ?? 6.9;
  const recoveryColor = recScore >= 67 ? '#22e0a2' : recScore >= 34 ? '#ffb84d' : '#ff617b';
  const statusText = recScore >= 67 ? 'Готов к нагрузке' : recScore >= 34 ? 'Умеренный день' : 'Приоритет — восстановление';
  const statusCopy = recScore >= 67
    ? 'Организм восстановился достаточно хорошо. Можно тренироваться по плану.'
    : recScore >= 34
      ? 'Держи нагрузку контролируемой и следи за самочувствием.'
      : 'Сегодня лучше снизить интенсивность и сфокусироваться на сне и стрессе.';

  const actualSleepMin = current.sleep_actual_min ?? 490;
  const sleepHours = Math.floor(actualSleepMin / 60);
  const sleepMins = actualSleepMin % 60;
  const sleepFormatted = `${sleepHours}ч ${sleepMins}м`;
  const hrv = current.hrv ?? 48;
  const rhr = current.rhr ?? 56;
  const spo2 = current.spo2 ?? 98.2;
  const respiration = current.respiratory_rate ?? current.respiration_rate ?? 16.3;
  const calories = current.calories_burned ?? 2050;
  const targetLow = recScore >= 67 ? 10 : recScore >= 34 ? 7 : 4;
  const targetHigh = recScore >= 67 ? 13.5 : recScore >= 34 ? 10 : 7;

  const why = [
    { label: 'Сон', value: `${sleepScore}%`, tone: sleepScore >= 85 ? 'good' : 'warn' },
    { label: 'HRV', value: `${hrv} мс`, tone: 'good' },
    { label: 'RHR', value: `${rhr}`, tone: rhr < 60 ? 'good' : 'warn' }
  ];

  return (
    <div className="space-y-3.5 pb-28">
      <section className="surface overflow-hidden relative">
        <div className="absolute -top-20 -right-16 w-44 h-44 rounded-full bg-emerald-400/[.055] blur-3xl pointer-events-none" />
        <div className="p-4 pb-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow text-emerald-400/80">Сегодня · состояние</div>
              <h1 className="mt-1.5 text-[25px] leading-tight font-extrabold tracking-[-.035em] text-white">{statusText}</h1>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              aria-label="Обновить показатели"
              className="pressable w-10 h-10 rounded-[14px] bg-white/[.035] border border-white/[.06] grid place-items-center text-slate-400 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-300' : ''}`} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[126px_1fr] gap-4 items-center">
            <button type="button" onClick={handleSync} className="text-left pressable rounded-full">
              <Ring value={recScore} color={recoveryColor} size={126} stroke={6.5}>
                <div className="relative z-10 text-center">
                  <div className="metric-number text-[35px] leading-none font-extrabold text-white">{recScore}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[.17em] font-extrabold" style={{ color: recoveryColor }}>readiness</div>
                </div>
              </Ring>
            </button>

            <div className="space-y-2.5">
              <p className="text-[12px] leading-[1.55] text-slate-300">{statusCopy}</p>
              <div className="flex flex-wrap gap-1.5">
                {why.map((item) => (
                  <div key={item.label} className="px-2.5 py-1.5 rounded-full bg-white/[.035] border border-white/[.05] flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${item.tone === 'good' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-[9px] font-bold text-slate-500">{item.label}</span>
                    <span className="text-[10px] font-extrabold text-slate-200 metric-number">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('coach')}
          className="w-full px-4 py-3 border-t border-white/[.055] intelligence-strip flex items-center justify-between gap-3 text-left pressable"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[13px] bg-emerald-400/[.1] text-emerald-300 grid place-items-center shrink-0">
              <IntelligenceGlyph className="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-emerald-300/75 font-extrabold tracking-[.1em] uppercase">AI signal</div>
              <div className="text-[12px] text-white font-bold truncate">Целевая нагрузка сегодня {targetLow}–{targetHigh}</div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 shrink-0" />
        </button>
      </section>

      <section className="surface p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="eyebrow">Картина дня</div>
            <h2 className="mt-1 text-[16px] font-extrabold tracking-tight text-white">Восстановление в контексте</h2>
          </div>
          <TrendGlyph className="w-5 h-5 text-slate-500" />
        </div>

        <div className="divide-y divide-white/[.05]">
          <Metric icon={SleepGlyph} label="Сон" value={sleepFormatted} meta={`${sleepScore}% эффективности`} />
          <Metric icon={PulseGlyph} label="HRV" value={hrv} unit="мс" accent="text-emerald-300" meta="вариабельность" />
          <Metric icon={HeartPulse} label="Пульс в покое" value={rhr} unit="уд/мин" accent="text-rose-300" />
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('journal')}
          className="mt-3 w-full flex items-center justify-between gap-2 rounded-[16px] bg-white/[.028] border border-white/[.045] px-3.5 py-3 text-left pressable"
        >
          <div>
            <div className="text-[10px] text-slate-500 font-bold">Добавь контекст</div>
            <div className="mt-0.5 text-[12px] font-bold text-slate-200">Стресс, энергия, привычки и самочувствие</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
        </button>
      </section>

      <section className="surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Нагрузка</div>
            <h2 className="mt-1 text-[16px] font-extrabold tracking-tight text-white">Дневной Strain</h2>
          </div>
          <div className="text-right">
            <div className="metric-number text-[28px] leading-none font-extrabold text-indigo-300">{strainScore}</div>
            <div className="mt-1 text-[9px] text-slate-600 font-bold">из 21.0</div>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-white/[.05] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-300 transition-all duration-700"
            style={{ width: `${Math.min(100, (strainScore / 21) * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] font-semibold text-slate-600">
          <span>восстановление</span><span>оптимум {targetLow}–{targetHigh}</span><span>предел</span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('workouts')}
          className="mt-3 w-full rounded-[16px] bg-indigo-500/[.1] border border-indigo-400/[.16] px-3.5 py-3 flex items-center justify-between pressable"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[12px] bg-indigo-400/[.13] text-indigo-300 grid place-items-center"><StrainGlyph className="w-4 h-4" /></div>
            <div className="text-left">
              <div className="text-[11px] font-extrabold text-white">Открыть тренировку</div>
              <div className="text-[9px] text-slate-500 mt-0.5">таймеры · подходы · история</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-indigo-300/60" />
        </button>
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        <div className="surface p-3.5">
          <div className="flex items-center justify-between text-slate-500">
            <Wind className="w-4 h-4 text-cyan-300" />
            <span className="eyebrow !text-[8px]">SpO₂</span>
          </div>
          <div className="mt-3 metric-number text-[24px] leading-none font-extrabold text-white">{spo2}%</div>
          <div className="mt-1 text-[9px] text-slate-600">кислород крови</div>
        </div>
        <div className="surface p-3.5">
          <div className="flex items-center justify-between text-slate-500">
            <Activity className="w-4 h-4 text-emerald-300" />
            <span className="eyebrow !text-[8px]">Resp</span>
          </div>
          <div className="mt-3 metric-number text-[24px] leading-none font-extrabold text-white">{respiration}</div>
          <div className="mt-1 text-[9px] text-slate-600">вдохов / мин</div>
        </div>
        <div className="surface p-3.5 col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[13px] bg-amber-400/[.1] text-amber-300 grid place-items-center"><Flame className="w-4 h-4" /></div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold">Расход энергии</div>
              <div className="metric-number text-[20px] leading-tight font-extrabold text-white">{calories} <span className="text-[10px] text-slate-500 font-semibold">ккал</span></div>
            </div>
          </div>
          <div className="text-[9px] text-slate-600 text-right">на сегодня</div>
        </div>
      </section>
    </div>
  );
}
