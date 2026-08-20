import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api.js';

function WhoopRing({ value, unit = '%', label, percent, color, trackColor = '#131b22' }) {
  const radius = 34;
  const stroke = 5.5;
  const circ = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div className="flex flex-col items-center min-w-0">
      <div className="relative w-[84px] h-[84px] flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
          <circle
            cx="42"
            cy="42"
            r={radius}
            stroke={trackColor}
            strokeWidth={stroke}
            fill="transparent"
          />
          <circle
            cx="42"
            cy="42"
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[21px] font-[780] tracking-tight text-white leading-none font-mono flex items-baseline">
            {value}
            {unit && <small className="text-[9px] text-[#7f8a92] ml-0.5 font-sans font-bold">{unit}</small>}
          </span>
        </div>
      </div>
      <span className="text-[8px] uppercase tracking-[0.14em] text-[#7b878f] font-[720] mt-2">
        {label}
      </span>
    </div>
  );
}

export default function WhoopDashboard({ whoopData, onRefresh, onNavigate, onOpenSettings }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const current = whoopData?.current || {};
  const rec = current.recovery_score ?? 68;
  const hrv = current.hrv_ms ?? current.hrv ?? 107;
  const strain = current.strain ?? 4.4;
  const actualMin = current.sleep_actual_min ?? 486;
  const sleepH = Math.floor(actualMin / 60);
  const sleepM = actualMin % 60;
  const sleep = `${sleepH}ч ${String(sleepM).padStart(2, '0')}м`;
  const sleepScore = current.sleep_performance ?? 82;

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await api.syncWhoop();
      await onRefresh?.();
      if (rec >= 80) confetti({ particleCount: 30, spread: 50, origin: { y: .35 } });
    } catch (e) {
      console.warn(e);
      await onRefresh?.();
    } finally { setIsSyncing(false); }
  };

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

      {/* Hero with Statement and 3 Smooth SVG Rings (zero white outlines) */}
      <div className="todayHero">
        <div className="formTop">
          <div>
            <div className="heroStatement">
              {rec >= 67 ? <>GOOD TO <span>TRAIN</span></> : rec >= 34 ? <>MODERATE <span>LOAD</span></> : <>NEED <span>REST</span></>}
            </div>
            <div className="heroCopy">
              {rec >= 67
                ? 'Восстановление позволяет тренироваться по плану. Нагрузку можно держать обычной.'
                : 'Восстановление снижено. Сделайте акцент на технику или легкое кардио.'}
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
            <strong>{rec >= 67 ? 'Нормальный объём' : 'Умеренный объём'}</strong>
          </div>
          <div className="badge">RPE {rec >= 67 ? '7' : '5–6'}/10</div>
        </div>
        <div className="targets mono">
          <div className="target"><span>Калории</span><b>2 250</b></div>
          <div className="target"><span>Белок</span><b>150 г</b></div>
          <div className="target"><span>Шаги</span><b>10k</b></div>
          <div className="target"><span>Сон</span><b>7:30</b></div>
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
