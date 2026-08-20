import React, { useState, useEffect } from 'react';
import { RefreshCw, Cpu, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../services/api.js';

// Clean SVG ring without white borders
function WhoopRing({ value, unit = '%', label, percent, color, isMissing = false }) {
  const size = 84;
  const strokeWidth = 5.5;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isMissing
    ? circumference
    : circumference - (Math.min(100, Math.max(0, percent || 0)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
          <circle
            cx="42"
            cy="42"
            r={radius}
            stroke="#131b22"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {!isMissing && (
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
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[20px] font-[800] tracking-tight leading-none text-[#f3f6f4] font-mono">
            {isMissing ? '--' : value}
            {!isMissing && unit && <small className="text-[9px] text-[#7f8b92] ml-0.5 font-normal">{unit}</small>}
          </span>
        </div>
      </div>
      <div className="text-[8px] uppercase tracking-[0.12em] text-[#7b878f] mt-2 font-[720]">
        {label}
      </div>
    </div>
  );
}

export default function WhoopDashboard({
  dashboardData,
  whoopData,
  normalizedHealth,
  onRefresh,
  onNavigate,
  onOpenSettings,
  onOpenSources
}) {
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

  const rawData = whoopData || dashboardData || {};
  const isSourceMissing = Boolean(whoopData?.isMockMissingSource === true || (rawData?.isConnected === false && !rawData?.readiness));

  const readiness = normalizedHealth?.readiness || rawData.readiness || {};
  const metrics = normalizedHealth?.metrics || rawData.metrics || {};

  const rec = isSourceMissing ? null : Number(readiness.score || readiness.recovery_score || 68);
  const hrv = isSourceMissing ? null : Number(normalizedHealth?.hrv?.value || readiness.hrv || 107);
  const sleep = isSourceMissing ? null : (normalizedHealth?.sleep?.durationFormatted || readiness.sleep_duration_formatted || '8ч 06м');
  const sleepScore = isSourceMissing ? null : Number(normalizedHealth?.sleep?.score || readiness.sleep_score || 82);
  const strain = isSourceMissing ? null : Number(normalizedHealth?.strain?.score || metrics.strain || 4.4);

  // Deterministic state mapping
  const getStateInfo = (score) => {
    if (isSourceMissing || score === null) {
      return {
        statement: <>CONNECT <span>DEVICE</span></>,
        copy: 'Подключите Whoop или Apple Health для автоматического расчёта готовности к тренировке.',
        sub: 'Ожидание источника',
        rpe: '--'
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="iconBtn"
            onClick={onOpenSources || onOpenSettings}
            title="Источники данных"
            aria-label="Источники данных"
          >
            <span className="dot"></span>
            <Cpu className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="iconBtn"
            onClick={onOpenSettings}
            title="Настройки"
            aria-label="Настройки"
          >
            <svg viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
              <path d="M10 21h4"/>
            </svg>
          </button>
        </div>
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
            <b>{isSourceMissing ? '--' : '▲ +4'}</b>
          </div>
        </div>

        {/* Graceful Missing Source Banner */}
        {isSourceMissing && (
          <div className="p-3.5 mb-4 rounded-xl bg-[#0b141b] border border-[#1f2e3a] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#87d8f5] shrink-0" />
              <div className="text-[11px] text-[#c2d0d9]">
                Носимый трекер не синхронизирован
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSources || onOpenSettings}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#173926] text-[#7cf0a5] border border-[#24523a] shrink-0"
            >
              Подключить
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3.5 my-4">
          <WhoopRing
            value={sleepScore !== null ? Math.round(sleepScore) : '--'}
            unit="%"
            label="Sleep"
            percent={sleepScore || 0}
            color="#38bdf8"
            isMissing={isSourceMissing}
          />
          <WhoopRing
            value={rec !== null ? Math.round(rec) : '--'}
            unit="%"
            label="Recovery"
            percent={rec || 0}
            color={rec >= 67 ? '#7cf0a5' : rec >= 34 ? '#f1c463' : '#ff8c78'}
            isMissing={isSourceMissing}
          />
          <WhoopRing
            value={strain !== null ? strain.toFixed(1) : '--'}
            unit=""
            label="Strain"
            percent={strain ? (strain / 21) * 100 : 0}
            color="#38bdf8"
            isMissing={isSourceMissing}
          />
        </div>
      </div>

      {/* Reason Ledger */}
      <div className="sectionLabel" style={{ marginTop: '22px' }}>Почему такое состояние?</div>
      <div className="reasonList">
        <div className="reason">
          <div className="miniGlyph">
            <svg viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </div>
          <div className="reasonName">Сон</div>
          <div className="reasonMeta">{isSourceMissing ? '--' : `${sleep} · ${sleepScore}%`}</div>
          <div className={`impact ${isSourceMissing ? '' : 'neg'}`}>{isSourceMissing ? '--' : '−8'}</div>
        </div>

        <div className="reason">
          <div className="miniGlyph">
            <svg viewBox="0 0 24 24">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <div className="reasonName">HRV</div>
          <div className="reasonMeta">{isSourceMissing ? '--' : `${hrv} мс · +9%`}</div>
          <div className={`impact ${isSourceMissing ? '' : 'pos'}`}>{isSourceMissing ? '--' : '+12'}</div>
        </div>

        <div className="reason">
          <div className="miniGlyph">
            <svg viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div className="reasonName">Вчерашняя нагрузка</div>
          <div className="reasonMeta">умеренная</div>
          <div className="impact neg">−4</div>
        </div>

        <div className="reason">
          <div className="miniGlyph">
            <svg viewBox="0 0 24 24">
              <path d="M12 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>
            </svg>
          </div>
          <div className="reasonName">Питание</div>
          <div className="reasonMeta">на цели</div>
          <div className="impact pos">+4</div>
        </div>
      </div>

      {/* Recommendation on Today */}
      <div className="sectionLabel" style={{ marginTop: '22px' }}>Рекомендация на сегодня</div>
      <div className="reco">
        <div className="recoIcon">
          <svg viewBox="0 0 24 24">
            <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>
          </svg>
        </div>
        <div>
          <small>Силовая тренировка</small>
          <strong>{stateInfo.sub}</strong>
        </div>
        <div className="badge">RPE {stateInfo.rpe}</div>
      </div>

      {/* Target Metrics Row */}
      <div className="targets mono">
        <div className="target">
          <span>Калории</span>
          <b className="accent">{calorieGoal}</b>
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
  );
}
