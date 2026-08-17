import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, Dumbbell, Timer, Flame, Check, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';

// Звуковой синтезатор для таймера (Web Audio API)
const playBeep = (freq = 880, duration = 0.2) => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  } catch (e) {
    // pass
  }
};

export default function WorkoutLogger({ workoutsData, progressionData, onRefresh }) {
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'timer' | 'history'

  // Форма тренировки
  const [workoutTitle, setWorkoutTitle] = useState('Силовая тренировка');
  const [workoutType, setWorkoutType] = useState('Силовая');
  const [fatigueRpe, setFatigueRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(60);
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([
    { name: 'Жим штанги лежа', sets: [{ weight: 80, reps: 10, done: true }, { weight: 85, reps: 8, done: true }] }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  // Состояние Таймеров
  const [timerMode, setTimerMode] = useState('rest'); // 'rest' | 'tabata' | 'emom'
  const [timerDuration, setTimerDuration] = useState(90); // секунды
  const [timeLeft, setTimeLeft] = useState(90);
  const [isRunning, setIsRunning] = useState(false);
  const [tabataRound, setTabataRound] = useState(1);
  const [tabataPhase, setTabataPhase] = useState('work'); // 'work' (20s) | 'rest' (10s)

  const timerRef = useRef(null);

  // Управление таймером
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            playBeep(1200, 0.4);
            if (timerMode === 'tabata') {
              if (tabataPhase === 'work') {
                setTabataPhase('rest');
                return 10;
              } else {
                if (tabataRound < 8) {
                  setTabataRound(r => r + 1);
                  setTabataPhase('work');
                  return 20;
                } else {
                  setIsRunning(false);
                  return 0;
                }
              }
            } else if (timerMode === 'emom') {
              playBeep(880, 0.3);
              return 60; // следующий раунд
            }
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning, timeLeft, timerMode, tabataPhase, tabataRound]);

  const startRestTimer = (seconds) => {
    setTimerMode('rest');
    setTimerDuration(seconds);
    setTimeLeft(seconds);
    setIsRunning(true);
    setActiveTab('timer');
  };

  const resetTimer = () => {
    setIsRunning(false);
    if (timerMode === 'tabata') {
      setTabataRound(1);
      setTabataPhase('work');
      setTimeLeft(20);
    } else if (timerMode === 'emom') {
      setTimeLeft(60);
    } else {
      setTimeLeft(timerDuration);
    }
  };

  // Управление упражнениями
  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: [{ weight: 60, reps: 10, done: false }] }]);
  };

  const removeExercise = (idx) => {
    setExercises(exercises.filter((_, i) => i !== idx));
  };

  const addSet = (exIdx) => {
    const updated = [...exercises];
    const lastSet = updated[exIdx].sets[updated[exIdx].sets.length - 1] || { weight: 60, reps: 10 };
    updated[exIdx].sets.push({ weight: lastSet.weight, reps: lastSet.reps, done: false });
    setExercises(updated);
  };

  const updateSet = (exIdx, setIdx, field, val) => {
    const updated = [...exercises];
    updated[exIdx].sets[setIdx][field] = val;
    setExercises(updated);
  };

  const removeSet = (exIdx, setIdx) => {
    const updated = [...exercises];
    updated[exIdx].sets = updated[exIdx].sets.filter((_, i) => i !== setIdx);
    setExercises(updated);
  };

  const handleSaveWorkout = async (e) => {
    e.preventDefault();
    if (exercises.length === 0) return;

    try {
      setIsSaving(true);
      await api.saveWorkout({
        title: workoutTitle,
        type: workoutType,
        fatigue_rpe: fatigueRpe,
        duration_min: durationMin,
        strain: Number((fatigueRpe * 1.6 + 2).toFixed(1)),
        notes,
        exercises
      });

      alert('✅ Тренировка успешно записана!');
      await onRefresh();
      setActiveTab('history');
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const workouts = workoutsData?.workouts || [];
  const progression = progressionData?.progression || {};

  return (
    <div className="space-y-4 pb-24">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-indigo-400 font-bold">
            Тренировочный блок
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Силовые & Таймеры
          </h1>
        </div>
      </div>

      {/* Переключатель вкладок внутри тренировок */}
      <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'log' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Записать веса
        </button>
        <button
          onClick={() => setActiveTab('timer')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'timer' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          ⏱ Таймеры
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'history' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          История & Веса
        </button>
      </div>

      {/* ⏱ Вкладка 1: ТАЙМЕРЫ */}
      {activeTab === 'timer' && (
        <div className="glass-card rounded-3xl p-6 text-center space-y-5">
          {/* Режимы таймеров */}
          <div className="flex justify-center gap-2">
            {[
              { id: 'rest', label: 'Отдых между сетами' },
              { id: 'tabata', label: 'Tabata (20/10)' },
              { id: 'emom', label: 'EMOM' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setTimerMode(m.id);
                  if (m.id === 'tabata') { setTimeLeft(20); setTabataRound(1); setTabataPhase('work'); }
                  else if (m.id === 'emom') { setTimeLeft(60); }
                  else { setTimeLeft(90); }
                  setIsRunning(false);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timerMode === m.id ? 'bg-indigo-500 text-white' : 'bg-slate-800/80 text-slate-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Большой таймер */}
          <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className="stroke-slate-800" strokeWidth="8" fill="transparent" />
              <circle
                cx="60"
                cy="60"
                r="52"
                stroke={timerMode === 'tabata' && tabataPhase === 'work' ? '#22c55e' : '#6366f1'}
                strokeWidth="8"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - timeLeft / (timerMode === 'tabata' ? (tabataPhase === 'work' ? 20 : 10) : timerDuration))}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              {timerMode === 'tabata' && (
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  Раунд {tabataRound}/8 • {tabataPhase === 'work' ? '🔥 Работа' : '💤 Отдых'}
                </span>
              )}
              <span className="text-4xl font-black text-white font-mono tracking-tighter">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                {isRunning ? 'Идет отсчет' : 'Пауза'}
              </span>
            </div>
          </div>

          {/* Быстрые кнопки интервалов отдыха */}
          {timerMode === 'rest' && (
            <div className="flex justify-center gap-2">
              {[45, 60, 90, 120, 180].map(sec => (
                <button
                  key={sec}
                  onClick={() => { setTimerDuration(sec); setTimeLeft(sec); setIsRunning(false); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                    timerDuration === sec ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {sec}с
                </button>
              ))}
            </div>
          )}

          {/* Кнопки управления */}
          <div className="flex justify-center items-center gap-4 pt-2">
            <button
              onClick={resetTimer}
              className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="px-8 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/30 transition-all cursor-pointer"
            >
              {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isRunning ? 'Пауза' : 'Старт'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 🏋️‍♂️ Вкладка 2: ЗАПИСЬ ТРЕНИРОВКИ */}
      {activeTab === 'log' && (
        <form onSubmit={handleSaveWorkout} className="space-y-4">
          <div className="glass-card rounded-3xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Название тренировки
                </label>
                <input
                  type="text"
                  value={workoutTitle}
                  onChange={(e) => setWorkoutTitle(e.target.value)}
                  placeholder="Грудь + Спина..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Длительность (мин)
                </label>
                <input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Шкала усталости (RPE Fatigue Score 1-10) */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Уровень усталости / RPE:
                </span>
                <span className={`font-black font-mono text-sm px-2 py-0.5 rounded-lg ${
                  fatigueRpe >= 8 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                  fatigueRpe >= 6 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}>
                  {fatigueRpe} / 10 • {fatigueRpe >= 9 ? 'Предел сил' : fatigueRpe >= 7 ? 'Тяжело' : fatigueRpe >= 5 ? 'Умеренно' : 'Легко'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={fatigueRpe}
                onChange={(e) => setFatigueRpe(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block text-center">
                AI сопоставит этот показатель с вашим сном и калориями, чтобы объяснить причину утомляемости.
              </span>
            </div>
          </div>

          {/* Список упражнений и подходов */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Упражнения ({exercises.length})
              </span>
              <button
                type="button"
                onClick={addExercise}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 px-2.5 py-1 rounded-xl border border-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить упражнение</span>
              </button>
            </div>

            {exercises.map((ex, exIdx) => (
              <div key={exIdx} className="glass-card rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => {
                      const updated = [...exercises];
                      updated[exIdx].name = e.target.value;
                      setExercises(updated);
                    }}
                    placeholder="Название (напр. Жим гантелей)..."
                    className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeExercise(exIdx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Таблица сетов */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-2">
                    <span className="col-span-2">Сет</span>
                    <span className="col-span-4">Вес (кг)</span>
                    <span className="col-span-4">Повторения</span>
                    <span className="col-span-2 text-right">Отдых</span>
                  </div>

                  {ex.sets.map((s, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
                      <span className="col-span-2 text-xs font-mono font-bold text-slate-400 pl-1">
                        #{sIdx + 1}
                      </span>
                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          value={s.weight}
                          onChange={(e) => updateSet(exIdx, sIdx, 'weight', Number(e.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold text-center"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          value={s.reps}
                          onChange={(e) => updateSet(exIdx, sIdx, 'reps', Number(e.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold text-center"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startRestTimer(90)}
                          title="Запустить таймер отдыха 90с"
                          className="p-1 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-xs"
                        >
                          <Timer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => addSet(exIdx)}
                    className="text-[11px] font-bold text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Добавить подход</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
          >
            {isSaving ? 'Сохранение...' : 'Завершить и сохранить тренировку'}
          </button>
        </form>
      )}

      {/* 📊 Вкладка 3: ИСТОРИЯ И ПРОГРЕССИЯ */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            История тренировок ({workouts.length})
          </h2>

          {workouts.length === 0 ? (
            <div className="glass-card rounded-3xl p-6 text-center text-slate-400">
              Пока нет записанных тренировок.
            </div>
          ) : (
            workouts.map(w => (
              <div key={w.id} className="glass-card rounded-3xl p-4 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                      {w.date} • {w.duration_min} мин
                    </span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{w.title}</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    w.fatigue_rpe >= 8 ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    RPE {w.fatigue_rpe}/10
                  </span>
                </div>

                {/* Упражнения в карточке */}
                {Array.isArray(w.exercises) && w.exercises.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {w.exercises.map((ex, idx) => (
                      <div key={idx} className="text-xs text-slate-300 flex justify-between bg-slate-900/60 px-2.5 py-1 rounded-xl">
                        <span className="font-medium text-slate-200">{ex.name}</span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {ex.sets?.map(s => `${s.weight}кг×${s.reps}`).join(' | ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
