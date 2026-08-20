import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Check, Plus, Trash2, ChevronDown, ChevronUp, RotateCcw, X, Bookmark, Activity, Dumbbell, Flame } from 'lucide-react';
import { api } from '../services/api.js';

// Звуковой движок таймера (Web Audio API)
const getAudioCtx = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!window._whoopAudioCtx || window._whoopAudioCtx.state === 'closed') {
      window._whoopAudioCtx = new AudioContextClass();
    }
    if (window._whoopAudioCtx.state === 'suspended') {
      window._whoopAudioCtx.resume();
    }
    return window._whoopAudioCtx;
  } catch (e) {
    return null;
  }
};

const playBeep = (freq = 880, duration = 0.2) => {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
    if ('vibrate' in navigator) navigator.vibrate(60);
  } catch (e) {}
};

const QUICK_EXERCISES = [
  'Жим штанги лёжа',
  'Приседания со штангой',
  'Тяга верхнего блока',
  'Подтягивания',
  'Жим гантелей на наклонной',
  'Подъём на бицепс',
  'Становая тяга',
  'Отжимания на брусьях'
];

export default function WorkoutLogger({ workoutsData, progressionData, onRefresh, onOpenSettings }) {
  const [activeTrainTab, setActiveTrainTab] = useState('strength'); // 'strength' | 'timer' | 'templates' | 'history'
  
  // 🟢 Live Workout Session State (По умолчанию тренировка НЕ запущена)
  const [isWorkoutActive, setIsWorkoutActive] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_active_workout');
      return saved ? JSON.parse(saved).isActive : false;
    } catch (e) {
      return false;
    }
  });

  const [workoutStartTime, setWorkoutStartTime] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_active_workout');
      return saved ? JSON.parse(saved).startTime : null;
    } catch (e) {
      return null;
    }
  });

  const [workoutElapsedSec, setWorkoutElapsedSec] = useState(0);
  const [workoutType, setWorkoutType] = useState('strength'); // 'strength' | 'cardio' | 'intervals'
  const [workoutTitle, setWorkoutTitle] = useState('Силовая тренировка');
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [exercises, setExercises] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_active_workout');
      return saved && saved.exercises ? JSON.parse(saved).exercises : [];
    } catch (e) {
      return [];
    }
  });

  const [newExName, setNewExName] = useState('');
  const [isAddExModalOpen, setIsAddExModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Rest Timer state
  const [restSecLeft, setRestSecLeft] = useState(0);
  const [isRestRunning, setIsRestRunning] = useState(false);

  // Unified Timer Tab state
  const [timerMode, setTimerMode] = useState('stopwatch'); // 'stopwatch' | 'emom' | 'interval'
  const [timerWorkSec, setTimerWorkSec] = useState(60);
  const [timerRestSec, setTimerRestSec] = useState(60);
  const [timerRounds, setTimerRounds] = useState(10);
  const [timerPrepSec, setTimerPrepSec] = useState(10);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerPhase, setTimerPhase] = useState('work'); // 'work' | 'rest' | 'prep'
  const [timerCurrentRound, setTimerCurrentRound] = useState(1);
  const [timerSecLeft, setTimerSecLeft] = useState(60);

  // History and templates from DB
  const workouts = workoutsData?.workouts || [];
  const templates = [
    { title: 'Push A', count: '6 упражнений', letter: 'A', exercises: ['Жим штанги лёжа', 'Жим гантелей на наклонной', 'Отжимания на брусьях', 'Разводка гантелей'] },
    { title: 'Legs', count: '5 упражнений', letter: 'L', exercises: ['Приседания со штангой', 'Жим ногами', 'Выпады', 'Икры стоя'] },
    { title: 'Pull B', count: '5 упражнений', letter: 'B', exercises: ['Тяга верхнего блока', 'Подтягивания', 'Тяга штанги в наклоне', 'Подъём на бицепс'] },
    { title: 'Full Body', count: '6 упражнений', letter: 'F', exercises: ['Приседания', 'Жим лёжа', 'Тяга блока', 'Жим стоя'] }
  ];

  // Синхронизация состояния с localStorage
  useEffect(() => {
    if (isWorkoutActive && workoutStartTime) {
      localStorage.setItem('whoop_active_workout', JSON.stringify({
        isActive: true,
        startTime: workoutStartTime,
        workoutType,
        workoutTitle,
        exercises
      }));
    } else {
      localStorage.removeItem('whoop_active_workout');
    }
  }, [isWorkoutActive, workoutStartTime, workoutType, workoutTitle, exercises]);

  // Live timer tick
  useEffect(() => {
    let interval = null;
    if (isWorkoutActive && workoutStartTime) {
      const update = () => {
        const diff = Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000));
        setWorkoutElapsedSec(diff);
      };
      update();
      interval = setInterval(update, 1000);
    } else {
      setWorkoutElapsedSec(0);
    }
    return () => clearInterval(interval);
  }, [isWorkoutActive, workoutStartTime]);

  // Rest timer tick
  useEffect(() => {
    let interval = null;
    if (isRestRunning && restSecLeft > 0) {
      interval = setInterval(() => {
        setRestSecLeft(prev => {
          if (prev <= 1) {
            playBeep(1100, 0.4);
            setIsRestRunning(false);
            return 0;
          }
          if (prev === 4 || prev === 3 || prev === 2) {
            playBeep(880, 0.15);
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRestRunning, restSecLeft]);

  // Unified Timer tick
  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timerSecLeft > 0) {
      interval = setInterval(() => {
        setTimerSecLeft(prev => {
          if (prev <= 1) {
            playBeep(1200, 0.3);
            if (timerMode === 'interval') {
              if (timerPhase === 'work' && timerRestSec > 0) {
                setTimerPhase('rest');
                return timerRestSec;
              } else {
                if (timerCurrentRound >= timerRounds) {
                  setIsTimerRunning(false);
                  return 0;
                }
                setTimerCurrentRound(r => r + 1);
                setTimerPhase('work');
                return timerWorkSec;
              }
            } else if (timerMode === 'emom') {
              if (timerCurrentRound >= timerRounds) {
                setIsTimerRunning(false);
                return 0;
              }
              setTimerCurrentRound(r => r + 1);
              return 60;
            } else {
              setIsTimerRunning(false);
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSecLeft, timerPhase, timerCurrentRound, timerRounds, timerWorkSec, timerRestSec, timerMode]);

  // Calculate live metrics
  const totalTonnage = exercises.reduce((sum, ex) => {
    return sum + (ex.sets || []).reduce((sSum, s) => s.done ? sSum + (Number(s.weight) || 0) * (Number(s.reps) || 0) : sSum, 0);
  }, 0);

  // Live strain and calories
  const liveStrain = isWorkoutActive
    ? Math.min(20.5, Math.round((21 * (1 - Math.exp(-((workoutElapsedSec / 3600) * 0.45 + (totalTonnage / 12000) * 0.4)))) * 10) / 10)
    : 0;

  const liveCalories = isWorkoutActive
    ? Math.round((workoutElapsedSec / 60) * 5.2 + totalTonnage * 0.012)
    : 0;

  const formatTimer = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartWorkout = (type = 'strength') => {
    setWorkoutType(type);
    setWorkoutStartTime(Date.now());
    setIsWorkoutActive(true);
    setWorkoutElapsedSec(0);
    playBeep(880, 0.25);
  };

  const handleToggleSet = (exIdx, setIdx) => {
    setExercises(prev => {
      const updated = [...prev];
      const targetEx = { ...updated[exIdx] };
      const targetSets = [...targetEx.sets];
      const targetSet = { ...targetSets[setIdx] };
      targetSet.done = !targetSet.done;
      targetSets[setIdx] = targetSet;
      targetEx.sets = targetSets;
      updated[exIdx] = targetEx;
      return updated;
    });

    const currentDone = exercises[exIdx]?.sets?.[setIdx]?.done;
    if (!currentDone) {
      setRestSecLeft(90);
      setIsRestRunning(true);
      playBeep(900, 0.15);
    }
  };

  const handleSetChange = (exIdx, setIdx, field, value) => {
    setExercises(prev => {
      const updated = [...prev];
      const targetEx = { ...updated[exIdx] };
      const targetSets = [...targetEx.sets];
      targetSets[setIdx] = { ...targetSets[setIdx], [field]: Number(value) || 0 };
      targetEx.sets = targetSets;
      updated[exIdx] = targetEx;
      return updated;
    });
  };

  const handleAddSet = (exIdx) => {
    setExercises(prev => {
      const updated = [...prev];
      const targetEx = { ...updated[exIdx] };
      const lastSet = targetEx.sets[targetEx.sets.length - 1] || { weight: 40, reps: 10 };
      targetEx.sets = [...targetEx.sets, { weight: lastSet.weight, reps: lastSet.reps, done: false }];
      updated[exIdx] = targetEx;
      return updated;
    });
  };

  const handleRemoveSet = (exIdx, setIdx) => {
    setExercises(prev => {
      const updated = [...prev];
      const targetEx = { ...updated[exIdx] };
      targetEx.sets = targetEx.sets.filter((_, idx) => idx !== setIdx);
      updated[exIdx] = targetEx;
      return updated;
    });
  };

  const handleCompleteExerciseAndNext = () => {
    if (currentExIndex < exercises.length - 1) {
      setCurrentExIndex(prev => prev + 1);
    } else {
      alert('Все упражнения в очереди выполнены! Можно завершать тренировку.');
    }
  };

  const handleAddExercise = (nameToAdd) => {
    const name = nameToAdd || newExName;
    if (!name.trim()) return;
    setExercises(prev => [
      ...prev,
      {
        name: name.trim(),
        sets: [
          { weight: 40, reps: 10, done: false },
          { weight: 40, reps: 10, done: false },
          { weight: 40, reps: 10, done: false }
        ]
      }
    ]);
    setNewExName('');
    setIsAddExModalOpen(false);
  };

  const handleRemoveExercise = (exIdx) => {
    setExercises(prev => prev.filter((_, idx) => idx !== exIdx));
    if (currentExIndex >= exercises.length - 1) {
      setCurrentExIndex(Math.max(0, exercises.length - 2));
    }
  };

  const handleApplyTemplate = (tpl) => {
    setWorkoutTitle(tpl.title);
    setExercises(tpl.exercises.map(name => ({
      name,
      sets: [
        { weight: 50, reps: 10, done: false },
        { weight: 50, reps: 10, done: false },
        { weight: 50, reps: 10, done: false }
      ]
    })));
    setIsWorkoutActive(true);
    setWorkoutStartTime(Date.now());
    setActiveTrainTab('strength');
    alert(`Шаблон «${tpl.title}» загружен! Тренировка началась.`);
  };

  const handleFinishWorkout = async () => {
    if (!confirm('Завершить тренировку и сохранить в историю?')) return;
    try {
      setIsSaving(true);
      const cleanTitle = workoutTitle || (workoutType === 'cardio' ? 'Кардио на дорожке' : 'Силовая тренировка');
      const validExercises = exercises.filter(e => e.name && e.name.trim());
      
      await api.saveWorkout({
        title: cleanTitle,
        type: workoutType === 'cardio' ? 'Кардио' : workoutType === 'intervals' ? 'Интервалы' : 'Силовая',
        fatigue_rpe: 7,
        duration_min: Math.max(1, Math.round(workoutElapsedSec / 60)),
        strain: liveStrain || 8.5,
        avg_hr: 132,
        max_hr: 156,
        notes: `Калории: ~${liveCalories} ккал${totalTonnage > 0 ? ' | Тоннаж: ' + totalTonnage.toLocaleString() + ' кг' : ''}`,
        exercises: validExercises
      });

      alert(`✅ Тренировка «${cleanTitle}» успешно завершена и сохранена!`);
      
      // Сброс активного состояния
      setIsWorkoutActive(false);
      setWorkoutStartTime(null);
      setWorkoutElapsedSec(0);
      setExercises([]);
      setRestSecLeft(0);
      setIsRestRunning(false);
      localStorage.removeItem('whoop_active_workout');

      await onRefresh?.();
      setActiveTrainTab('history');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const currentExercise = exercises[currentExIndex];
  const currentDoneSets = (currentExercise?.sets || []).filter(s => s.done).length;
  const currentTotalSets = (currentExercise?.sets || []).length;
  const nextExercise = exercises[currentExIndex + 1];

  const applyTimerPreset = (preset) => {
    if (preset === '30') { setTimerWorkSec(30); setTimerSecLeft(30); }
    else if (preset === '60') { setTimerWorkSec(60); setTimerSecLeft(60); }
    else if (preset === '90') { setTimerWorkSec(90); setTimerSecLeft(90); }
    else if (preset === 'tabata') {
      setTimerMode('interval');
      setTimerWorkSec(20);
      setTimerRestSec(10);
      setTimerRounds(8);
      setTimerSecLeft(20);
      setTimerPhase('work');
    } else if (preset === 'emom10') {
      setTimerMode('emom');
      setTimerWorkSec(60);
      setTimerRounds(10);
      setTimerSecLeft(60);
    }
  };

  return (
    <div className="screen-shell pb-32">
      {/* Header */}
      <header className="header minorHeader">
        <div>
          <div className="headTitle">Тренировка</div>
          <div className="headSub">
            {isWorkoutActive ? 'Идёт запись тренировки' : 'Силовая · сегодня'}
          </div>
        </div>
        <button type="button" className="iconBtn" onClick={onOpenSettings} aria-label="Настройки">
          <svg viewBox="0 0 24 24">
            <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>
          </svg>
        </button>
      </header>

      {/* Tabs */}
      <div className="trainTabs">
        <button
          type="button"
          className={`trainTab ${activeTrainTab === 'strength' ? 'active' : ''}`}
          onClick={() => setActiveTrainTab('strength')}
        >
          Силовая
        </button>
        <button
          type="button"
          className={`trainTab ${activeTrainTab === 'timer' ? 'active' : ''}`}
          onClick={() => setActiveTrainTab('timer')}
        >
          Таймер
        </button>
        <button
          type="button"
          className={`trainTab ${activeTrainTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTrainTab('templates')}
        >
          Шаблоны
        </button>
        <button
          type="button"
          className={`trainTab ${activeTrainTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTrainTab('history')}
        >
          История
        </button>
      </div>

      {/* 1. Вкладка СИЛОВАЯ */}
      {activeTrainTab === 'strength' && (
        <div className="trainView">
          {/* СТАРТ ТРЕНИРОВКИ (Когда тренировка НЕ запущена) */}
          {!isWorkoutActive ? (
            <div className="space-y-4">
              <div className="trainStart">
                <div className="trainStartTop">
                  <div>
                    <div className="trainStartTitle">Готов к тренировке</div>
                    <div className="trainStartCopy">
                      Старт включает live-сессию и фиксирует нагрузку, пульс и время браслета Whoop.
                    </div>
                  </div>
                  <div className="deviceLine">
                    <i className="deviceDot" />Whoop подключён
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 my-3">
                  <button
                    type="button"
                    onClick={() => handleStartWorkout('strength')}
                    className="p-3 rounded-xl bg-[#0f1b22] hover:bg-[#152530] border border-[#26353e] text-center active:scale-95 transition-all"
                  >
                    <div className="text-lg mb-1">🏋️</div>
                    <div className="text-xs font-bold text-white">Силовая</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout('cardio')}
                    className="p-3 rounded-xl bg-[#0f1b22] hover:bg-[#152530] border border-[#26353e] text-center active:scale-95 transition-all"
                  >
                    <div className="text-lg mb-1">🏃</div>
                    <div className="text-xs font-bold text-white">Дорожка</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout('intervals')}
                    className="p-3 rounded-xl bg-[#0f1b22] hover:bg-[#152530] border border-[#26353e] text-center active:scale-95 transition-all"
                  >
                    <div className="text-lg mb-1">⏱️</div>
                    <div className="text-xs font-bold text-white">Интервалы</div>
                  </button>
                </div>

                <button
                  type="button"
                  className="startWorkout"
                  onClick={() => handleStartWorkout('strength')}
                >
                  НАЧАТЬ ТРЕНИРОВКУ
                </button>
              </div>

              {/* Быстрый выбор готового шаблона */}
              <div className="sectionHead compact">
                <div className="sectionLabel">Или начни по шаблону</div>
              </div>
              <div className="reasonList">
                {templates.slice(0, 3).map(tpl => (
                  <div
                    key={tpl.title}
                    className="reason"
                    onClick={() => handleApplyTemplate(tpl)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="miniGlyph accent">{tpl.letter}</div>
                    <div className="reasonName">{tpl.title}</div>
                    <div className="reasonMeta">{tpl.count}</div>
                    <div className="chev">›</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* АКТИВНЫЙ РЕЖИМ ТРЕНИРОВКИ */
            <div>
              {/* Lead bar */}
              <div className="workLead" style={{ paddingTop: '16px' }}>
                <div>
                  <div className="workTitle">
                    {currentExercise ? currentExercise.name : 'Активная сессия'}
                  </div>
                  <div className="workMeta">
                    {currentExercise
                      ? `Текущее упражнение · ${currentDoneSets} из ${currentTotalSets} подходов`
                      : 'Добавьте упражнение ниже'}
                  </div>
                </div>
                <div className="workTimer mono">
                  <b>{formatTimer(workoutElapsedSec)}</b>
                  <span>● live</span>
                </div>
              </div>

              {/* Inline Facts */}
              <div className="inlineFacts mono">
                <div className="inlineFact">
                  <span>Пульс</span>
                  <b>132</b>
                </div>
                <div className="inlineFact">
                  <span>Strain</span>
                  <b>{liveStrain || 4.2}</b>
                </div>
                <div className="inlineFact">
                  <span>Объём</span>
                  <b>{totalTonnage.toLocaleString()} кг</b>
                </div>
              </div>

              {/* Если упражнений пока нет в тренировке */}
              {exercises.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#09131a] border border-[#233139] my-4 text-center space-y-3">
                  <div className="text-sm font-bold text-white">Добавьте первое упражнение</div>
                  <div className="text-xs text-slate-400">
                    Выберите упражнение из списка или введите любое своё
                  </div>

                  <div className="quickRow justify-center">
                    {QUICK_EXERCISES.slice(0, 4).map(name => (
                      <button
                        key={name}
                        type="button"
                        className="quick"
                        onClick={() => handleAddExercise(name)}
                      >
                        + {name}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddExModalOpen(true)}
                    className="w-full py-2.5 bg-[#7cf0a5] hover:bg-[#68dd92] text-[#06120b] font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    + Ввести упражнение
                  </button>
                </div>
              ) : (
                /* Таблица подходов текущего упражнения */
                <>
                  <div className="sectionHead compact">
                    <div className="sectionLabel">Текущее упражнение</div>
                    <span className="contextPill">
                      {currentExercise.sets.length > 0 ? `${currentExercise.sets.length} подходов` : 'Новое'}
                    </span>
                  </div>

                  <div className="setHeader">
                    <div>Set</div>
                    <div>Вес кг</div>
                    <div>Повторы</div>
                    <div></div>
                  </div>

                  {currentExercise.sets.map((set, setIdx) => (
                    <div key={setIdx} className="setRow">
                      <div className="setNo">{String(setIdx + 1).padStart(2, '0')}</div>
                      <input
                        type="number"
                        step="0.5"
                        className="field"
                        value={set.weight}
                        onChange={(e) => handleSetChange(currentExIndex, setIdx, 'weight', e.target.value)}
                      />
                      <input
                        type="number"
                        className="field"
                        value={set.reps}
                        onChange={(e) => handleSetChange(currentExIndex, setIdx, 'reps', e.target.value)}
                      />
                      <button
                        type="button"
                        className={`check ${set.done ? 'done' : ''}`}
                        onClick={() => handleToggleSet(currentExIndex, setIdx)}
                        aria-label={set.done ? 'Выполнено' : 'Отметить'}
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="m5 12 4 4 10-10"/>
                        </svg>
                      </button>
                    </div>
                  ))}

                  <div className="mt-2 flex justify-between items-center px-1">
                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(currentExIndex)}
                      className="text-xs text-rose-400/60 hover:text-rose-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Удалить упражнение</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddSet(currentExIndex)}
                      className="text-xs text-[#7cf0a5] hover:underline font-bold px-2 py-1"
                    >
                      + Добавить подход
                    </button>
                  </div>

                  {/* Карточка перехода к следующему */}
                  {nextExercise && (
                    <div className="nextExercise">
                      <div>
                        <span>Следующее</span>
                        <b>{nextExercise.name} · {nextExercise.sets?.length || 3} подхода</b>
                      </div>
                      <button type="button" className="nextBtn" onClick={handleCompleteExerciseAndNext}>
                        Завершить и дальше
                      </button>
                    </div>
                  )}

                  {/* Очередь всех упражнений */}
                  <div className="sectionHead compact">
                    <div className="sectionLabel">Очередь упражнений</div>
                    <button type="button" className="linkBtn" onClick={() => setIsAddExModalOpen(true)}>
                      + Добавить
                    </button>
                  </div>

                  <div className="exerciseQueue">
                    {exercises.map((ex, idx) => {
                      const isCurrent = idx === currentExIndex;
                      const isDone = idx < currentExIndex;
                      const doneCount = ex.sets.filter(s => s.done).length;
                      const totalCount = ex.sets.length;

                      return (
                        <div
                          key={idx}
                          className={`exerciseItem ${isCurrent ? 'open' : isDone ? 'done' : ''}`}
                          onClick={() => setCurrentExIndex(idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="exerciseSummary">
                            <div>
                              <strong>{ex.name}</strong>
                              <small>
                                {isDone
                                  ? `${totalCount} подходов · готово`
                                  : `${doneCount}/${totalCount} подходов`}
                              </small>
                            </div>
                            <div className={`exerciseState ${isDone ? 'done' : isCurrent ? 'accent' : ''}`}>
                              {isDone ? 'Готово' : isCurrent ? 'Сейчас' : idx === currentExIndex + 1 ? 'Дальше' : `${idx + 1}-е`}
                            </div>
                            <button type="button" className="exerciseToggle">
                              {isCurrent ? '⌃' : '⌄'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Плавающий бар таймера отдыха */}
              {restSecLeft > 0 && (
                <div className="restBar mono">
                  <div>
                    <span>Отдых</span>
                    <b>{formatTimer(restSecLeft)}</b>
                  </div>
                  <button
                    type="button"
                    className="restAction"
                    onClick={() => { setRestSecLeft(prev => prev + 30); setIsRestRunning(true); }}
                  >
                    +30с
                  </button>
                  <button
                    type="button"
                    className="restAction"
                    onClick={() => { setRestSecLeft(0); setIsRestRunning(false); }}
                  >
                    Пропустить
                  </button>
                </div>
              )}

              {/* Кнопка завершения тренировки */}
              <button
                type="button"
                className="finish mt-4"
                disabled={isSaving}
                onClick={handleFinishWorkout}
              >
                {isSaving ? 'Сохранение...' : 'Завершить всю тренировку'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Вкладка ТАЙМЕР */}
      {activeTrainTab === 'timer' && (
        <div className="trainView">
          <div className="sectionHead compact">
            <div className="sectionLabel">Один таймер для всех сценариев</div>
            <span className="contextPill">зал-friendly</span>
          </div>

          <div className="timerModeRow">
            <button
              type="button"
              className={`timerMode ${timerMode === 'stopwatch' ? 'active' : ''}`}
              onClick={() => { setTimerMode('stopwatch'); setTimerSecLeft(60); setIsTimerRunning(false); }}
            >
              Секундомер<span>с опциональным отдыхом</span>
            </button>
            <button
              type="button"
              className={`timerMode ${timerMode === 'emom' ? 'active' : ''}`}
              onClick={() => { setTimerMode('emom'); setTimerSecLeft(60); setIsTimerRunning(false); }}
            >
              EMOM<span>старт каждую минуту</span>
            </button>
            <button
              type="button"
              className={`timerMode ${timerMode === 'interval' ? 'active' : ''}`}
              onClick={() => { setTimerMode('interval'); setTimerSecLeft(20); setTimerPhase('work'); setIsTimerRunning(false); }}
            >
              Интервалы<span>работа / отдых</span>
            </button>
          </div>

          {!isTimerRunning ? (
            <div id="timerSetup">
              <div className="timerDisplay">
                <div className="timerClock mono">{formatTimer(timerSecLeft)}</div>
                <div className="timerInfo">
                  <b>{timerMode === 'stopwatch' ? 'Секундомер' : timerMode === 'emom' ? 'EMOM' : 'Интервалы'}</b>
                  <span>{timerMode === 'stopwatch' ? 'Считай подход или упражнение' : timerMode === 'emom' ? '10 раундов по 1 минуте' : 'Tabata 20/10'}</span>
                </div>
              </div>

              <div className="timerFields">
                <div className="timerField">
                  <label>Работа</label>
                  <input
                    value={`${timerWorkSec} сек`}
                    onChange={(e) => setTimerWorkSec(parseInt(e.target.value) || 60)}
                    inputMode="numeric"
                  />
                </div>
                <div className="timerField">
                  <label>Перерыв</label>
                  <input
                    value={`${timerRestSec} сек`}
                    onChange={(e) => setTimerRestSec(parseInt(e.target.value) || 30)}
                    inputMode="numeric"
                  />
                </div>
                <div className="timerField">
                  <label>Раунды</label>
                  <input
                    value={timerRounds}
                    onChange={(e) => setTimerRounds(parseInt(e.target.value) || 8)}
                    inputMode="numeric"
                  />
                </div>
                <div className="timerField">
                  <label>Подготовка</label>
                  <input
                    value={`${timerPrepSec} сек`}
                    onChange={(e) => setTimerPrepSec(parseInt(e.target.value) || 10)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="timerPresets">
                <button type="button" onClick={() => applyTimerPreset('30')}>30с</button>
                <button type="button" onClick={() => applyTimerPreset('60')}>60с</button>
                <button type="button" onClick={() => applyTimerPreset('90')}>90с</button>
                <button type="button" className="hot" onClick={() => applyTimerPreset('tabata')}>Tabata 20/10</button>
                <button type="button" onClick={() => applyTimerPreset('emom10')}>EMOM ×10</button>
              </div>

              <button
                type="button"
                className="timerPrimary"
                onClick={() => { setIsTimerRunning(true); playBeep(880, 0.2); }}
              >
                СТАРТ
              </button>
            </div>
          ) : (
            <div id="timerRun">
              <div className="timerDisplay">
                <div className="sectionLabel">
                  {timerMode === 'stopwatch' ? 'Секундомер' : timerMode === 'emom' ? 'EMOM' : 'Интервалы'}
                </div>
                <div className="timerClock mono">{formatTimer(timerSecLeft)}</div>
                <div className="timerInfo">
                  <b className="accent">{timerPhase.toUpperCase()}</b>
                  <span>Раунд {timerCurrentRound} из {timerRounds}</span>
                </div>
                <div className="emomProgress">
                  {Array.from({ length: timerRounds }).map((_, idx) => (
                    <i
                      key={idx}
                      className={`roundDot ${idx < timerCurrentRound - 1 ? 'done' : idx === timerCurrentRound - 1 ? 'current' : ''}`}
                    />
                  ))}
                </div>
              </div>

              <div className="timerRunControls">
                <button
                  type="button"
                  className="primary"
                  onClick={() => setIsTimerRunning(false)}
                >
                  ПАУЗА
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (timerCurrentRound < timerRounds) {
                      setTimerCurrentRound(r => r + 1);
                      setTimerSecLeft(timerWorkSec);
                      setTimerPhase('work');
                      playBeep(900, 0.2);
                    } else {
                      setIsTimerRunning(false);
                      playBeep(1200, 0.4);
                    }
                  }}
                >
                  ДАЛЬШЕ
                </button>
                <button
                  type="button"
                  onClick={() => { setIsTimerRunning(false); setTimerCurrentRound(1); setTimerSecLeft(timerWorkSec); }}
                >
                  СТОП
                </button>
              </div>
              <div className="timerSecondary">
                <button type="button" onClick={() => setTimerSecLeft(s => s + 10)}>+10с</button>
                <button type="button" onClick={() => setTimerSecLeft(s => Math.max(0, s - 10))}>−10с</button>
                <button type="button" onClick={() => { setTimerPhase('rest'); setTimerSecLeft(timerRestSec); }}>Перерыв сейчас</button>
                <button type="button" onClick={() => playBeep(1000, 0.3)}>Звук 🔔</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Вкладка ШАБЛОНЫ */}
      {activeTrainTab === 'templates' && (
        <div className="trainView">
          <div className="sectionHead">
            <div className="sectionLabel">Мои шаблоны</div>
            <button type="button" className="linkBtn" onClick={() => setIsAddExModalOpen(true)}>
              + Новый
            </button>
          </div>
          <div className="reasonList">
            {templates.map(tpl => (
              <div
                key={tpl.title}
                className="reason"
                onClick={() => handleApplyTemplate(tpl)}
                style={{ cursor: 'pointer' }}
              >
                <div className="miniGlyph accent">{tpl.letter}</div>
                <div className="reasonName">{tpl.title}</div>
                <div className="reasonMeta">{tpl.count}</div>
                <div className="chev">›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Вкладка ИСТОРИЯ */}
      {activeTrainTab === 'history' && (
        <div className="trainView">
          <div className="sectionHead">
            <div className="sectionLabel">Последние тренировки</div>
            <span className="contextPill">Вся история</span>
          </div>
          <div className="mealList">
            {workouts.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                Пока нет сохранённых тренировок. Нажмите «Начать тренировку», чтобы зафиксировать первую активность.
              </div>
            ) : (
              workouts.map(w => (
                <div key={w.id} className="meal">
                  <div className="thumb">↗</div>
                  <div>
                    <small>
                      {w.created_at ? new Date(w.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Сегодня'} · {w.duration_min || 45} мин
                    </small>
                    <strong>{w.title || w.type || 'Тренировка'}</strong>
                    <div className="mealMeta">{w.notes || `RPE ${w.fatigue_rpe || 7}`}</div>
                  </div>
                  <div className="mealKcal">
                    <b>{w.strain || 11.2}</b>
                    <span>strain</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Модальное окно добавления упражнения */}
      {isAddExModalOpen && (
        <div className="modal open" onClick={() => setIsAddExModalOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Добавить упражнение</h2>
              <button type="button" className="close" onClick={() => setIsAddExModalOpen(false)}>×</button>
            </div>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                placeholder="Название упражнения..."
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExercise()}
                className="inputLine"
                autoFocus
              />
              <div className="quickRow">
                {QUICK_EXERCISES.map(qName => (
                  <button
                    key={qName}
                    type="button"
                    className="quick"
                    onClick={() => handleAddExercise(qName)}
                  >
                    + {qName}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="connect mt-4"
                onClick={() => handleAddExercise()}
              >
                Добавить в тренировку
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
