import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, Dumbbell, Timer, Flame, Check, TrendingUp, AlertTriangle, Bookmark, FolderPlus, Sparkles } from 'lucide-react';
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
  } catch (e) {}
};

const DEFAULT_PRESETS = [
  'Жим гантелей лежа',
  'Жим штанги лежа',
  'Жим гантелей под углом',
  'Приседания со штангой',
  'Становая тяга',
  'Подтягивания с весом',
  'Тяга верхнего блока',
  'Армейский жим стоя',
  'Махи гантелями в стороны',
  'Отжимания на брусьях',
  'Подъем на бицепс',
  'Молотки с гантелями',
  'Французский жим',
  'Разгибания ног',
  'Сгибания ног лежа',
  'Жим ногами'
];

export default function WorkoutLogger({ workoutsData, progressionData, onRefresh }) {
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'timer' | 'templates' | 'history'

  // Форма тренировки
  const [workoutTitle, setWorkoutTitle] = useState('Силовая тренировка');
  const [workoutType, setWorkoutType] = useState('Силовая');
  const [fatigueRpe, setFatigueRpe] = useState(7);
  const [durationMin, setDurationMin] = useState(60);
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([
    { name: 'Жим гантелей лежа', sets: [{ weight: 32, reps: 10, done: true }, { weight: 34, reps: 8, done: true }] }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  // Пресеты и шаблоны
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [lastSetsMap, setLastSetsMap] = useState({});
  const [templates, setTemplates] = useState([]);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Состояние Таймеров
  const [timerMode, setTimerMode] = useState('rest'); // 'rest' | 'tabata' | 'emom'
  const [timerDuration, setTimerDuration] = useState(90); // секунды
  const [timeLeft, setTimeLeft] = useState(90);
  const [isRunning, setIsRunning] = useState(false);
  const [tabataRound, setTabataRound] = useState(1);
  const [tabataPhase, setTabataPhase] = useState('work'); // 'work' (20s) | 'rest' (10s)

  const timerRef = useRef(null);

  // Загрузка пресетов и шаблонов с сервера
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
              return 60;
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

  // 🏋️‍♂️ Выбор упражнения из пресета с авто-подстановкой последних весов
  const handleSelectPreset = (presetName) => {
    const previousSets = lastSetsMap[presetName];
    const initialSets = previousSets && previousSets.length > 0
      ? previousSets.map(s => ({ weight: s.weight, reps: s.reps, done: false }))
      : [{ weight: 40, reps: 10, done: false }];

    // Если в форме есть пустое упражнение, заменяем его, иначе добавляем новое
    const emptyIdx = exercises.findIndex(e => !e.name || !e.name.trim());
    if (emptyIdx !== -1) {
      const updated = [...exercises];
      updated[emptyIdx] = { name: presetName, sets: initialSets };
      setExercises(updated);
    } else {
      setExercises([...exercises, { name: presetName, sets: initialSets }]);
    }
  };

  // 📋 Загрузка готового шаблона тренировки
  const handleLoadTemplate = (tpl) => {
    setWorkoutTitle(tpl.title);
    setWorkoutType(tpl.type || 'Силовая');
    if (tpl.exercises && tpl.exercises.length > 0) {
      setExercises(tpl.exercises.map(ex => ({
        name: ex.name,
        sets: (ex.sets || [{ weight: 40, reps: 10 }]).map(s => ({ weight: s.weight, reps: s.reps, done: false }))
      })));
    }
    setActiveTab('log');
  };

  // 💾 Сохранение текущей тренировки как шаблона
  const handleSaveAsTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || exercises.length === 0) return;
    try {
      await api.createWorkoutTemplate({
        title: newTemplateTitle.trim(),
        type: workoutType,
        exercises
      });
      setNewTemplateTitle('');
      setIsSavingTemplate(false);
      await loadPresetsAndTemplates();
      alert('✅ Шаблон тренировки успешно сохранен!');
    } catch (err) {
      alert('Ошибка сохранения шаблона: ' + err.message);
    }
  };

  // 🗑️ Удаление шаблона
  const handleDeleteTemplate = async (tplId, e) => {
    e.stopPropagation();
    if (!confirm('Удалить этот шаблон?')) return;
    try {
      await api.deleteWorkoutTemplate(tplId);
      await loadPresetsAndTemplates();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  // Управление упражнениями
  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: [{ weight: 40, reps: 10, done: false }] }]);
  };

  const removeExercise = (idx) => {
    setExercises(exercises.filter((_, i) => i !== idx));
  };

  const addSet = (exIdx) => {
    const updated = [...exercises];
    const lastSet = updated[exIdx].sets[updated[exIdx].sets.length - 1] || { weight: 40, reps: 10 };
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

      alert('✅ Тренировка успешно записана в базу!');
      await onRefresh();
      await loadPresetsAndTemplates();
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
          Запись весов
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'templates' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Шаблоны ({templates.length})
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
          История
        </button>
      </div>

      {/* 🟢 ВКЛАДКА 1: ЗАПИСАТЬ ВЕСА С ПРЕСЕТАМИ */}
      {activeTab === 'log' && (
        <form onSubmit={handleSaveWorkout} className="space-y-4">
          {/* Быстрый выбор из ваших упражнений (Пресеты) */}
          <div className="glass-card rounded-3xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Быстрый выбор упражнения:
              </span>
              <span className="text-[10px] text-slate-500">1 тап для добавления</span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600/30 hover:border-indigo-500/50 text-slate-200 border border-slate-800 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-3 h-3 text-indigo-400" />
                  <span>{preset}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Параметры тренировки */}
          <div className="glass-card rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={workoutTitle}
                onChange={(e) => setWorkoutTitle(e.target.value)}
                placeholder="Название (например, Жим + Плечи)"
                className="bg-transparent text-base font-black text-white focus:outline-none flex-1 border-b border-transparent focus:border-indigo-500"
              />
              <select
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-indigo-300 font-bold"
              >
                <option value="Силовая">Силовая</option>
                <option value="Гипертрофия">Гипертрофия</option>
                <option value="Кроссфит / Функционал">Функционал</option>
                <option value="Кардио">Кардио</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Длительность (мин)
                </span>
                <input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="bg-transparent text-lg font-black text-white font-mono focus:outline-none w-full"
                />
              </div>

              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Усталость (RPE 1-10)
                </span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={fatigueRpe}
                  onChange={(e) => setFatigueRpe(Number(e.target.value))}
                  className="bg-transparent text-lg font-black text-amber-400 font-mono focus:outline-none w-full"
                />
              </div>
            </div>
          </div>

          {/* Список упражнений в тренировке */}
          <div className="space-y-3">
            {exercises.map((ex, exIdx) => (
              <div key={exIdx} className="glass-card rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400">
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
                      placeholder="Название упражнения"
                      className="bg-transparent font-bold text-sm text-white focus:outline-none flex-1 border-b border-transparent focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(exIdx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Подходы (Sets) */}
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-slate-500 px-1">
                    <span className="col-span-2">Сет</span>
                    <span className="col-span-4 text-center">Вес (кг)</span>
                    <span className="col-span-4 text-center">Повторы</span>
                    <span className="col-span-2 text-right">Статус</span>
                  </div>

                  {ex.sets.map((set, setIdx) => (
                    <div key={setIdx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/60 border border-slate-800/60 rounded-xl p-2">
                      <span className="col-span-2 text-xs font-mono font-bold text-slate-400 pl-1">
                        #{setIdx + 1}
                      </span>
                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          value={set.weight}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 text-center font-mono font-bold text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSet(exIdx, setIdx, 'reps', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 text-center font-mono font-bold text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            updateSet(exIdx, setIdx, 'done', !set.done);
                            if (!set.done) {
                              startRestTimer(90);
                            }
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                            set.done
                              ? 'bg-emerald-500 text-black font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addSet(exIdx)}
                  className="w-full py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-dashed border-slate-800 text-xs font-medium text-slate-400 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить сет</span>
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addExercise}
              className="flex-1 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Добавить упражнение</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSavingTemplate(true)}
              className="px-3.5 py-3 rounded-2xl bg-slate-900 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Сохранить эти упражнения как шаблон"
            >
              <Bookmark className="w-4 h-4" />
              <span>В шаблон</span>
            </button>
          </div>

          {/* Модальное окно сохранения шаблона */}
          {isSavingTemplate && (
            <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-white block">Сохранить тренировку как шаблон:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  placeholder="Например, День груди и трицепса"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingTemplate(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Кнопка завершения и сохранения всей тренировки */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Сохранение...' : 'Завершить и сохранить тренировку'}</span>
          </button>
        </form>
      )}

      {/* 📋 ВКЛАДКА 2: ГОТОВЫЕ ШАБЛОНЫ ТРЕНИРОВОК */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Ваши сохраненные шаблоны:
            </span>
          </div>

          {templates.length === 0 ? (
            <div className="glass-card rounded-3xl p-6 text-center text-slate-400 space-y-2">
              <FolderPlus className="w-8 h-8 mx-auto text-indigo-400 opacity-60" />
              <p className="text-xs font-medium">У вас пока нет сохраненных шаблонов.</p>
              <p className="text-[11px] text-slate-500">Наберите упражнения во вкладке «Запись весов» и нажмите кнопку «В шаблон»!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleLoadTemplate(tpl)}
                  className="glass-card rounded-2xl p-4 flex items-center justify-between hover:border-indigo-500/50 transition-all cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {tpl.title}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {tpl.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {tpl.exercises?.map(e => e.name).join(' • ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400 group-hover:underline">
                      Загрузить →
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ⏱ ВКЛАДКА 3: ТАЙМЕРЫ */}
      {activeTab === 'timer' && (
        <div className="glass-card rounded-3xl p-6 text-center space-y-6">
          <div className="flex justify-center gap-2">
            <button
              onClick={() => { setTimerMode('rest'); setTimeLeft(90); setIsRunning(false); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold ${timerMode === 'rest' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Отдых между сетами
            </button>
            <button
              onClick={() => { setTimerMode('tabata'); setTimeLeft(20); setTabataRound(1); setIsRunning(false); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold ${timerMode === 'tabata' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Табата (20/10)
            </button>
            <button
              onClick={() => { setTimerMode('emom'); setTimeLeft(60); setIsRunning(false); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold ${timerMode === 'emom' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              EMOM (1 мин)
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-6xl font-black font-mono tracking-tighter text-white">
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
            {timerMode === 'tabata' && (
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Раунд {tabataRound}/8 • {tabataPhase === 'work' ? '🔥 РАБОТА' : '☕ ОТДЫХ'}
              </div>
            )}
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 cursor-pointer"
            >
              {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            <button
              onClick={resetTimer}
              className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          <div className="flex justify-center gap-2 pt-2">
            {[60, 90, 120, 180].map((sec) => (
              <button
                key={sec}
                onClick={() => { setTimeLeft(sec); setTimerDuration(sec); setIsRunning(false); }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:text-white"
              >
                {sec}с
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 📊 ВКЛАДКА 4: ИСТОРИЯ ТРЕНИРОВОК */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {workouts.length === 0 ? (
            <div className="glass-card rounded-3xl p-6 text-center text-slate-400">
              <p className="text-xs">История тренировок пуста. Запишите свою первую тренировку!</p>
            </div>
          ) : (
            workouts.map((w) => (
              <div key={w.id} className="glass-card rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{w.date}</span>
                    <h3 className="text-sm font-bold text-white">{w.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                      RPE {w.fatigue_rpe}
                    </span>
                    <button
                      onClick={async () => {
                        if (confirm('Удалить тренировку?')) {
                          await api.deleteWorkout(w.id);
                          await onRefresh();
                        }
                      }}
                      className="text-slate-600 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-800/60">
                  {w.exercises?.map((ex, i) => (
                    <div key={i} className="flex justify-between text-xs text-slate-300">
                      <span>{ex.name}</span>
                      <span className="font-mono text-slate-400">
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
