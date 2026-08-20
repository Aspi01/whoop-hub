import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../services/api.js';

// Чистые круглые индикаторы без белых рамок
function WhoopRing({ value, unit = '%', label, percent, color }) {
  const size = 84;
  const strokeWidth = 5.5;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
          {/* Фоновый трек */}
          <circle
            cx="42"
            cy="42"
            r={radius}
            stroke="#131b22"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Активный индикатор прогресса */}
          <circle
            cx="42"
            cy="42"
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[20px] font-[800] tracking-tight leading-none text-[#f3f6f4] font-mono">
            {value}
            {unit && <small className="text-[9px] text-[#7f8b92] ml-0.5 font-normal">{unit}</small>}
          </span>
        </div>
      </div>
      <div className="text-[8px] uppercase tracking-[0.12em] text-[#7b878f] mt-2 font-[720]">
        {label}
      </div>
    </div>
  );
}

export default function WhoopDashboard({ dashboardData, whoopData, onRefresh, onNavigate, onOpenSettings }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [calorieGoal, setCalorieGoal] = useState(() => {
    try {
      return Number(localStorage.getItem('whoop_calorie_goal')) || 2250;
    } catch (e) {
      return 2250;
    }
  });
  const [proteinGoal, setProteinGoal] = useState(() => {
    try {
      return Number(localStorage.getItem('whoop_protein_goal')) || 150;
    } catch (e) {
      return 150;
    }
  });

  useEffect(() => {
    const handleGoalUpdate = () => {
      try {
        setCalorieGoal(Number(localStorage.getItem('whoop_calorie_goal')) || 2250);
        setProteinGoal(Number(localStorage.getItem('whoop_protein_goal')) || 150);
      } catch (e) {}
    };
    window.addEventListener('whoop_goal_updated', handleGoalUpdate);
    return () => window.removeEventListener('whoop_goal_updated', handleGoalUpdate);
  }, []);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await api.syncWhoop();
      await onRefresh();
    } catch (err) {
      alert('Ошибка синхронизации: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const data = whoopData || dashboardData || {};
  const readiness = data.readiness || {};
  const metrics = data.metrics || {};

  const rec = Number(readiness.recovery_score || 68);
  const hrv = Number(readiness.hrv || 107);
  const sleep = readiness.sleep_duration_formatted || '8ч 06м';
  const sleepScore = Number(readiness.sleep_performance_percentage || 82);
  const strain = Number(metrics.strain || 4.4);

  // Детерминированный маппинг состояния
  const getStateInfo = (score) => {
    if (score >= 80) {
      return {
        statement: <>GOOD TO <span>TRAIN</span></>,
        copy: 'Восстановление позволяет тренироваться по плану. Нагрузку можно держать обычной.',
        sub: 'Нормальный объём',
        rpe: '7/10'
      };
    }
    if (score >= 67) {
      return {
        statement: <>GOOD TO <span>TRAIN</span></>,
        copy: 'Восстановление позволяет тренироваться по плану. Нагрузку можно держать обычной.',
        sub: 'Нормальный объём',
        rpe: '7/10'
      };
    }
    if (score >= 50) {
      return {
        statement: <>TRAIN, BUT <span>EASIER</span></>,
        copy: 'Базовое восстановление. Лучше работать в умеренном темпе без предельных отказов.',
        sub: 'Умеренный объём',
        rpe: '6/10'
      };
    }
    if (score >= 34) {
      return {
        statement: <>LISTEN TO <span>YOUR BODY</span></>,
        copy: 'Организм испытывает стресс. Сделайте разминку и ориентируйтесь по самочувствию.',
        sub: 'Легкая тренировка',
        rpe: '5/10'
      };
    }
    return {
      statement: <>RECOVERY <span>FIRST</span></>,
      copy: 'Сильное утомление. Рекомендуется день активного отдыха, массаж или растяжка.',
      sub: 'День отдыха / Стретчинг',
      rpe: '3-4/10'
    };
  };

  const stateInfo = getStateInfo(rec);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'long'
  });

  return (
    <div className="screen-shell">
      {/* Header */}
      <header className="header">
        <div>
          <div className="headTitle">TODAY</div>
          <div className="headSub">{dateFormatted}</div>
        </div>
        <button type="button" className="iconBtn" onClick={onOpenSettings} aria-label="Настройки">
          <span className="dot"></span>
          <svg viewBox="0 0 24 24">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
            <path d="M10 21h4"/>
          </svg>
        </button>
      </header>

      <div className="sectionLabel">Сегодняшнее состояние</div>

      {/* Hero with Statement and 3 Smooth SVG Rings */}
      <div className="todayHero">
        <div className="formTop">
          <div>
            <div className="heroStatement">
              {stateInfo.statement}
            </div>
            <div className="heroCopy">
              {stateInfo.copy}
            </div>
          </div>
          <div className="formMeta">
            <small>vs вчера</small>
            <b>▲ +4</b>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3.5 my-4">
          <WhoopRing
            value={Math.round(sleepScore)}
            unit="%"
            label="Sleep"
            percent={sleepScore}
            color="#38bdf8"
          />
          <WhoopRing
            value={Math.round(rec)}
            unit="%"
            label="Recovery"
            percent={rec}
            color="#7cf0a5"
          />
          <WhoopRing
            value={strain}
            unit=""
            label="Strain"
            percent={(strain / 21) * 100}
            color="#4fa4d7"
          />
        </div>
      </div>

      {/* Factors list */}
      <div className="sectionLabel">Почему такое состояние?</div>
      <div className="reasonList">
        <div className="reason">
          <div className="miniGlyph violet">
            <svg viewBox="0 0 24 24"><path d="M20 15a8 8 0 1 1-11-11 7 7 0 0 0 11 11z"/></svg>
          </div>
          <div className="reasonName">Сон</div>
          <div className="reasonMeta">{sleep} · {Math.round(sleepScore)}%</div>
          <div className="impact neg">−8</div>
        </div>
        <div className="reason">
          <div className="miniGlyph accent">
            <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>
          </div>
          <div className="reasonName">HRV</div>
          <div className="reasonMeta">{Math.round(hrv)} мс · +9%</div>
          <div className="impact pos">+12</div>
        </div>
        <div className="reason">
          <div className="miniGlyph amber">
            <svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
          </div>
          <div className="reasonName">Вчерашняя нагрузка</div>
          <div className="reasonMeta">{strain > 12 ? 'высокая' : 'умеренная'}</div>
          <div className="impact neg">−4</div>
        </div>
        <div className="reason">
          <div className="miniGlyph accent">
            <svg viewBox="0 0 24 24"><path d="M3 11h18M7 4v16M17 4v16"/></svg>
          </div>
          <div className="reasonName">Питание</div>
          <div className="reasonMeta">на цели</div>
          <div className="impact pos">+4</div>
        </div>
      </div>

      {/* Recommendation Section */}
      <div className="section">
        <div className="sectionLabel">Рекомендация на сегодня</div>
        <div className="reco" onClick={() => onNavigate?.('workouts')} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="recoIcon">
            <svg viewBox="0 0 24 24"><path d="M3 9h3v6H3zM18 9h3v6h-3zM6 7h3v10H6zM15 7h3v10h-3zM9 11h6v2H9z"/></svg>
          </div>
          <div>
            <small>Силовая тренировка</small>
            <strong>{stateInfo.sub}</strong>
          </div>
          <div className="badge">RPE {stateInfo.rpe}</div>
        </div>
        <div className="targets mono">
          <div className="target">
            <span>Калории</span>
            <b>{calorieGoal.toLocaleString('ru-RU')}</b>
          </div>
          <div className="target">
            <span>Белок</span>
            <b>{proteinGoal} г</b>
          </div>
          <div className="target">
            <span>Шаги</span>
            <b>10k</b>
          </div>
          <div className="target">
            <span>Сон</span>
            <b>7:30</b>
          </div>
        </div>
      </div>

      {/* AI Insight */}
      <div className="insight section" onClick={() => onNavigate?.('coach')} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
        <div className="insightIcon">
          <svg viewBox="0 0 24 24"><path d="m12 2 2.2 6.3L20 12l-5.8 3.7L12 22l-2.2-6.3L4 12l5.8-3.7z"/></svg>
        </div>
        <div>
          <div className="insightTitle">AI Insight</div>
          <p>Сегодня важнее техника, чем добор объёма. При таком Recovery твои силовые показатели обычно сохраняются.</p>
        </div>
        <div className="chev">›</div>
      </div>

      {/* Sync Link Button */}
      <div className="mt-4 text-center">
        <button
          type="button"
          className="sync-link inline-flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-[#7cf0a5]"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Синхронизация...' : 'Обновить данные Whoop'}</span>
        </button>
      </div>
    </div>
  );
}
