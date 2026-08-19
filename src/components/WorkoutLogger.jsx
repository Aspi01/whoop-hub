import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Timer, Check, Bookmark, FolderPlus, X, Play, Pause, RotateCcw, SkipForward, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../services/api.js';

// Звуковой сигнал таймера отдыха и EMOM (Web Audio API - singleton context to prevent leaks)
let globalAudioCtx = null;
const playBeep = (freq = 880, duration = 0.2) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
    const osc = globalAudioCtx.createOscillator();
    const gain = globalAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, globalAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(globalAudioCtx.destination);
    osc.start();
    osc.stop(globalAudioCtx.currentTime + duration);
    if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]);
  } catch (e) {
    console.warn('AudioContext beep error:', e);
  }
};

const DEFAULT_PRESETS = [
  'Жим гантелей лежа',
  'Жим штанги лежа',
  'Приседания со штангой',
  'Становая тяга',
  'Подтягивания',
  'Тяга верхнего блока',
  'Армейский жим стоя',
  'Отжимания на брусьях',
  'Подъем на бицепс',
  'Разгибания на трицепс',
  'Жим ногами в тренажере'
];

export default function WorkoutLogger({ workoutsData, progressionData, onRefresh }) {
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'emom' | 'templates' | 'history'

  // Форма тренировки
  const [workoutTitle, setWorkoutTitle] = useState('Силовая тренировка');
  const [exercises, setExercises] = useState([
    { name: 'Жим гантелей лежа', sets: [{ weight: 32, reps: 10, done: true }, { weight: 34, reps: 8, done: true }] }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  // Пресеты и шаблоны
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [lastSetsMap, setLastSetsMap] = useState({});
  const [templates, setTemplates] = useState([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');

  // ⏱️ 1. Стандартный таймер отдыха (компактный плавающий бар над нижней навигацией)
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [isRestTimerRunning, setIsRestTimerRunning] = useState(false);
  const [isRestExpanded, setIsRestExpanded] = useState(false);
  const restTimerRef = useRef(null);

  // ⏱️ 2. EMOM Таймер (Every Minute On the Minute)
  const [emomIntervalSec, setEmomIntervalSec] = useState(60);
  const [emomTotalRounds, setEmomTotalRounds] = useState(10);
  const [emomCurrentRound, setEmomCurrentRound] = useState(1);
  const [emomSecondsLeft, setEmomSecondsLeft] = useState(60);
  const [isEmomRunning, setIsEmomRunning] = useState(false);
  const emomTimerRef = useRef(null);

  // Загрузка пресетов и шаблонов
  const loadPresetsAndTemplates = async () => {
    try {
      const [presetsRes, templatesRes] = await Promise.allSettled([
        api.getWorkoutPresets(),
        api.getWorkoutTemplates()
      ]);
      if (presetsRes.status === 'fulfilled' && presetsRes.value?.presets) {
        setPresets(presetsRes.value.presets);
        if (presetsRes.value.lastSetsMap) setLastSetsMap(presetsRes.value.lastSetsMap);
      }
      if (templatesRes.status === 'fulfilled' && templatesRes.value?.templates) {
        setTemplates(templatesRes.value.templates);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadPresetsAndTemplates();
  }, []);

  // Управление стандартным таймером отдыха
  useEffect(() => {
    if (isRestTimerRunning && restSecondsLeft > 0) {
      restTimerRef.current = setInterval(() => {
        setRestSecondsLeft(prev => {
          if (prev <= 1) {
            playBeep(1200, 0.4);
            setIsRestTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(restTimerRef.current);
    }
    return () => clearInterval(restTimerRef.current);
  }, [isRestTimerRunning, restSecondsLeft]);

  const startRestTimer = (seconds = 90) => {
    setRestSecondsLeft(seconds);
    setIsRestTimerRunning(true);
  };

  const toggleRestTimer = () => {
    setIsRestTimerRunning(prev => !prev);
  };

  // Управление EMOM таймером
  useEffect(() => {
    if (isEmomRunning) {
      emomTimerRef.current = setInterval(() => {
        setEmomSecondsLeft(prev => {
          // Звуковые подсказки за 3, 2, 1 секунду до конца раунда
          if (prev === 4 || prev === 3 || prev === 2) {
            playBeep(660, 0.1);
          }

          if (prev <= 1) {
            playBeep(1320, 0.35); // Финальный сигнал нового раунда
            if (emomCurrentRound >= emomTotalRounds) {
              setIsEmomRunning(false);
              return 0;
            } else {
              setEmomCurrentRound(r => r + 1);
              return emomIntervalSec;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(emomTimerRef.current);
    }
    return () => clearInterval(emomTimerRef.current);
  }, [isEmomRunning, emomCurrentRound, emomTotalRounds, emomIntervalSec]);

  const handleEmomStart = () => {
    if (emomSecondsLeft === 0) {
      setEmomSecondsLeft(emomIntervalSec);
      setEmomCurrentRound(1);
    }
    setIsEmomRunning(true);
  };

  const handleEmomPause = () => {
    setIsEmomRunning(false);
  };

  const handleEmomReset = () => {
    setIsEmomRunning(false);
    setEmomCurrentRound(1);
    setEmomSecondsLeft(emomIntervalSec);
  };

  const handleEmomNextRound = () => {
    if (emomCurrentRound < emomTotalRounds) {
      setEmomCurrentRound(r => r + 1);
      setEmomSecondsLeft(emomIntervalSec);
      playBeep(1100, 0.2);
    } else {
      setIsEmomRunning(false);
      setEmomSecondsLeft(0);
    }
  };

  // Добавление нового упражнения (вверх списка)
  const addExercise = () => {
    setExercises(prev => [
      { name: '', sets: [{ weight: 40, reps: 10, done: false }] },
      ...prev
    ]);
  };

  // Выбор упражнения из быстрых пресетов
  const handleSelectPreset = (presetName) => {
    const previousSets = lastSetsMap[presetName];
    const initialSets = previousSets && previousSets.length > 0
      ? previousSets.map(s => ({ weight: s.weight, reps: s.reps, done: false }))
      : [{ weight: 30, reps: 10, done: false }];

    setExercises(prev => {
      const emptyIdx = prev.findIndex(e => !e.name || !e.name.trim());
      if (emptyIdx !== -1) {
        return prev.map((e, idx) => idx === emptyIdx ? { name: presetName, sets: initialSets } : e);
      }
      return [{ name: presetName, sets: initialSets }, ...prev];
    });
  };

  const removeExercise = (idx) => {
    setExercises(prev => prev.filter((_, i) => i !== idx));
  };

  // Иммутабельные обновления по веткам
  const addSet = (exIdx) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const lastSet = ex.sets[ex.sets.length - 1] || { weight: 40, reps: 10 };
      return {
        ...ex,
        sets: [...ex.sets, { weight: lastSet.weight, reps: lastSet.reps, done: false }]
      };
    }));
  };

  const updateSet = (exIdx, setIdx, field, val) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((set, sIdx) => {
          if (sIdx !== setIdx) return set;
          return { ...set, [field]: val };
        })
      };
    }));
  };

  const removeSet = (exIdx, setIdx) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.filter((_, sIdx) => sIdx !== setIdx)
      };
    }));
  };

  // Сохранение тренировки
  const handleSaveWorkout = async (e) => {
    e.preventDefault();
    const validExercises = exercises.filter(e => e.name && e.name.trim());
    if (validExercises.length === 0) {
      alert('Пожалуйста, добавьте хотя бы одно упражнение!');
      return;
    }

    try {
      setIsSaving(true);
      await api.saveWorkout({
        title: workoutTitle.trim() || 'Силовая тренировка',
        type: 'Силовая',
        fatigue_rpe: 7,
        duration_min: 60,
        strain: 12.5,
        exercises: validExercises
      });

      alert('✅ Тренировка успешно сохранена в базу!');
      await onRefresh();
      await loadPresetsAndTemplates();
      setActiveTab('history');
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Сохранить как шаблон
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    const validExercises = exercises.filter(e => e.name && e.name.trim());
    if (!newTemplateTitle.trim() || validExercises.length === 0) return;
    try {
      await api.createWorkoutTemplate({
        title: newTemplateTitle.trim(),
        type: 'Силовая',
        exercises: validExercises
      });
      setNewTemplateTitle('');
      setIsTemplateModalOpen(false);
      await loadPresetsAndTemplates();
      alert('✅ Шаблон сохранен!');
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleLoadTemplate = (tpl) => {
    setWorkoutTitle(tpl.title);
    if (tpl.exercises && tpl.exercises.length > 0) {
      setExercises(tpl.exercises.map(ex => ({
        name: ex.name,
        sets: (ex.sets || [{ weight: 40, reps: 10 }]).map(s => ({ weight: s.weight, reps: s.reps, done: false }))
      })));
    }
    setActiveTab('log');
  };

  const workouts = workoutsData?.workouts || [];

  return (
    <div className="space-y-3 pb-32">
      {/* ⏱️ Компактный плавающий бар таймера отдыха над нижней навигацией */}
      {restSecondsLeft > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl p-2 px-3.5 shadow-2xl shadow-black/80 flex items-center justify-between text-xs">
            <div
              className="flex items-center gap-2.5 cursor-pointer flex-1"
              onClick={() => setIsRestExpanded(prev => !prev)}
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                <Timer className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold leading-none">
                  Отдых
                </span>
                <span className="text-sm font-black font-mono text-white">
                  {Math.floor(restSecondsLeft / 60)}:{String(restSecondsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleRestTimer}
                aria-label={isRestTimerRunning ? 'Пауза' : 'Продолжить'}
                className="p-1.5 min-w-[36px] min-h-[36px] bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center cursor-pointer active:scale-95"
              >
                {isRestTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setRestSecondsLeft(prev => prev + 30)}
                className="px-2.5 py-1.5 min-h-[36px] bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 text-xs font-bold rounded-xl active:scale-95 cursor-pointer"
              >
                +30с
              </button>
              <button
                type="button"
                onClick={() => { setRestSecondsLeft(0); setIsRestTimerRunning(false); }}
                aria-label="Пропустить отдых"
                className="p-1.5 min-w-[36px] min-h-[36px] text-slate-400 hover:text-white rounded-xl flex items-center justify-center cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Раскрывающийся блок пресетов отдыха */}
          {isRestExpanded && (
            <div className="mt-1 bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-around gap-1 shadow-2xl">
              {[30, 60, 90, 120, 180].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => { setRestSecondsLeft(sec); setIsRestTimerRunning(true); }}
                  className="flex-1 py-1.5 bg-slate-800/80 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-xl transition-all"
                >
                  {sec >= 60 ? `${sec / 60}м` : `${sec}с`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Верхняя панель переключения вкладок */}
      <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          🏋️‍♂️ Силовая
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('emom')}
          className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'emom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          ⏱️ EMOM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          📋 Шаблоны
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          📊 История
        </button>
      </div>

      {/* 🏋️‍♂️ ВКЛАДКА 1: СИЛОВАЯ ТРЕНИРОВКА */}
      {activeTab === 'log' && (
        <form onSubmit={handleSaveWorkout} className="space-y-3">
          {/* Главная кнопка добавления сверху экрана */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={addExercise}
              className="w-full py-3 min-h-[46px] rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer active:scale-98 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить упражнение</span>
            </button>

            {/* Быстрые пресеты */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {presets.slice(0, 10).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="shrink-0 px-2.5 py-1 min-h-[32px] rounded-xl bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 text-[11px] font-medium flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-indigo-400" />
                  <span>{preset}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Заголовок тренировки */}
          <div className="glass-card rounded-2xl p-3 flex items-center justify-between gap-2">
            <input
              type="text"
              value={workoutTitle}
              onChange={(e) => setWorkoutTitle(e.target.value)}
              placeholder="Название тренировки"
              className="bg-transparent text-sm font-black text-white focus:outline-none flex-1"
            />
            <button
              type="button"
              onClick={() => setIsTemplateModalOpen(true)}
              className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-lg bg-indigo-500/10 border border-indigo-500/20 cursor-pointer active:scale-95"
            >
              <Bookmark className="w-3 h-3" />
              <span>В шаблон</span>
            </button>
          </div>

          {/* Модальное окно сохранения шаблона */}
          {isTemplateModalOpen && (
            <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-3.5 space-y-2 shadow-2xl">
              <span className="text-xs font-bold text-white block">Сохранить как шаблон:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  placeholder="Например: Грудь + Трицепс"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs cursor-pointer active:scale-95"
                >
                  ОК
                </button>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-2 py-2 text-slate-400 text-xs rounded-xl"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Карточки упражнений */}
          <div className="space-y-2.5">
            {exercises.map((ex, exIdx) => (
              <div key={exIdx} className="glass-card rounded-2xl p-3.5 space-y-2.5">
                {/* Название упражнения */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {exIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={ex.name}
                      onChange={(e) => {
                        const updated = [...exercises];
                        updated[exIdx].name = e.target.value;
                        setExercises(updated);
                      }}
                      placeholder="Введите упражнение..."
                      className="w-full bg-transparent font-bold text-sm text-white focus:outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(exIdx)}
                    aria-label="Удалить упражнение"
                    className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Таблица сетов */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-1">
                    <span className="col-span-2">Сет</span>
                    <span className="col-span-4 text-center">Вес (кг)</span>
                    <span className="col-span-4 text-center">Повторы</span>
                    <span className="col-span-2 text-right">Сделан</span>
                  </div>

                  {ex.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className={`grid grid-cols-12 gap-2 items-center rounded-xl p-1.5 px-2 border transition-all ${
                        set.done
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-slate-900/90 border-slate-800'
                      }`}
                    >
                      <div className="col-span-2 flex items-center gap-1">
                        <span className="text-xs font-mono font-bold text-slate-400 pl-0.5">
                          #{setIdx + 1}
                        </span>
                        {ex.sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSet(exIdx, setIdx)}
                            aria-label="Удалить подход"
                            className="text-slate-600 hover:text-rose-400 p-0.5 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          inputMode="decimal"
                          aria-label={`Вес для подхода ${setIdx + 1}`}
                          value={set.weight}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 text-center font-mono font-bold text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label={`Повторения для подхода ${setIdx + 1}`}
                          value={set.reps}
                          onChange={(e) => updateSet(exIdx, setIdx, 'reps', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 text-center font-mono font-bold text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const newDone = !set.done;
                            updateSet(exIdx, setIdx, 'done', newDone);
                            if (newDone) startRestTimer(90);
                          }}
                          aria-label={set.done ? 'Подход выполнен' : 'Отметить подход'}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all active:scale-90 ${
                            set.done
                              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Добавить подход */}
                <button
                  type="button"
                  onClick={() => addSet(exIdx)}
                  className="w-full py-1.5 min-h-[34px] rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-dashed border-slate-800 text-xs font-medium text-slate-400 flex items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Добавить подход</span>
                </button>
              </div>
            ))}
          </div>

          {/* Фиксированная кнопка завершения тренировки */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Check className="w-4 h-4 text-slate-950 font-bold" />
              <span>{isSaving ? 'Сохранение...' : `Завершить тренировку (${exercises.length} упр.)`}</span>
            </button>
          </div>
        </form>
      )}

      {/* ⏱️ ВКЛАДКА 2: EMOM ТАЙМЕР */}
      {activeTab === 'emom' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 text-center space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/5 pb-2.5">
              <span className="uppercase font-bold tracking-wider text-indigo-400">
                Режим EMOM
              </span>
              <span className="font-mono font-bold">
                Раунд {emomCurrentRound} из {emomTotalRounds}
              </span>
            </div>

            {/* Большой таймер обратного отсчета */}
            <div className="py-2">
              <div className="text-5xl sm:text-6xl font-black font-mono text-white tracking-tight">
                {Math.floor(emomSecondsLeft / 60)}:{String(emomSecondsLeft % 60).padStart(2, '0')}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {isEmomRunning ? '🔥 Раунд активен' : emomSecondsLeft === 0 ? '🏆 Тренировка завершена!' : 'Нажмите Старт для начала'}
              </span>
            </div>

            {/* Прогресс-бар текущего раунда */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${(emomSecondsLeft / emomIntervalSec) * 100}%` }}
              />
            </div>

            {/* Главные кнопки управления */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleEmomReset}
                aria-label="Сброс EMOM"
                className="p-3 min-w-[48px] min-h-[48px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={isEmomRunning ? handleEmomPause : handleEmomStart}
                className={`flex-1 py-3.5 min-h-[48px] rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all shadow-lg ${
                  isEmomRunning
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 text-white shadow-indigo-500/25'
                }`}
              >
                {isEmomRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Пауза</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{emomSecondsLeft < emomIntervalSec ? 'Продолжить' : 'Старт EMOM'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleEmomNextRound}
                disabled={emomCurrentRound >= emomTotalRounds}
                aria-label="Следующий раунд"
                className="p-3 min-w-[48px] min-h-[48px] rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Настройки параметров EMOM */}
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Параметры EMOM
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block">Интервал раунда:</span>
                <select
                  value={emomIntervalSec}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    setEmomIntervalSec(sec);
                    if (!isEmomRunning) setEmomSecondsLeft(sec);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white font-mono font-bold focus:outline-none"
                >
                  <option value={30}>30 секунд</option>
                  <option value={45}>45 секунд</option>
                  <option value={60}>60 секунд (1 мин)</option>
                  <option value={90}>90 секунд (1.5 мин)</option>
                  <option value={120}>120 секунд (2 мин)</option>
                </select>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block">Количество раундов:</span>
                <select
                  value={emomTotalRounds}
                  onChange={(e) => setEmomTotalRounds(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white font-mono font-bold focus:outline-none"
                >
                  <option value={5}>5 раундов</option>
                  <option value={8}>8 раундов</option>
                  <option value={10}>10 раундов</option>
                  <option value={12}>12 раундов</option>
                  <option value={15}>15 раундов</option>
                  <option value={20}>20 раундов</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📋 ВКЛАДКА 3: ШАБЛОНЫ */}
      {activeTab === 'templates' && (
        <div className="space-y-2.5">
          {templates.length === 0 ? (
            <div className="glass-card rounded-2xl p-5 text-center text-slate-400 space-y-2">
              <FolderPlus className="w-7 h-7 mx-auto text-indigo-400 opacity-60" />
              <p className="text-xs font-medium">Нет сохраненных шаблонов.</p>
              <p className="text-[11px] text-slate-500">Наберите упражнения и нажмите кнопку «В шаблон»!</p>
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => handleLoadTemplate(tpl)}
                className="glass-card rounded-2xl p-3.5 flex items-center justify-between hover:border-indigo-500/50 transition-all cursor-pointer group active:scale-98"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <span className="text-xs font-bold text-white group-hover:text-indigo-300 block truncate">
                    {tpl.title}
                  </span>
                  <p className="text-[11px] text-slate-400 truncate">
                    {tpl.exercises?.map(e => e.name).join(' • ')}
                  </p>
                </div>
                <span className="text-xs font-bold text-indigo-400 group-hover:underline shrink-0">
                  Загрузить →
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 📊 ВКЛАДКА 4: ИСТОРИЯ */}
      {activeTab === 'history' && (
        <div className="space-y-2.5">
          {workouts.length === 0 ? (
            <div className="glass-card rounded-2xl p-5 text-center text-slate-400">
              <p className="text-xs">История тренировок пуста.</p>
            </div>
          ) : (
            workouts.map((w) => (
              <div key={w.id} className="glass-card rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">{w.date}</span>
                    <h3 className="text-xs font-bold text-white">{w.title}</h3>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm('Удалить тренировку?')) {
                        await api.deleteWorkout(w.id);
                        await onRefresh();
                      }
                    }}
                    aria-label="Удалить тренировку"
                    className="text-slate-600 hover:text-rose-400 p-1.5 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-0.5 pt-1 border-t border-white/5">
                  {w.exercises?.map((ex, i) => (
                    <div key={i} className="flex justify-between text-xs text-slate-300">
                      <span>{ex.name}</span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        {ex.sets?.map(s => `${s.weight}кг × ${s.reps}`).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
