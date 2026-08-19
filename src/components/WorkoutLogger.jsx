import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Timer, Check, Bookmark, FolderPlus, X, Play, Pause, RotateCcw, SkipForward, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../services/api.js';

// 🎵 Звуковой движок таймера тренировок (Web Audio API)
let globalAudioCtx = null;
const getAudioCtx = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
    return globalAudioCtx;
  } catch (e) {
    return null;
  }
};

// 1. Мелодичный кристальный колокольчик отсчета (3.. 2.. 1..) - чистый звук как в часах Apple/Garmin
const playCountdownBeep = (freq = 880, duration = 0.22) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Фундаментальный тон + гармонический обертон для чистого, мягкого и сочного звука
    [freq, freq * 1.5].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      const vol = idx === 0 ? 0.45 : 0.15;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
    if ('vibrate' in navigator) navigator.vibrate(50);
  } catch (e) {}
};

// 2. Мощный стадионный мажорный гонг старта РАБОТЫ (E5 + G#5 + B5 + E6)
const playStartWorkSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Благородный мажорный аккорд колоколов (энергичный и чистый)
    const chord = [659.25, 830.61, 987.77, 1318.51];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.35 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.85);
    });
    if ('vibrate' in navigator) navigator.vibrate([160, 60, 160]);
  } catch (e) {}
};

// 3. Мягкий гармоничный дзен-колокол начала ОТДЫХА (Нисходящий мажор: G5 -> C5)
const playStartRestSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [
      { f: 783.99, t: 0, d: 0.6 },
      { f: 523.25, t: 0.12, d: 0.8 },
      { f: 659.25, t: 0.12, d: 0.8 }
    ];
    notes.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.35, now + t);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d);
    });
    if ('vibrate' in navigator) navigator.vibrate(120);
  } catch (e) {}
};

// 4. Триумфальная фанфара победного завершения тренировки
const playFinishVictorySound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    arpeggio.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.4, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.6);
    });
    if ('vibrate' in navigator) navigator.vibrate([150, 80, 150, 80, 400]);
  } catch (e) {}
};

// 🔇 Бесшумный аудиотрек для поддержания работы аудио в фоне при заблокированном телефоне
const silentAudio = typeof Audio !== 'undefined' 
  ? new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA') 
  : null;
