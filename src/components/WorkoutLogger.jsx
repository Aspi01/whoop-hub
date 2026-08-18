import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Dumbbell, Timer, Check, Bookmark, FolderPlus, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api.js';

// Звуковой сигнал таймера отдыха (Web Audio API)
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
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'templates' | 'history'

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

  // Быстрый таймер отдыха (плавающий мини-таймер)
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [isRestTimerRunning, setIsRestTimerRunning] = useState(false);
  const timerRef = useRef(null);

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

  // Таймер отдыха
  useEffect(() => {
    if (isRestTimerRunning && restSecondsLeft > 0) {
      timerRef.current = setInterval(() => {
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
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRestTimerRunning, restSecondsLeft]);

  const startRestTimer = (seconds = 90) => {
    setRestSecondsLeft(seconds);
    setIsRestTimerRunning(true);
  };

  // ➕ Добавление нового упражнения (вверх списка)
  const addExercise = () => {
    setExercises([
      { name: '', sets: [{ weight: 40, reps: 10, done: false }] },
      ...exercises
    ]);
  };

  // ⚡ Выбор упражнения из быстрых пресетов
  const handleSelectPreset = (presetName) => {
    const previousSets = lastSetsMap[presetName];
    const initialSets = previousSets && previousSets.length > 0
      ? previousSets.map(s => ({ weight: s.weight, reps: s.reps, done: false }))
      : [{ weight: 30, reps: 10, done: false }];

    // Если есть пустое упражнение, заполняем его, иначе добавляем
    const emptyIdx = exercises.findIndex(e => !e.name || !e.name.trim());
    if (emptyIdx !== -1) {
      const updated = [...exercises];
      updated[emptyIdx] = { name: presetName, sets: initialSets };
      setExercises(updated);
    } else {
      setExercises([{ name: presetName, sets: initialSets }, ...exercises]);
    }
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

  // Завершение и сохранение тренировки
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
    <div className="space-y-3.5 pb-52">
      {/* ⏱ Плавающий таймер отдыха (если запущен) */}
      {restSecondsLeft > 0 && (
        <div className="sticky top-2 z-30 bg-indigo-950/90 border border-indigo-500/50 backdrop-blur-md rounded-2xl p-2.5 px-4 flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-xs text-slate-300 font-medium">Отдых между сетами:</span>
            <span className="text-base font-mono font-black text-white">
              {Math.floor(restSecondsLeft / 60)}:{String(restSecondsLeft % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRestSecondsLeft(prev => prev + 30)}
              className="px-2 py-1 bg-indigo-800/60 rounded-lg text-[10px] font-bold text-indigo-200"
            >
              +30с
            </button>
            <button
              onClick={() => { setRestSecondsLeft(0); setIsRestTimerRunning(false); }}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Верхняя панель переключения вкладок */}
      <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          🏋️‍♂️ Тренировка
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          📋 Шаблоны ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          📊 История
        </button>
      </div>

      {/* 🟢 ВКЛАДКА ТРЕНИРОВКИ (100% Mobile First) */}
      {activeTab === 'log' && (
        <form onSubmit={handleSaveWorkout} className="space-y-3.5">
          {/* 1. ГЛАВНАЯ КНОПКА СВЕРХУ ЭКРАНА */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={addExercise}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-98 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Добавить упражнение</span>
            </button>

            {/* Быстрый горизонтальный скролл популярных пресетов */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
              {presets.slice(0, 10).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-indigo-950 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-indigo-400" />
                  <span>{preset}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Заголовок тренировки */}
          <div className="glass-card rounded-2xl p-3 flex items-center justify-between">
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
              className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 cursor-pointer"
            >
              <Bookmark className="w-3 h-3" />
              <span>В шаблон</span>
            </button>
          </div>

          {/* Модальное окно сохранения шаблона */}
          {isTemplateModalOpen && (
            <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-3.5 space-y-2 shadow-2xl">
              <span className="text-xs font-bold text-white block">Сохранить тренировку как шаблон:</span>
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
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs cursor-pointer"
                >
                  ОК
                </button>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-2.5 py-2 text-slate-400 text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Карточки упражнений */}
          <div className="space-y-3">
            {exercises.map((ex, exIdx) => (
              <div key={exIdx} className="glass-card rounded-2xl p-3.5 space-y-2.5">
                {/* Название упражнения и удаление */}
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
                      placeholder="Введите название упражнения..."
                      className="w-full bg-transparent font-bold text-sm text-white focus:outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(exIdx)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
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
                      <span className="col-span-2 text-xs font-mono font-bold text-slate-400 pl-1">
                        #{setIdx + 1}
                      </span>
                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          value={set.weight}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1 text-center font-mono font-bold text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
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
                          className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                            set.done
                              ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/30'
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
                  className="w-full py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-dashed border-slate-800 text-xs font-medium text-slate-400 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Добавить подход</span>
                </button>
              </div>
            ))}
          </div>

          {/* 🏁 ФИКСИРОВАННАЯ КНОПКА ЗАВЕРШЕНИЯ ТРЕНИРОВКИ */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-emerald-500/25 active:scale-98 transition-all"
            >
              <Check className="w-5 h-5 text-black font-bold" />
              <span>{isSaving ? 'Сохранение...' : `Завершить тренировку (${exercises.length} упр.)`}</span>
            </button>
          </div>
        </form>
      )}

      {/* 📋 ВКЛАДКА ШАБЛОНОВ */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 text-center text-slate-400 space-y-2">
              <FolderPlus className="w-8 h-8 mx-auto text-indigo-400 opacity-60" />
              <p className="text-xs font-medium">Нет сохраненных шаблонов.</p>
              <p className="text-[11px] text-slate-500">Наберите упражнения и нажмите кнопку «В шаблон»!</p>
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => handleLoadTemplate(tpl)}
                className="glass-card rounded-2xl p-3.5 flex items-center justify-between hover:border-indigo-500/50 transition-all cursor-pointer group"
              >
                <div className="space-y-0.5">
                  <span className="text-sm font-bold text-white group-hover:text-indigo-300">
                    {tpl.title}
                  </span>
                  <p className="text-[11px] text-slate-400">
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

      {/* 📊 ВКЛАДКА ИСТОРИИ */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {workouts.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 text-center text-slate-400">
              <p className="text-xs">История тренировок пуста.</p>
            </div>
          ) : (
            workouts.map((w) => (
              <div key={w.id} className="glass-card rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{w.date}</span>
                    <h3 className="text-sm font-bold text-white">{w.title}</h3>
                  </div>
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
                <div className="space-y-0.5 pt-1 border-t border-slate-800/60">
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
