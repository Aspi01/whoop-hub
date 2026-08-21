import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Check, Plus, Trash2, ChevronDown, ChevronUp, RotateCcw, X, Bookmark, Volume2, VolumeX } from 'lucide-react';
import { api } from '../services/api.js';

// ==========================================
// 🔊 SINGLETON WEB AUDIO ENGINE
// ==========================================
let globalAudioCtx = null;
export const soundEnabledRef = { current: true };

const getAudioContext = () => {
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

const playBeep = (freq = 880, duration = 0.08, volume = 0.08, soundEnabled = null) => {
  const isEnabled = soundEnabled !== null ? soundEnabled : soundEnabledRef.current;
  if (!isEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
    if ('vibrate' in navigator) navigator.vibrate(50);
  } catch (e) {}
};

const playGong = (soundEnabled = null) => {
  const isEnabled = soundEnabled !== null ? soundEnabled : soundEnabledRef.current;
  if (!isEnabled) return;
  try {
    playBeep(660, 0.14, 0.10, isEnabled);
    setTimeout(() => playBeep(990, 0.20, 0.08, isEnabled), 70);
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

export default function WorkoutLogger({ whoopData, workoutsData, progressionData, onRefresh, onOpenSettings }) {
  const [activeTrainTab, setActiveTrainTab] = useState('strength'); // 'strength' | 'timer' | 'templates' | 'history'
  const isWhoopConnected = Boolean(whoopData?.isConnected && whoopData?.current && whoopData.current.is_synced === 1);

  // ==========================================
  // 🏋️ ACTIVE WORKOUT SESSION STATE
  // ==========================================
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
  const [workoutType, setWorkoutType] = useState('strength');
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

  // Rest Timer during Workout
  const [restSecLeft, setRestSecLeft] = useState(0);
  const [isRestRunning, setIsRestRunning] = useState(false);
  const restDeadlineRef = useRef(null);
  const lastRestBeepSecRef = useRef(-1);

  // ==========================================
  // ⏱️ UNIFIED TIMER ENGINE STATE
  // ==========================================
  const [timerMode, setTimerMode] = useState('emom'); // 'stopwatch' | 'emom' | 'interval'
  const [setupWorkSec, setSetupWorkSec] = useState(60);
  const [setupRestSec, setSetupRestSec] = useState(10);
  const [setupRounds, setSetupRounds] = useState(10);
  const [setupPrepSec, setSetupPrepSec] = useState(3);

  // Fullscreen Timer Runner
  const [isFsTimerOpen, setIsFsTimerOpen] = useState(false);
  const [fsPhase, setFsPhase] = useState('prep'); // 'prep' | 'work' | 'rest' | 'finished'
  const [fsRound, setFsRound] = useState(1);
  const [fsRoundsTotal, setFsRoundsTotal] = useState(10);
  const [fsRemainingSec, setFsRemainingSec] = useState(3);
  const [fsIsPaused, setFsIsPaused] = useState(false);
  const [fsSoundOn, setFsSoundOn] = useState(true);
  const [fsClockAnimate, setFsClockAnimate] = useState(false);

  // Authoritative Timestamp-Based Timer Engine Ref
  const fsTimerEngineRef = useRef({
    mode: 'emom',
    workSec: 60,
    restSec: 10,
    rounds: 10,
    prepSec: 3,
    sessionStartMs: null,
    accumulatedPausedMs: 0,
    pauseStartMs: null,
    isPaused: false,
    manualOffsetMs: 0,
    manualRestDeadlineMs: null,
    manualRestNextRound: 1,
    emittedPhaseEvents: new Set(),
    emittedCountdownEvents: new Set(),
    lastMinuteBeepSec: -1
  });

  // Workouts and templates
  const workouts = workoutsData?.workouts || [];
  const [templateList, setTemplateList] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateType, setNewTemplateType] = useState('Силовая');
  const [newTemplateExercises, setNewTemplateExercises] = useState([]);
  const [templateExInput, setTemplateExInput] = useState('');

  const loadTemplates = async () => {
    try {
      setIsLoadingTemplates(true);
      const res = await api.getWorkoutTemplates();
      if (res?.templates && Array.isArray(res.templates)) {
        setTemplateList(res.templates);
      }
    } catch (e) {
      console.warn('Failed to load templates:', e);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSaveNewTemplate = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newTemplateTitle.trim()) return;

    try {
      const exercisesToSave = newTemplateExercises.length > 0
        ? newTemplateExercises
        : (templateExInput.trim() ? [templateExInput.trim()] : ['Жим штанги лёжа', 'Приседания со штангой']);

      const res = await api.createWorkoutTemplate({
        title: newTemplateTitle.trim(),
        type: newTemplateType,
        exercises: exercisesToSave
      });

      if (res?.templates && Array.isArray(res.templates)) {
        setTemplateList(res.templates);
      } else {
        await loadTemplates();
      }

      setNewTemplateTitle('');
      setNewTemplateExercises([]);
      setTemplateExInput('');
      setIsCreateTemplateModalOpen(false);
    } catch (err) {
      alert('Ошибка создания шаблона: ' + err.message);
    }
  };

  const handleDeleteTemplate = async (templateId, e) => {
    e?.stopPropagation?.();
    if (!templateId) return;
    try {
      await api.deleteWorkoutTemplate(templateId);
      setTemplateList(prev => prev.filter(t => t.id !== templateId));
    } catch (err) {
      alert('Ошибка удаления шаблона: ' + err.message);
    }
  };

  const normalizeTemplate = (raw) => {
    if (!raw) return null;
    let exercises = [];
    if (Array.isArray(raw.exercises)) {
      exercises = raw.exercises;
    } else if (typeof raw.exercises_json === 'string') {
      try { exercises = JSON.parse(raw.exercises_json); } catch (e) {}
    }
    return {
      id: raw.id,
      title: raw.title || raw.name || 'Шаблон тренировки',
      type: raw.type || 'Силовая',
      exercises: Array.isArray(exercises) ? exercises : []
    };
  };

  const handleApplyTemplate = (rawTpl) => {
    if (isWorkoutActive) {
      if (!confirm('Активная тренировка уже идёт. Заменить её этим шаблоном?')) {
        return;
      }
    }
    const tpl = normalizeTemplate(rawTpl);
    if (!tpl || !Array.isArray(tpl.exercises) || tpl.exercises.length === 0) {
      alert('В этом шаблоне пока нет упражнений. Отредактируйте шаблон или создайте новый.');
      return;
    }

    const converted = tpl.exercises.map(item => {
      const name = typeof item === 'string' ? item : item.name;
      const existingSets = Array.isArray(item?.sets) && item.sets.length > 0 ? item.sets : [
        { weight: 60, reps: 10, done: false },
        { weight: 60, reps: 10, done: false },
        { weight: 60, reps: 10, done: false }
      ];
      return {
        name,
        sets: existingSets
      };
    });

    setExercises(converted);
    setWorkoutTitle(tpl.title || 'Силовая тренировка');
    setWorkoutType(tpl.type || 'Силовая');
    setIsWorkoutActive(true);
    setWorkoutStartTime(Date.now());
    setActiveTrainTab('strength');
  };

  // ==========================================
  // 🔄 PERSISTENCE & TIMER INTERVALS
  // ==========================================
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

  // Workout Session Duration Tick
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

  // Rest Timer Tick in Workout (Authoritative Deadline-Based)
  useEffect(() => {
    let interval = null;
    if (isRestRunning && restDeadlineRef.current) {
      const updateRest = () => {
        const left = Math.max(0, Math.ceil((restDeadlineRef.current - Date.now()) / 1000));
        setRestSecLeft(left);
        if (left <= 0) {
          playBeep(1100, 0.35, 0.12, true);
          setIsRestRunning(false);
          restDeadlineRef.current = null;
          lastRestBeepSecRef.current = -1;
        } else if ((left === 3 || left === 2 || left === 1) && lastRestBeepSecRef.current !== left) {
          lastRestBeepSecRef.current = left;
          playBeep(880, 0.12, 0.08, true);
        }
      };
      updateRest();
      interval = setInterval(updateRest, 250);
    }
    return () => clearInterval(interval);
  }, [isRestRunning]);

  // ==========================================
  // ⏱️ UNIFIED TIMESTAMP TIMER ENGINE
  // ==========================================
  const getTimerEngineSnapshot = (engine, now = Date.now(), isVisibilityWakeup = false) => {
    const currentNow = engine.isPaused ? (engine.pauseStartMs || now) : now;

    // Check manual rest first (STOPWATCH manual rest or INTERVALS Break)
    if (engine.manualRestDeadlineMs) {
      if (currentNow < engine.manualRestDeadlineMs) {
        const remainingMs = engine.manualRestDeadlineMs - currentNow;
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

        const phaseKey = `manual_rest:${engine.manualRestNextRound}`;
        if (!engine.emittedPhaseEvents.has(phaseKey)) {
          engine.emittedPhaseEvents.add(phaseKey);
          if (!isVisibilityWakeup) playBeep(520, 0.14, 0.08);
        }

        return { phase: 'rest', round: engine.manualRestNextRound, remainingSec, roundsTotal: engine.rounds };
      } else {
        // Manual rest finished -> advance to manualRestNextRound work
        const nextRound = engine.manualRestNextRound;
        engine.manualRestDeadlineMs = null;
        if (engine.mode !== 'stopwatch') {
          const prepDurationMs = engine.prepSec * 1000;
          const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
          const targetElapsedMs = prepDurationMs + (nextRound - 1) * cycleDurationMs;
          engine.manualOffsetMs = (currentNow - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
        }
      }
    }

    const prepDurationMs = engine.prepSec * 1000;
    const effectiveSessionElapsedMs = (currentNow - engine.sessionStartMs) - engine.accumulatedPausedMs - engine.manualOffsetMs;

    // 1. PREP Phase
    if (engine.prepSec > 0 && effectiveSessionElapsedMs < prepDurationMs) {
      const remainingPrepMs = prepDurationMs - effectiveSessionElapsedMs;
      const remainingSec = Math.max(0, Math.ceil(remainingPrepMs / 1000));

      if (isVisibilityWakeup) {
        for (let s = 3; s > remainingSec; s--) {
          engine.emittedCountdownEvents.add(`prep:${s}`);
        }
      } else if (remainingSec <= 3 && remainingSec > 0) {
        const eventKey = `prep:${remainingSec}`;
        if (!engine.emittedCountdownEvents.has(eventKey)) {
          engine.emittedCountdownEvents.add(eventKey);
          playBeep(520 + (3 - remainingSec) * 80, 0.07, 0.06);
        }
      }

      return { phase: 'prep', round: 1, remainingSec, roundsTotal: engine.mode === 'stopwatch' ? 1 : engine.rounds };
    }

    // 2. WORK / REST / FINISHED
    const effectiveWorkoutElapsedMs = effectiveSessionElapsedMs - prepDurationMs;

    if (engine.mode === 'stopwatch') {
      const elapsedSec = Math.max(0, Math.floor(effectiveWorkoutElapsedMs / 1000));
      const phaseKey = 'stopwatch:work';
      if (!engine.emittedPhaseEvents.has(phaseKey)) {
        engine.emittedPhaseEvents.add(phaseKey);
        if (!isVisibilityWakeup) playGong();
      }
      if (elapsedSec > 0 && elapsedSec % 60 === 0 && engine.lastMinuteBeepSec !== elapsedSec) {
        engine.lastMinuteBeepSec = elapsedSec;
        if (!isVisibilityWakeup) playBeep(720, 0.08, 0.05);
      }
      return { phase: 'work', round: 1, remainingSec: elapsedSec, roundsTotal: 1 };
    }

    // Countdown modes (EMOM & INTERVALS)
    const workDurationMs = engine.workSec * 1000;
    const restDurationMs = (engine.mode === 'emom' ? 0 : engine.restSec) * 1000;
    const cycleDurationMs = workDurationMs + restDurationMs;
    const totalWorkoutDurationMs = engine.rounds * cycleDurationMs;

    if (effectiveWorkoutElapsedMs >= totalWorkoutDurationMs) {
      const phaseKey = 'complete';
      if (!engine.emittedPhaseEvents.has(phaseKey)) {
        engine.emittedPhaseEvents.add(phaseKey);
        if (!isVisibilityWakeup) playGong();
      }
      return { phase: 'finished', round: engine.rounds, remainingSec: 0, roundsTotal: engine.rounds };
    }

    const roundIndex = Math.floor(effectiveWorkoutElapsedMs / cycleDurationMs);
    const currentRound = Math.min(roundIndex + 1, engine.rounds);
    const elapsedInCycleMs = effectiveWorkoutElapsedMs % cycleDurationMs;

    if (elapsedInCycleMs < workDurationMs) {
      const remainingInWorkMs = workDurationMs - elapsedInCycleMs;
      const remainingSec = Math.max(0, Math.ceil(remainingInWorkMs / 1000));

      const phaseKey = `work:${currentRound}`;
      if (!engine.emittedPhaseEvents.has(phaseKey)) {
        engine.emittedPhaseEvents.add(phaseKey);
        if (!isVisibilityWakeup) playGong();
      }

      if (isVisibilityWakeup) {
        for (let s = 3; s > remainingSec; s--) {
          engine.emittedCountdownEvents.add(`work:${currentRound}:${s}`);
        }
      } else if (remainingSec <= 3 && remainingSec > 0) {
        const cdKey = `work:${currentRound}:${remainingSec}`;
        if (!engine.emittedCountdownEvents.has(cdKey)) {
          engine.emittedCountdownEvents.add(cdKey);
          playBeep(760 + (3 - remainingSec) * 120, 0.07, 0.07);
        }
      }

      return { phase: 'work', round: currentRound, remainingSec, roundsTotal: engine.rounds };
    } else {
      const elapsedInRestMs = elapsedInCycleMs - workDurationMs;
      const remainingInRestMs = restDurationMs - elapsedInRestMs;
      const remainingSec = Math.max(0, Math.ceil(remainingInRestMs / 1000));

      const phaseKey = `rest:${currentRound}`;
      if (!engine.emittedPhaseEvents.has(phaseKey)) {
        engine.emittedPhaseEvents.add(phaseKey);
        if (!isVisibilityWakeup) playBeep(520, 0.14, 0.08);
      }

      if (isVisibilityWakeup) {
        for (let s = 3; s > remainingSec; s--) {
          engine.emittedCountdownEvents.add(`rest:${currentRound}:${s}`);
        }
      } else if (remainingSec <= 3 && remainingSec > 0) {
        const cdKey = `rest:${currentRound}:${remainingSec}`;
        if (!engine.emittedCountdownEvents.has(cdKey)) {
          engine.emittedCountdownEvents.add(cdKey);
          playBeep(760 + (3 - remainingSec) * 120, 0.07, 0.07);
        }
      }

      return { phase: 'rest', round: currentRound, remainingSec, roundsTotal: engine.rounds };
    }
  };

  const reconcileFsTimer = (isVisibilityWakeup = false) => {
    const engine = fsTimerEngineRef.current;
    if (!engine || !isFsTimerOpen) return;

    const now = Date.now();
    const snap = getTimerEngineSnapshot(engine, now, isVisibilityWakeup);

    setFsPhase(snap.phase);
    setFsRound(snap.round);
    setFsRemainingSec(snap.remainingSec);
    setFsRoundsTotal(snap.roundsTotal);
  };

  // Main UI render tick
  useEffect(() => {
    let timerInterval = null;
    if (isFsTimerOpen && !fsIsPaused && fsPhase !== 'finished') {
      reconcileFsTimer(false);
      timerInterval = setInterval(() => {
        reconcileFsTimer(false);
      }, 250);
    }
    return () => clearInterval(timerInterval);
  }, [isFsTimerOpen, fsIsPaused, fsPhase]);

  // Screen Wake Lock & Background / Foreground Reconciliation (Zero Assumption on Background JS)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isFsTimerOpen) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) {}
    };
    if (isFsTimerOpen) requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isFsTimerOpen) {
          reconcileFsTimer(true);
        }
        if (isRestRunning && restDeadlineRef.current) {
          const left = Math.max(0, Math.ceil((restDeadlineRef.current - Date.now()) / 1000));
          setRestSecLeft(left);
          if (left <= 0) {
            setIsRestRunning(false);
            restDeadlineRef.current = null;
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isFsTimerOpen, isRestRunning]);

  // ==========================================
  // ⏱️ FULLSCREEN TIMER CONTROLS
  // ==========================================
  const handleStartFullscreenTimer = () => {
    getAudioContext();
    const pSec = Math.min(10, Math.max(0, setupPrepSec || 3));
    const wSec = setupWorkSec || 60;
    const rSec = setupRestSec || 10;
    const rCount = timerMode === 'stopwatch' ? 1 : (setupRounds || 10);

    const now = Date.now();
    fsTimerEngineRef.current = {
      mode: timerMode,
      workSec: wSec,
      restSec: rSec,
      rounds: rCount,
      prepSec: pSec,
      sessionStartMs: now,
      accumulatedPausedMs: 0,
      pauseStartMs: null,
      isPaused: false,
      manualOffsetMs: 0,
      manualRestDeadlineMs: null,
      manualRestNextRound: 1,
      emittedPhaseEvents: new Set(),
      emittedCountdownEvents: new Set(),
      lastMinuteBeepSec: -1
    };

    setFsRoundsTotal(rCount);
    setFsRound(1);
    setFsIsPaused(false);
    setFsPhase(pSec > 0 ? 'prep' : 'work');
    setFsRemainingSec(pSec > 0 ? pSec : (timerMode === 'stopwatch' ? 0 : wSec));
    setIsFsTimerOpen(true);
  };

  const handleToggleTimerPause = () => {
    const engine = fsTimerEngineRef.current;
    if (!engine) return;

    const now = Date.now();
    if (fsIsPaused) {
      // Resume
      if (engine.pauseStartMs) {
        const pausedDuration = now - engine.pauseStartMs;
        engine.accumulatedPausedMs += pausedDuration;
        if (engine.manualRestDeadlineMs) {
          engine.manualRestDeadlineMs += pausedDuration;
        }
        engine.pauseStartMs = null;
      }
      engine.isPaused = false;
      setFsIsPaused(false);
      playBeep(760, 0.06, 0.05);
      reconcileFsTimer(false);
    } else {
      // Pause
      engine.isPaused = true;
      engine.pauseStartMs = now;
      setFsIsPaused(true);
      playBeep(420, 0.06, 0.05);
    }
  };

  const handleAdjustTimer = (diffSec) => {
    const engine = fsTimerEngineRef.current;
    if (!engine) return;

    if (engine.mode === 'stopwatch') {
      engine.manualOffsetMs += diffSec * 1000;
    } else {
      // In countdown modes, +10s means +10s remaining (shift elapsed by -10s)
      engine.manualOffsetMs -= diffSec * 1000;
    }
    reconcileFsTimer(false);
    playBeep(diffSec > 0 ? 880 : 440, 0.05, 0.04);
  };

  const advanceFsTimerPhase = () => {
    const engine = fsTimerEngineRef.current;
    if (!engine) return;

    const now = Date.now();
    const snap = getTimerEngineSnapshot(engine, now, false);

    if (engine.mode === 'stopwatch') {
      if (snap.phase === 'work') {
        handleForceRest();
      } else {
        engine.manualRestDeadlineMs = null;
      }
      reconcileFsTimer(false);
      return;
    }

    if (snap.phase === 'prep') {
      // Authoritative direct jump to Round 1 WORK with full work duration
      const prepDurationMs = engine.prepSec * 1000;
      engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - prepDurationMs;
      reconcileFsTimer(false);
      return;
    }

    if (engine.manualRestDeadlineMs) {
      // Authoritative advance from manual rest -> immediately start target round WORK
      const targetRound = engine.manualRestNextRound;
      engine.manualRestDeadlineMs = null;
      if (targetRound > engine.rounds) {
        const prepDurationMs = engine.prepSec * 1000;
        const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
        const targetElapsedMs = prepDurationMs + engine.rounds * cycleDurationMs;
        engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
      } else {
        const prepDurationMs = engine.prepSec * 1000;
        const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
        const targetElapsedMs = prepDurationMs + (targetRound - 1) * cycleDurationMs;
        engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
      }
      reconcileFsTimer(false);
      return;
    }

    if (snap.phase === 'work') {
      if (engine.mode === 'interval' && engine.restSec > 0) {
        handleForceRest();
      } else {
        if (snap.round >= engine.rounds) {
          const prepDurationMs = engine.prepSec * 1000;
          const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
          const targetElapsedMs = prepDurationMs + engine.rounds * cycleDurationMs;
          engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
        } else {
          const prepDurationMs = engine.prepSec * 1000;
          const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
          const targetElapsedMs = prepDurationMs + snap.round * cycleDurationMs;
          engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
        }
      }
    } else if (snap.phase === 'rest') {
      if (snap.round >= engine.rounds) {
        const prepDurationMs = engine.prepSec * 1000;
        const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
        const targetElapsedMs = prepDurationMs + engine.rounds * cycleDurationMs;
        engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
      } else {
        const prepDurationMs = engine.prepSec * 1000;
        const cycleDurationMs = (engine.workSec + engine.restSec) * 1000;
        const targetElapsedMs = prepDurationMs + snap.round * cycleDurationMs;
        engine.manualOffsetMs = (now - engine.sessionStartMs - engine.accumulatedPausedMs) - targetElapsedMs;
      }
    }

    reconcileFsTimer(false);
  };

  const handleForceRest = () => {
    const engine = fsTimerEngineRef.current;
    if (!engine || engine.mode === 'emom') return;

    const now = Date.now();
    const snap = getTimerEngineSnapshot(engine, now, false);
    const restDuration = (engine.restSec || (engine.mode === 'stopwatch' ? 60 : 10)) * 1000;
    engine.manualRestDeadlineMs = now + restDuration;
    engine.manualRestNextRound = snap.phase === 'prep' ? 1 : Math.min(snap.round + 1, engine.rounds);
    reconcileFsTimer(false);
  };

  const handleCloseFullscreenTimer = () => {
    setIsFsTimerOpen(false);
    setFsIsPaused(false);
    if (fsTimerEngineRef.current) {
      fsTimerEngineRef.current.sessionStartMs = null;
      fsTimerEngineRef.current.isPaused = false;
    }
  };

  const handleToggleSound = () => {
    const next = !fsSoundOn;
    setFsSoundOn(next);
    soundEnabledRef.current = next;
  };

  const applyTimerPreset = (preset) => {
    if (preset === '30') { setSetupWorkSec(30); setTimerMode('interval'); }
    else if (preset === '60') { setSetupWorkSec(60); setTimerMode('interval'); }
    else if (preset === '90') { setSetupWorkSec(90); setTimerMode('interval'); }
    else if (preset === 'tabata') {
      setTimerMode('interval');
      setSetupWorkSec(20);
      setSetupRestSec(10);
      setSetupRounds(8);
      setSetupPrepSec(3);
    } else if (preset === 'emom10') {
      setTimerMode('emom');
      setSetupWorkSec(60);
      setSetupRounds(10);
      setSetupPrepSec(3);
    }
  };

  // ==========================================
  // 🏋️ WORKOUT METRICS & SETS
  // ==========================================
  const totalTonnage = exercises.reduce((sum, ex) => {
    return sum + (ex.sets || []).reduce((sSum, s) => s.done ? sSum + (Number(s.weight) || 0) * (Number(s.reps) || 0) : sSum, 0);
  }, 0);

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
    playBeep(880, 0.25, 0.10, true);
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
      restDeadlineRef.current = Date.now() + 90 * 1000;
      setRestSecLeft(90);
      setIsRestRunning(true);
      playBeep(900, 0.15, 0.08, true);
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

  const handleCompleteExerciseAndNext = () => {
    if (currentExIndex < exercises.length - 1) {
      setCurrentExIndex(prev => prev + 1);
      playBeep(920, 0.15, 0.08, true);
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
        strain: isWhoopConnected ? (liveStrain || null) : null,
        avg_hr: null,
        max_hr: null,
        notes: `Время: ${formatTimer(workoutElapsedSec)}${totalTonnage > 0 ? ' | Тоннаж: ' + totalTonnage.toLocaleString() + ' кг' : ''}`,
        exercises: validExercises
      });

      alert(`✅ Тренировка «${cleanTitle}» успешно завершена и сохранена!`);

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

      {/* ==========================================
          1. ВКЛАДКА СИЛОВАЯ ТРЕНИРОВКА
         ========================================== */}
      {activeTrainTab === 'strength' && (
        <div className="trainView">
          {!isWorkoutActive ? (
            <div className="space-y-4">
              <div className="trainStart">
                <div className="trainStartTop">
                  <div>
                    <div className="trainStartTitle">
                      Локальная тренировка
                    </div>
                    <div className="trainStartCopy">
                      Запись подходов, повторений, рабочего веса и времени отдыха.
                    </div>
                  </div>
                  <div className="deviceLine text-slate-400">
                    <i className="deviceDot" style={{ background: '#60707b', boxShadow: 'none' }} />
                    Данные браслета недоступны
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

              {templateList && templateList.length > 0 && (
                <>
                  <div className="sectionHead compact">
                    <div className="sectionLabel">Или начни по шаблону</div>
                  </div>
                  <div className="reasonList">
                    {templateList.slice(0, 3).map(tpl => {
                      const count = Array.isArray(tpl.exercises) ? tpl.exercises.length : 0;
                      const letter = (tpl.title || 'Т')[0].toUpperCase();
                      return (
                        <div
                          key={tpl.id || tpl.title}
                          className="reason"
                        >
                          <div className="miniGlyph accent">{letter}</div>
                          <div className="min-w-0 pr-2">
                            <div className="reasonName">{tpl.title}</div>
                            <div className="reasonMeta">{count} {count === 1 ? 'упражнение' : count < 5 ? 'упражнения' : 'упражнений'}</div>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-xl bg-[#173926] text-[#7cf0a5] border border-[#24523a] text-xs font-bold shrink-0 hover:bg-[#1f4a32] active:scale-95 cursor-pointer ml-auto"
                            onClick={() => handleApplyTemplate(tpl)}
                          >
                            Применить
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
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
                  <span>● локально</span>
                </div>
              </div>

              {/* Inline Facts */}
              <div className="inlineFacts mono">
                <div className="inlineFact">
                  <span>Упражнения</span>
                  <b>{exercises.length}</b>
                </div>
                <div className="inlineFact">
                  <span>Подходы</span>
                  <b>{exercises.reduce((acc, ex) => acc + (ex.sets || []).filter(s => s.done).length, 0)}</b>
                </div>
                <div className="inlineFact">
                  <span>Объём</span>
                  <b>{totalTonnage > 0 ? `${totalTonnage.toLocaleString()} кг` : '0 кг'}</b>
                </div>
              </div>

              {/* Exercises Queue & Current Set */}
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

                  {/* Next exercise prompt */}
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

                  {/* Queue of exercises */}
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

              {/* Floating Rest Bar */}
              {restSecLeft > 0 && (
                <div className="restBar mono">
                  <div>
                    <span>Отдых</span>
                    <b>{formatTimer(restSecLeft)}</b>
                  </div>
                  <button
                    type="button"
                    className="restAction"
                    onClick={() => {
                      const current = isRestRunning && restDeadlineRef.current ? Math.max(0, restDeadlineRef.current - Date.now()) : 0;
                      restDeadlineRef.current = Date.now() + current + 30 * 1000;
                      setRestSecLeft(Math.ceil((restDeadlineRef.current - Date.now()) / 1000));
                      setIsRestRunning(true);
                    }}
                  >
                    +30с
                  </button>
                  <button
                    type="button"
                    className="restAction"
                    onClick={() => {
                      restDeadlineRef.current = null;
                      setRestSecLeft(0);
                      setIsRestRunning(false);
                    }}
                  >
                    Пропустить
                  </button>
                </div>
              )}

              {/* Finish Workout CTA */}
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

      {/* ==========================================
          2. ВКЛАДКА ТАЙМЕР (ЕДИНЫЙ РАЗДЕЛ)
         ========================================== */}
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
              onClick={() => setTimerMode('stopwatch')}
            >
              Секундомер<span>с опциональным отдыхом</span>
            </button>
            <button
              type="button"
              className={`timerMode ${timerMode === 'emom' ? 'active' : ''}`}
              onClick={() => setTimerMode('emom')}
            >
              EMOM<span>старт каждую минуту</span>
            </button>
            <button
              type="button"
              className={`timerMode ${timerMode === 'interval' ? 'active' : ''}`}
              onClick={() => setTimerMode('interval')}
            >
              Интервалы<span>работа / отдых</span>
            </button>
          </div>

          <div id="timerSetup">
            <div className="timerDisplay">
              <div className="timerClock mono">
                {timerMode === 'stopwatch' ? '00:00' : formatTimer(setupWorkSec)}
              </div>
              <div className="timerInfo">
                <b>
                  {timerMode === 'stopwatch' ? 'Секундомер' : timerMode === 'emom' ? 'EMOM' : 'Интервалы'}
                </b>
                <span>
                  {timerMode === 'stopwatch'
                    ? 'Считай подход или упражнение'
                    : timerMode === 'emom'
                    ? `${setupRounds} раундов по 1 минуте`
                    : 'Подходит и для Tabata'}
                </span>
              </div>
            </div>

            <div className="timerFields">
              {timerMode !== 'stopwatch' && (
                <div className="timerField">
                  <label>Работа</label>
                  <input
                    value={`${setupWorkSec} сек`}
                    onChange={(e) => setSetupWorkSec(parseInt(e.target.value.replace(/\D/g, '')) || 60)}
                    inputMode="numeric"
                  />
                </div>
              )}
              {timerMode === 'interval' && (
                <div className="timerField">
                  <label>Перерыв</label>
                  <input
                    value={`${setupRestSec} сек`}
                    onChange={(e) => setSetupRestSec(parseInt(e.target.value.replace(/\D/g, '')) || 10)}
                    inputMode="numeric"
                  />
                </div>
              )}
              {timerMode !== 'stopwatch' && (
                <div className="timerField">
                  <label>Раунды</label>
                  <input
                    value={setupRounds}
                    onChange={(e) => setSetupRounds(parseInt(e.target.value.replace(/\D/g, '')) || 10)}
                    inputMode="numeric"
                  />
                </div>
              )}
              <div className="timerField">
                <label>Подготовка</label>
                <input
                  value={`${setupPrepSec} сек`}
                  onChange={(e) => setSetupPrepSec(parseInt(e.target.value.replace(/\D/g, '')) || 3)}
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
              onClick={handleStartFullscreenTimer}
            >
              СТАРТ
            </button>
          </div>
        </div>
      )}

      {/* ==========================================
          3. ВКЛАДКА ШАБЛОНЫ
         ========================================== */}
      {activeTrainTab === 'templates' && (
        <div className="trainView">
          <div className="sectionHead" style={{ marginBottom: '10px' }}>
            <div className="sectionLabel">Мои шаблоны</div>
            <span className="contextPill">{templateList.length} шаблонов</span>
          </div>

          {/* Prominent Action Button: + Новая тренировка (min-height 44px, green accent) */}
          <button
            type="button"
            className="w-full min-h-[46px] py-3 px-4 mb-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all bg-[#173926] text-[#7cf0a5] border border-[#24523a] hover:bg-[#1f4a32] active:scale-[0.98] shadow-sm"
            onClick={() => setIsCreateTemplateModalOpen(true)}
          >
            <span className="text-base font-extrabold leading-none">+</span>
            <span>Новый шаблон</span>
          </button>

          {templateList.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#09131a] border border-[#233139] text-center my-4">
              <div className="text-sm font-bold text-white mb-1">Нет сохранённых шаблонов</div>
              <div className="text-xs text-slate-400 mb-4">Создайте свой первый тренировочный сплит или программу.</div>
              <button
                type="button"
                onClick={() => setIsCreateTemplateModalOpen(true)}
                className="px-4 py-2 bg-[#7cf0a5] hover:bg-[#68dd92] text-[#06120b] font-bold text-xs rounded-xl cursor-pointer"
              >
                + Создать шаблон
              </button>
            </div>
          ) : (
            <div className="reasonList">
              {templateList.map(tpl => {
                const count = Array.isArray(tpl.exercises) ? tpl.exercises.length : 0;
                const letter = (tpl.title || 'Т')[0].toUpperCase();
                return (
                  <div
                    key={tpl.id || tpl.title}
                    className="reason"
                  >
                    <div className="miniGlyph accent">{letter}</div>
                    <div className="min-w-0 pr-2">
                      <div className="reasonName">{tpl.title}</div>
                      <div className="reasonMeta">
                        {count} {count === 1 ? 'упражнение' : count < 5 ? 'упражнения' : 'упражнений'} · {tpl.type || 'Силовая'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto shrink-0">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-xl bg-[#173926] text-[#7cf0a5] border border-[#24523a] text-xs font-bold hover:bg-[#1f4a32] active:scale-95 cursor-pointer"
                        onClick={() => handleApplyTemplate(tpl)}
                      >
                        Применить
                      </button>
                      <button
                        type="button"
                        className="text-rose-400/60 hover:text-rose-400 p-2"
                        onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                        aria-label="Удалить шаблон"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          4. ВКЛАДКА ИСТОРИЯ
         ========================================== */}
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

      {/* ==========================================
          📱 V11 FULLSCREEN MOBILE TIMER OVERLAY
         ========================================== */}
      {isFsTimerOpen && (
        <div className={`timerOverlay open ${fsPhase === 'rest' ? 'rest' : fsPhase === 'prep' ? 'prep' : ''}`}>
          <div className="timerBackdrop" />
          <div className="timerBreath" />
          
          <div className="timerFull">
            {/* Header */}
            <div className="timerTop">
              <div>
                <div className="timerTopMeta">
                  {timerMode === 'stopwatch' ? 'СЕКУНДОМЕР' : timerMode === 'emom' ? 'EMOM' : 'ИНТЕРВАЛЫ'}
                </div>
                <div className="small text-slate-400">
                  {timerMode === 'stopwatch'
                    ? `перерыв ${setupRestSec} сек`
                    : `${fsRoundsTotal} раундов · ${setupWorkSec} сек${timerMode === 'interval' ? ' / отдых ' + setupRestSec + ' сек' : ''}`}
                </div>
              </div>
              <button
                type="button"
                className="timerClose"
                onClick={handleCloseFullscreenTimer}
                aria-label="Закрыть таймер"
              >
                ✕
              </button>
            </div>

            {/* Center Digits & Phase */}
            <div className="timerCenter">
              <div className="phase">
                {fsPhase === 'prep'
                  ? 'ГОТОВЬСЯ'
                  : fsPhase === 'work'
                  ? (timerMode === 'stopwatch' ? 'RUNNING' : 'WORK')
                  : fsPhase === 'rest'
                  ? 'REST'
                  : 'ГОТОВО'}
              </div>

              {fsPhase === 'prep' ? (
                <div className="preCount mono">
                  {fsRemainingSec}
                </div>
              ) : (
                <div className={`heroClock mono ${fsClockAnimate ? 'tick' : ''}`}>
                  {fsPhase === 'finished' ? '✓' : formatTimer(fsRemainingSec)}
                </div>
              )}

              <div className="timerSub">
                {fsPhase === 'prep'
                  ? `Старт через ${fsRemainingSec} сек`
                  : fsPhase === 'work'
                  ? (timerMode === 'stopwatch' ? 'Перерыв можно включить вручную' : `Раунд ${fsRound} из ${fsRoundsTotal}`)
                  : fsPhase === 'rest'
                  ? `Следующий раунд ${Math.min(fsRound + 1, fsRoundsTotal)} из ${fsRoundsTotal}`
                  : 'Таймер успешно завершён'}
              </div>

              {timerMode !== 'stopwatch' && (
                <div className="roundTrack">
                  {Array.from({ length: Math.min(10, fsRoundsTotal) }).map((_, idx) => (
                    <i
                      key={idx}
                      className={`${idx < fsRound - 1 ? 'done' : idx === fsRound - 1 ? 'current' : ''}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="timerBottom">
              <div className="timerMainControls">
                <button
                  type="button"
                  className="primary"
                  onClick={handleToggleTimerPause}
                >
                  {fsIsPaused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА'}
                </button>
                <button
                  type="button"
                  onClick={advanceFsTimerPhase}
                >
                  ДАЛЬШЕ
                </button>
                <button
                  type="button"
                  onClick={handleCloseFullscreenTimer}
                >
                  СТОП
                </button>
              </div>

              <div className="timerQuickControls">
                <button type="button" onClick={() => handleAdjustTimer(10)}>+10с</button>
                <button type="button" onClick={() => handleAdjustTimer(-10)}>−10с</button>
                <button
                  type="button"
                  onClick={handleForceRest}
                  disabled={timerMode === 'emom'}
                  style={timerMode === 'emom' ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                >
                  ПЕРЕРЫВ
                </button>
                <button
                  type="button"
                  onClick={handleToggleSound}
                >
                  ЗВУК {fsSoundOn ? '✓' : 'ВЫКЛ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {isCreateTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#0e161c] border border-[#233139] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">Новый шаблон тренировки</h3>
              <button
                type="button"
                onClick={() => setIsCreateTemplateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Название шаблона
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 rounded-xl bg-[#142029] border border-[#263744] text-white text-xs outline-none focus:border-[#7cf0a5]"
                placeholder="например: Грудь + Трицепс, Push A"
                value={newTemplateTitle}
                onChange={(e) => setNewTemplateTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Упражнения в шаблоне
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#142029] border border-[#263744] text-white text-xs outline-none focus:border-[#7cf0a5]"
                  placeholder="название упражнения..."
                  value={templateExInput}
                  onChange={(e) => setTemplateExInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && templateExInput.trim()) {
                      e.preventDefault();
                      setNewTemplateExercises(prev => [...prev, templateExInput.trim()]);
                      setTemplateExInput('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (templateExInput.trim()) {
                      setNewTemplateExercises(prev => [...prev, templateExInput.trim()]);
                      setTemplateExInput('');
                    }
                  }}
                  className="px-3 py-2 bg-[#1b2b36] hover:bg-[#253a47] text-[#7cf0a5] font-bold text-xs rounded-xl"
                >
                  +
                </button>
              </div>
            </div>

            {/* Quick suggestions */}
            <div className="quickRow">
              {QUICK_EXERCISES.slice(0, 4).map(name => (
                <button
                  key={name}
                  type="button"
                  className="quick text-[10px]"
                  onClick={() => setNewTemplateExercises(prev => [...prev, name])}
                >
                  + {name}
                </button>
              ))}
            </div>

            {/* Added list */}
            {newTemplateExercises.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {newTemplateExercises.map((exName, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-[#142029]">
                    <span className="text-slate-200">{exName}</span>
                    <button
                      type="button"
                      onClick={() => setNewTemplateExercises(prev => prev.filter((_, i) => i !== idx))}
                      className="text-rose-400 hover:text-rose-300 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateTemplateModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#142029] text-slate-300 font-bold text-xs hover:bg-[#1a2b37]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveNewTemplate}
                disabled={!newTemplateTitle.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#7cf0a5] hover:bg-[#68dd92] text-[#06120b] font-extrabold text-xs disabled:opacity-40 cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exercise Modal */}
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