if (silentAudio) {
  silentAudio.loop = true;
}

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
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'timer' | 'templates' | 'history'

  // 🟢 0. Режим живой активной тренировки (Live Active Workout Session)
  const [isLiveWorkout, setIsLiveWorkout] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_live_workout');
      return saved ? JSON.parse(saved).isActive : false;
    } catch (e) {
      return false;
    }
  });
  const [liveStartTime, setLiveStartTime] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_live_workout');
      return saved ? JSON.parse(saved).startTime : null;
    } catch (e) {
      return null;
    }
  });
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [workoutRpe, setWorkoutRpe] = useState(7);
  const [workoutNotes, setWorkoutNotes] = useState('');
  const liveSessionTimerRef = useRef(null);

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

  // ⏱️ 1. Стандартный таймер отдыха
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [isRestTimerRunning, setIsRestTimerRunning] = useState(false);
  const [isRestExpanded, setIsRestExpanded] = useState(false);
  const restTimerRef = useRef(null);

  // ⏱️ 2. Универсальный таймер тренировок (Интервалы и AMRAP) в стиле Samsung Watch
  const [timerMode, setTimerMode] = useState('tabata'); // 'tabata' | 'amrap' | 'custom'
  const [workMinutes, setWorkMinutes] = useState(0);
  const [workSeconds, setWorkSeconds] = useState(20);
  const [restMinutes, setRestMinutes] = useState(0);
  const [restSeconds, setRestSeconds] = useState(10);
  const [totalRounds, setTotalRounds] = useState(8);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentPhase, setCurrentPhase] = useState('work'); // 'work' | 'rest'
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(20);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [amrapCompletedRounds, setAmrapCompletedRounds] = useState(0);
  
  // ⏱️ Подготовка 3-2-1
  const [prepCount, setPrepCount] = useState(null); // null | 3 | 2 | 1 | 0
  const prepTimerRef = useRef(null);
  const intervalTimerRef = useRef(null);
  const wakeLockRef = useRef(null);

  // 📊 Подсчет метрик тренировки в реальном времени
  const calculateTotalTonnage = () => {
    let total = 0;
    exercises.forEach(ex => {
      if (Array.isArray(ex.sets)) {
        ex.sets.forEach(s => {
          if (s.done) {
            total += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          }
        });
      }
    });
    return total;
  };

  const currentTonnage = calculateTotalTonnage();
  const completedSetsCount = exercises.reduce((acc, ex) => acc + (ex.sets?.filter(s => s.done).length || 0), 0);
  const totalSetsCount = exercises.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);

  // Расчет калорий и Strain
  const liveCalories = Math.round((liveElapsedSec / 60) * 7.5 + (currentTonnage * 0.012));
  const liveStrain = Math.min(20.5, Math.round(
    (21 * (1 - Math.exp(-((liveElapsedSec / 3600) * 0.55 + (currentTonnage / 15000) * 0.45)))) * 10
  ) / 10);

  // Расчет пульса и зоны
  const liveBpm = Math.min(178, Math.max(105, Math.round(128 + Math.sin(liveElapsedSec / 20) * 12 + (currentTonnage > 0 ? 8 : 0))));
  const hrZone = liveBpm < 115 ? 'Зона 1: Восстановление' : liveBpm < 135 ? 'Зона 2: Жиросжигание' : liveBpm < 155 ? 'Зона 3: Аэробная' : liveBpm < 172 ? 'Зона 4: Анаэробная' : 'Зона 5: Пик';

  // Таймер активной тренировки
  useEffect(() => {
    if (isLiveWorkout && liveStartTime) {
      const updateElapsed = () => {
        const sec = Math.max(0, Math.floor((Date.now() - liveStartTime) / 1000));
        setLiveElapsedSec(sec);
      };
      updateElapsed();
      liveSessionTimerRef.current = setInterval(updateElapsed, 1000);
    } else {
      clearInterval(liveSessionTimerRef.current);
    }
    return () => clearInterval(liveSessionTimerRef.current);
  }, [isLiveWorkout, liveStartTime]);

  // Сохранение активной сессии в localStorage
  useEffect(() => {
    if (isLiveWorkout && liveStartTime) {
      localStorage.setItem('whoop_live_workout', JSON.stringify({ isActive: true, startTime: liveStartTime }));
    } else {
      localStorage.removeItem('whoop_live_workout');
    }
  }, [isLiveWorkout, liveStartTime]);

  const startLiveWorkout = () => {
    const now = Date.now();
    setLiveStartTime(now);
    setLiveElapsedSec(0);
    setIsLiveWorkout(true);
    playStartWorkSound();
    if ('vibrate' in navigator) navigator.vibrate([150, 50, 150]);
  };

  const openFinishWorkoutModal = () => {
    setIsFinishModalOpen(true);
  };

  // Подтверждение завершения и запись в базу
  const handleConfirmFinishWorkout = async () => {
    const validExercises = exercises.filter(e => e.name && e.name.trim());
    if (validExercises.length === 0) {
      alert('Пожалуйста, добавьте хотя бы одно упражнение!');
      return;
    }

    const durationMin = Math.max(1, Math.round(liveElapsedSec / 60));

    try {
      setIsSaving(true);
      await api.saveWorkout({
        title: workoutTitle.trim() || 'Силовая тренировка',
        type: 'Силовая',
        duration_min: durationMin,
        strain: liveStrain || 10.0,
        avg_hr: liveBpm,
        max_hr: Math.min(185, liveBpm + 16),
        fatigue_rpe: workoutRpe,
        notes: `Калории: ~${liveCalories} ккал | Тоннаж: ${currentTonnage} кг${workoutNotes ? ' | ' + workoutNotes : ''}`,
        exercises: validExercises
      });

      playFinishVictorySound();
      alert(`🏆 Тренировка завершена и сохранена!\n⏱️ Время: ${durationMin} мин\n🔥 Калории: ~${liveCalories} ккал\n⚡ Strain: ${liveStrain}\n🏋️‍♂️ Тоннаж: ${currentTonnage} кг`);

      setIsLiveWorkout(false);
      setLiveStartTime(null);
      setLiveElapsedSec(0);
      setIsFinishModalOpen(false);
      localStorage.removeItem('whoop_live_workout');

      await onRefresh();
      await loadPresetsAndTemplates();
      setActiveTab('history');
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Выбор пресета таймера
  const selectTimerPreset = (mode) => {
    setIsTimerRunning(false);
    setPrepCount(null);
    clearInterval(prepTimerRef.current);
    setTimerMode(mode);
    setCurrentRound(1);
    setCurrentPhase('work');
    setAmrapCompletedRounds(0);

    if (mode === 'tabata') {
      setWorkMinutes(0);
      setWorkSeconds(20);
      setRestMinutes(0);
      setRestSeconds(10);
      setTotalRounds(8);
      setPhaseSecondsLeft(20);
    } else if (mode === 'amrap') {
      setWorkMinutes(15);
      setWorkSeconds(0);
      setRestMinutes(0);
      setRestSeconds(0);
      setTotalRounds(1);
      setPhaseSecondsLeft(15 * 60);
    } else if (mode === 'custom') {
      setWorkMinutes(0);
      setWorkSeconds(45);
      setRestMinutes(0);
      setRestSeconds(15);
      setTotalRounds(5);
      setPhaseSecondsLeft(45);
    }
  };

  // Вычисление полной длительности текущей фазы
  const totalWorkSec = workMinutes * 60 + workSeconds;
  const totalRestSec = restMinutes * 60 + restSeconds;
  const activePhaseTotalSec = timerMode === 'amrap' 
    ? (workMinutes * 60 + workSeconds) 
    : (currentPhase === 'work' ? (totalWorkSec || 1) : (totalRestSec || 1));

  // Управление блокировкой экрана (Wake Lock) и фоновым звуком
  useEffect(() => {
    if (isTimerRunning || prepCount !== null || isLiveWorkout) {
      try {
        silentAudio?.play().catch(() => {});
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          navigator.wakeLock.request('screen').then(lock => {
            wakeLockRef.current = lock;
          }).catch(() => {});
        }
      } catch (e) {}
    } else {
      try {
        silentAudio?.pause();
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      } catch (e) {}
    }
    return () => {
      try {
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      } catch (e) {}
    };
  }, [isTimerRunning, prepCount, isLiveWorkout]);

  // Управление таймером (Интервалы + AMRAP)
  useEffect(() => {
    if (isTimerRunning && prepCount === null) {
      intervalTimerRef.current = setInterval(() => {
        setPhaseSecondsLeft(prev => {
          // Звуковой отсчет за 3.. 2.. 1.. секунды до смены фазы
          if (prev === 4 || prev === 3 || prev === 2) {
            playCountdownBeep(880, 0.15);
          }

          if (prev <= 1) {
            // Если режим AMRAP
            if (timerMode === 'amrap') {
              playFinishVictorySound();
              setIsTimerRunning(false);
              return 0;
            }

            // Если фаза РАБОТА закончилась
            if (currentPhase === 'work') {
              if (totalRestSec > 0) {
                // Переход в фазу ОТДЫХ
                playStartRestSound();
                setCurrentPhase('rest');
                return totalRestSec;
              } else {
                // Если отдыха нет
                if (currentRound >= totalRounds) {
                  playFinishVictorySound(); // Финиш
                  setIsTimerRunning(false);
                  return 0;
                } else {
                  playStartWorkSound();
                  setCurrentRound(r => r + 1);
                  return totalWorkSec;
                }
              }
            } else {
              // Фаза ОТДЫХ закончилась -> переход к следующему раунду работы
              if (currentRound >= totalRounds) {
                playFinishVictorySound(); // Финиш всей тренировки
                setIsTimerRunning(false);
                return 0;
              } else {
                playStartWorkSound();
                setCurrentRound(r => r + 1);
                setCurrentPhase('work');
                return totalWorkSec;
              }
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalTimerRef.current);
    }
    return () => clearInterval(intervalTimerRef.current);
  }, [isTimerRunning, prepCount, currentPhase, currentRound, totalRounds, totalWorkSec, totalRestSec, timerMode]);

  // Запуск таймера с предварительным отсчетом 3-2-1
  const handleTimerStart = () => {
    getAudioCtx(); // Разблокируем AudioContext по клику пользователя

    if (phaseSecondsLeft === 0) {
      if (timerMode === 'amrap') {
        setPhaseSecondsLeft(workMinutes * 60 + workSeconds);
      } else {
        setCurrentRound(1);
        setCurrentPhase('work');
        setPhaseSecondsLeft(workMinutes * 60 + workSeconds);
      }
    }

    if (phaseSecondsLeft === activePhaseTotalSec && currentRound === 1 && currentPhase === 'work') {
      setPrepCount(3);
      playCountdownBeep(580, 0.15);

      let step = 3;
      prepTimerRef.current = setInterval(() => {
        step -= 1;
        if (step === 2) {
          setPrepCount(2);
          playCountdownBeep(580, 0.15);
        } else if (step === 1) {
          setPrepCount(1);
          playCountdownBeep(580, 0.15);
        } else if (step === 0) {
          setPrepCount(0);
          playStartWorkSound();
        } else {
          clearInterval(prepTimerRef.current);
          setPrepCount(null);
          setIsTimerRunning(true);
        }
      }, 1000);
    } else {
      setIsTimerRunning(true);
      playCountdownBeep(880, 0.1);
    }
  };

  const handleTimerPause = () => {
    clearInterval(prepTimerRef.current);
    setPrepCount(null);
    setIsTimerRunning(false);
  };

  const handleTimerReset = () => {
    clearInterval(prepTimerRef.current);
    setPrepCount(null);
    setIsTimerRunning(false);
    setCurrentRound(1);
    setCurrentPhase('work');
    setAmrapCompletedRounds(0);
    setPhaseSecondsLeft(timerMode === 'amrap' ? (workMinutes * 60 + workSeconds) : (workMinutes * 60 + workSeconds));
  };

  const handleTimerSkipPhase = () => {
    clearInterval(prepTimerRef.current);
    setPrepCount(null);

    if (timerMode === 'amrap') {
      setIsTimerRunning(false);
      setPhaseSecondsLeft(0);
      playFinishVictorySound();
      return;
    }

    if (currentPhase === 'work' && totalRestSec > 0) {
      setCurrentPhase('rest');
      setPhaseSecondsLeft(totalRestSec);
      playStartRestSound();
    } else {
      if (currentRound < totalRounds) {
        setCurrentRound(r => r + 1);
        setCurrentPhase('work');
        setPhaseSecondsLeft(totalWorkSec);
        playStartWorkSound();
      } else {
        setIsTimerRunning(false);
        setPhaseSecondsLeft(0);
        playFinishVictorySound();
      }
    }
  };

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

  // Управление стандартным таймером отдыха между сетами
  useEffect(() => {
    if (isRestTimerRunning && restSecondsLeft > 0) {
      restTimerRef.current = setInterval(() => {
        setRestSecondsLeft(prev => {
          if (prev <= 1) {
            playCountdownBeep(1200, 0.4);
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

  // Быстрое сохранение тренировки (если запущено без Live-режима)
  const handleSaveWorkout = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isLiveWorkout) {
      openFinishWorkoutModal();
      return;
    }

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

      {/* 🟢 БАННЕР ЖИВОЙ ТРЕНИРОВКИ / КНОПКА СТАРТА */}
      {isLiveWorkout ? (
        <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900/95 to-teal-950/70 border border-emerald-500/50 rounded-3xl p-3.5 shadow-2xl shadow-emerald-950/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 font-mono">
                LIVE ТРЕНИРОВКА
              </span>
            </div>
            <div className="text-base font-black font-mono text-white tracking-wider">
              {Math.floor(liveElapsedSec / 3600) > 0 ? `${String(Math.floor(liveElapsedSec / 3600)).padStart(2, '0')}:` : ''}
              {String(Math.floor((liveElapsedSec % 3600) / 60)).padStart(2, '0')}:
              {String(liveElapsedSec % 60).padStart(2, '0')}
            </div>
          </div>

          {/* 4 Живые метрики */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-slate-950/80 rounded-2xl p-2 border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 block uppercase">Калории</span>
              <span className="text-xs font-black text-amber-400 font-mono">~{liveCalories}</span>
            </div>
            <div className="bg-slate-950/80 rounded-2xl p-2 border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 block uppercase">Strain</span>
              <span className="text-xs font-black text-emerald-400 font-mono">{liveStrain}</span>
            </div>
            <div className="bg-slate-950/80 rounded-2xl p-2 border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 block uppercase">Пульс</span>
              <span className="text-xs font-black text-rose-400 font-mono">{liveBpm}</span>
            </div>
            <div className="bg-slate-950/80 rounded-2xl p-2 border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 block uppercase">Тоннаж</span>
              <span className="text-xs font-black text-indigo-300 font-mono">
                {currentTonnage >= 1000 ? `${(currentTonnage / 1000).toFixed(1)}т` : `${currentTonnage}кг`}
              </span>
            </div>
          </div>

          {/* Кнопка завершения тренировки прямо в HUD */}
          <button
            type="button"
            onClick={openFinishWorkoutModal}
            className="w-full py-2.5 min-h-[40px] rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30 transition-all"
          >
            <Check className="w-4 h-4 text-white font-bold" />
            <span>Завершить тренировку</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startLiveWorkout}
          className="w-full py-3.5 min-h-[48px] rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:opacity-95 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 cursor-pointer transition-all"
        >
          <Play className="w-4 h-4 fill-current text-slate-950" />
          <span>Начать тренировку (Пульс, Калории, Тоннаж)</span>
        </button>
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
          onClick={() => setActiveTab('timer')}
          className={`flex-1 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'timer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          ⏱️ Таймер
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

      {/* 🏆 МОДАЛЬНОЕ ОКНО ЗАВЕРШЕНИЯ ТРЕНИРОВКИ */}
      {isFinishModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-emerald-500/40 rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Итоги тренировки
                </h3>
                <span className="text-[11px] text-emerald-400 font-bold block">
                  {workoutTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFinishModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Сетка результатов */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-950/80 rounded-2xl p-2.5 border border-white/5">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Длительность</span>
                <span className="text-base font-black font-mono text-white">
                  {Math.floor(liveElapsedSec / 60)} мин {liveElapsedSec % 60}с
                </span>
              </div>
              <div className="bg-slate-950/80 rounded-2xl p-2.5 border border-white/5">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Расход калорий</span>
                <span className="text-base font-black font-mono text-amber-400">
                  ~{liveCalories} ккал
                </span>
              </div>
              <div className="bg-slate-950/80 rounded-2xl p-2.5 border border-white/5">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Whoop Strain</span>
                <span className="text-base font-black font-mono text-emerald-400">
                  {liveStrain}
                </span>
              </div>
              <div className="bg-slate-950/80 rounded-2xl p-2.5 border border-white/5">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Общий тоннаж</span>
                <span className="text-base font-black font-mono text-indigo-300">
                  {currentTonnage} кг
                </span>
              </div>
            </div>

            {/* Оценка самочувствия RPE (1..10) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400 font-bold">Нагрузка по RPE (1..10):</span>
                <span className="text-indigo-300 font-bold">{workoutRpe} из 10</span>
              </div>
              <div className="flex gap-1">
                {[5, 6, 7, 8, 9, 10].map((rpe) => (
                  <button
                    key={rpe}
                    type="button"
                    onClick={() => setWorkoutRpe(rpe)}
                    className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      workoutRpe === rpe
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {rpe}
                  </button>
                ))}
              </div>
            </div>

            {/* Заметки */}
            <input
              type="text"
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="Заметка к тренировке (по желанию)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />

            {/* Кнопки сохранения */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmFinishWorkout}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
              >
                <Check className="w-4 h-4 text-slate-950 font-bold" />
                <span>{isSaving ? 'Сохранение...' : 'Сохранить и завершить'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFinishModalOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold active:scale-98 transition-all cursor-pointer"
              >
                Продолжить тренировку
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span>
                {isSaving
                  ? 'Сохранение...'
                  : isLiveWorkout
                  ? `Завершить тренировку (${Math.floor(liveElapsedSec / 60)}м • ~${liveCalories} ккал)`
                  : `Завершить тренировку (${exercises.length} упр.)`}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* ⏱️ ВКЛАДКА 2: УНИВЕРСАЛЬНЫЙ ТАЙМЕР (Интервалы и AMRAP без прокрутки экрана) */}
      {activeTab === 'timer' && (
        <div className="space-y-2 flex flex-col">
          {/* 1. Главный режим: Интервалы vs AMRAP */}
          <div className="flex p-1 bg-slate-900/90 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => selectTimerPreset('tabata')}
              className={`flex-1 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timerMode !== 'amrap' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              ⏱️ Интервалы
            </button>
            <button
              type="button"
              onClick={() => selectTimerPreset('amrap')}
              className={`flex-1 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timerMode === 'amrap' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              🏆 AMRAP (Круги)
            </button>
          </div>

          {/* 2. Главный экран таймера (Galaxy Watch Ultra / Kinetic Style) */}
          <div className="glass-card rounded-3xl p-3.5 text-center space-y-2 border border-white/10 shrink-0 relative overflow-hidden">
            {/* Статус раунда и фазы */}
            <div className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5 px-1">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                timerMode === 'amrap'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                  : currentPhase === 'work'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
              }`}>
                {timerMode === 'amrap' ? '🏆 AMRAP' : currentPhase === 'work' ? '🔥 РАБОТА' : '😮‍💨 ОТДЫХ'}
              </span>

              <span className="font-mono font-bold text-slate-300 text-xs">
                {timerMode === 'amrap' 
                  ? `Раундов: ${amrapCompletedRounds}` 
                  : `Раунд ${currentRound} из ${totalRounds}`}
              </span>
            </div>

            {/* Круговой кольцевой индикатор и пульсирующие кинетические цифры */}
            <div className="relative flex items-center justify-center my-0.5 min-h-[148px]">
              {/* Фоновый пульсирующий ореол */}
              <div className={`absolute w-36 h-36 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
                phaseSecondsLeft <= 3 && isTimerRunning
                  ? 'bg-rose-500/40 scale-125 animate-pulse'
                  : currentPhase === 'work' && isTimerRunning
                  ? 'bg-emerald-500/25 scale-110'
                  : isTimerRunning
                  ? 'bg-cyan-500/25 scale-105'
                  : 'bg-indigo-500/10 scale-90'
              }`} />

              {/* SVG Круговое кольцо прогресса */}
              <svg className="w-40 h-40 -rotate-90 transform" viewBox="0 0 160 160">
                {/* Фоновая дорожка */}
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke="currentColor"
                  strokeWidth="7"
                  className="text-slate-800/80 fill-transparent"
                />
                {/* Активное неоновое кольцо со сглаженным убыванием */}
                <circle
                  cx="80"
                  cy="80"
                  r="68"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={427.25}
                  strokeDashoffset={427.25 - (427.25 * (activePhaseTotalSec > 0 ? (phaseSecondsLeft / activePhaseTotalSec) : 0))}
                  strokeLinecap="round"
                  className={`fill-transparent transition-all duration-500 ${
                    phaseSecondsLeft <= 3 && isTimerRunning
                      ? 'text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.9)]'
                      : currentPhase === 'work'
                      ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                      : 'text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]'
                  }`}
                />
              </svg>

              {/* Центр: Цифры с кинетической пульсацией на каждый тик */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                {prepCount !== null ? (
                  <div className="flex flex-col items-center justify-center animate-bounce">
                    <span className="text-5xl sm:text-6xl font-black font-mono text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.9)]">
                      {prepCount === 0 ? 'GO!' : prepCount}
                    </span>
                    <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest mt-0.5">
                      {prepCount === 0 ? '🔥 ПОЕХАЛИ!' : 'ПРИГОТОВЬСЯ'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <span
                      key={phaseSecondsLeft}
                      className={`text-4xl sm:text-5xl font-black font-mono tracking-tight leading-none transition-all duration-200 transform ${
                        isTimerRunning ? 'animate-timer-tick' : ''
                      } ${
                        phaseSecondsLeft <= 3 && phaseSecondsLeft > 0 && isTimerRunning
                          ? 'text-rose-400 scale-110 drop-shadow-[0_0_20px_rgba(244,63,94,0.9)]'
                          : currentPhase === 'work'
                          ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                          : 'text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]'
                      }`}
                    >
                      {Math.floor(phaseSecondsLeft / 60)}:{String(phaseSecondsLeft % 60).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                      {isTimerRunning
                        ? (timerMode === 'amrap' ? '⏱️ AMRAP' : currentPhase === 'work' ? '🔥 Работа' : '😮‍💨 Отдых')
                        : phaseSecondsLeft === 0
                        ? '🏆 Финиш!'
                        : 'Готов'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Кнопка добавления раунда в AMRAP */}
            {timerMode === 'amrap' && isTimerRunning && (
              <button
                type="button"
                onClick={() => {
                  setAmrapCompletedRounds(r => r + 1);
                  playCountdownBeep(1100, 0.15);
                  if ('vibrate' in navigator) navigator.vibrate(80);
                }}
                className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>+ 1 Завершенный раунд ({amrapCompletedRounds})</span>
              </button>
            )}

            {/* Главные кнопки управления */}
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleTimerReset}
                aria-label="Сбросить таймер"
                className="p-3 min-w-[44px] min-h-[44px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={isTimerRunning ? handleTimerPause : handleTimerStart}
                className={`flex-1 py-3 min-h-[44px] rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all shadow-lg ${
                  isTimerRunning
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 text-white shadow-indigo-500/25'
                }`}
              >
                {isTimerRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Пауза</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{phaseSecondsLeft < activePhaseTotalSec ? 'Продолжить' : 'Старт'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleTimerSkipPhase}
                aria-label="Следующая фаза / раунд"
                className="p-3 min-w-[44px] min-h-[44px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3. Увеличенные удобные барабаны настройки Samsung */}
          {!isTimerRunning && (
            <div className="glass-card rounded-2xl p-3 border border-white/5 shrink-0">
              {timerMode === 'amrap' ? (
                <div className="flex justify-center max-w-xs mx-auto">
                  <WheelColumn
                    label="Минуты AMRAP"
                    items={[5, 7, 10, 12, 15, 20, 25, 30, 40, 45, 60]}
                    value={workMinutes}
                    onChange={(val) => {
                      setWorkMinutes(val);
                      setPhaseSecondsLeft(val * 60);
                    }}
                    format={(v) => `${v} мин`}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <WheelColumn
                    label="🔥 Работа"
                    items={[10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90, 120]}
                    value={workMinutes * 60 + workSeconds}
                    onChange={(val) => {
                      setTimerMode('custom');
                      setWorkMinutes(Math.floor(val / 60));
                      setWorkSeconds(val % 60);
                      if (currentPhase === 'work') setPhaseSecondsLeft(val);
                    }}
                    format={(v) => v >= 60 ? `${Math.floor(v / 60)}м ${v % 60 ? `${v % 60}с` : ''}` : `${v}с`}
                  />

                  <WheelColumn
                    label="😮‍💨 Отдых"
                    items={[0, 5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120]}
                    value={restMinutes * 60 + restSeconds}
                    onChange={(val) => {
                      setTimerMode('custom');
                      setRestMinutes(Math.floor(val / 60));
                      setRestSeconds(val % 60);
                      if (currentPhase === 'rest') setPhaseSecondsLeft(val);
                    }}
                    format={(v) => v === 0 ? '0с' : v >= 60 ? `${Math.floor(v / 60)}м` : `${v}с`}
                  />

                  <WheelColumn
                    label="🔄 Раунды"
                    items={[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30]}
                    value={totalRounds}
                    onChange={(val) => {
                      setTimerMode('custom');
                      setTotalRounds(val);
                    }}
                    format={(v) => `${v}`}
                  />
                </div>
              )}
            </div>
          )}
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

// 🎛️ Samsung Galaxy Watch / Wear OS Style Wheel Scroll Column (Увеличенные стрелочки и удобный тап)
function WheelColumn({ label, items, value, onChange, format = (v) => v }) {
  const containerRef = useRef(null);
  const itemHeight = 38;
  const currentIdx = items.indexOf(value);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    const boundedIndex = Math.max(0, Math.min(items.length - 1, index));
    if (items[boundedIndex] !== undefined && items[boundedIndex] !== value) {
      onChange(items[boundedIndex]);
    }
  };

  const scrollToIndex = (idx) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: idx * itemHeight, behavior: 'smooth' });
    }
  };

  const stepUp = (e) => {
    e.stopPropagation();
    if (currentIdx > 0) {
      const nextVal = items[currentIdx - 1];
      onChange(nextVal);
      scrollToIndex(currentIdx - 1);
    }
  };

  const stepDown = (e) => {
    e.stopPropagation();
    if (currentIdx < items.length - 1) {
      const nextVal = items[currentIdx + 1];
      onChange(nextVal);
      scrollToIndex(currentIdx + 1);
    }
  };

  useEffect(() => {
    if (containerRef.current && currentIdx >= 0) {
      containerRef.current.scrollTop = currentIdx * itemHeight;
    }
  }, [value, currentIdx]);

  return (
    <div className="flex-1 flex flex-col items-center select-none overflow-hidden">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1 truncate w-full text-center">
        {label}
      </span>

      {/* Увеличенная верхняя кнопка-стрелка */}
      <button
        type="button"
        onClick={stepUp}
        aria-label="Увеличить"
        className="w-full py-1.5 min-h-[30px] rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-indigo-600/30 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-all border border-white/5 shadow-sm"
      >
        <ChevronUp className="w-5 h-5 text-indigo-300" />
      </button>

      <div className="relative w-full h-[114px] overflow-hidden my-1">
        {/* Центральная линза выбора (Samsung Watch Highlight) */}
        <div className="absolute inset-x-0.5 top-[38px] h-[38px] rounded-xl bg-indigo-500/25 border border-indigo-500/50 pointer-events-none shadow-sm shadow-indigo-500/20" />

        {/* Верхний и нижний градиентный фейдинг */}
        <div className="absolute inset-x-0 top-0 h-[38px] bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-[38px] bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-10" />

        {/* Прокручиваемый список значений */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar pt-[38px] pb-[38px]"
        >
          {items.map((item, idx) => {
            const isSelected = item === value;
            return (
              <div
                key={item}
                onClick={() => {
                  onChange(item);
                  scrollToIndex(idx);
                }}
                className={`h-[38px] snap-center flex items-center justify-center font-mono cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'text-base font-black text-white scale-110'
                    : 'text-xs text-slate-500 font-semibold opacity-35 hover:opacity-70'
                }`}
              >
                {format(item)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Увеличенная нижняя кнопка-стрелка */}
      <button
        type="button"
        onClick={stepDown}
        aria-label="Уменьшить"
        className="w-full py-1.5 min-h-[30px] rounded-xl bg-slate-900/90 hover:bg-slate-800 active:bg-indigo-600/30 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-all border border-white/5 shadow-sm"
      >
        <ChevronDown className="w-5 h-5 text-indigo-300" />
      </button>
    </div>
  );
}
