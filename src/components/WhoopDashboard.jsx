import React, { useMemo, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api.js';
import { SleepGlyph, HeartGlyph, FuelGlyph, TrainGlyph, SignalGlyph } from './BrandGlyphs.jsx';

function DailyFormField({ score = 68, color = '#8cff65' }) {
  const points = useMemo(() => {
    const out = [];
    const rings = 7;
    for (let r = 0; r < rings; r++) {
      const count = 28 + r * 6;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + r * 0.22;
        const wobble = 1 + Math.sin(a * 3 + r * .65) * .14 + Math.cos(a * 2 - r) * .08;
        const radius = 14 + r * 7.6;
        const x = 70 + Math.cos(a) * radius * wobble;
        const y = 70 + Math.sin(a) * radius * (0.72 + score / 500) * wobble;
        out.push({ x, y, o: .12 + r * .055, s: r < 2 ? 1.45 : 1.05 });
      }
    }
    return out;
  }, [score]);

  return (
    <div className="form-field" aria-hidden="true">
      <svg viewBox="0 0 140 140">
        <defs>
          <radialGradient id="formGlow"><stop offset="0" stopColor={color} stopOpacity=".8"/><stop offset=".28" stopColor={color} stopOpacity=".18"/><stop offset="1" stopColor={color} stopOpacity="0"/></radialGradient>
        </defs>
        <circle cx="70" cy="70" r="52" fill="url(#formGlow)" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.s} fill={color} opacity={p.o} />)}
        <circle cx="70" cy="70" r="4.5" fill={color} opacity=".95"/>
        <circle cx="70" cy="70" r="9" fill="none" stroke={color} strokeOpacity=".28"/>
      </svg>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, detail, delta, tone='good' }) {
  return (
    <div className="metric-row">
      <div className="metric-row__icon"><Icon className="w-4 h-4" /></div>
      <div className="metric-row__label">{label}</div>
      <div className="metric-row__value">{value}<span>{detail}</span></div>
      <div className={`metric-row__delta is-${tone}`}>{delta}</div>
    </div>
  );
}

export default function WhoopDashboard({ whoopData, onRefresh, onNavigate }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const current = whoopData?.current || {};
  const rec = current.recovery_score ?? 68;
  const hrv = current.hrv_ms ?? current.hrv ?? 78;
  const rhr = current.resting_hr ?? current.rhr ?? 52;
  const strain = current.strain ?? 6.9;
  const actualMin = current.sleep_actual_min ?? 408;
  const sleepH = Math.floor(actualMin / 60);
  const sleepM = actualMin % 60;
  const sleep = `${sleepH}:${String(sleepM).padStart(2,'0')}`;
  const state = rec >= 67 ? 'Готов к нагрузке' : rec >= 34 ? 'Нагрузка умеренно' : 'Сделай восстановление приоритетом';
  const accent = rec >= 67 ? '#8cff65' : rec >= 34 ? '#ffc44d' : '#ff6b66';

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
    <div className="today-screen screen-shell">
      <section className="today-hero">
        <div className="today-hero__heading">
          <div>
            <div className="eyebrow">DAILY FORM</div>
            <div className="today-score"><strong>{Math.round(rec)}</strong><span>/100</span></div>
            <div className="state-line" style={{color: accent}}>{state}</div>
            <button className="sync-link" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Синхронизация' : 'обновить данные'}
            </button>
          </div>
          <DailyFormField score={rec} color={accent} />
          <div className="hero-side-metrics">
            <span>ЭНЕРГИЯ<strong>{Math.min(99, Math.round(rec + 3))}</strong></span>
            <span>ВОССТАНОВЛЕНИЕ<strong>{Math.round(rec)}</strong></span>
            <span>НАГРУЗКА<strong>{strain}</strong></span>
          </div>
        </div>
      </section>

      <section className="editorial-section">
        <div className="section-kicker">ПОЧЕМУ ТАКОЕ СОСТОЯНИЕ?</div>
        <div className="metric-ledger">
          <MetricRow icon={SleepGlyph} label="Сон" value={sleep} detail=" · −48м" delta="−8" tone="down" />
          <MetricRow icon={HeartGlyph} label="HRV" value={`${Math.round(hrv)} мс`} detail=" · выше нормы" delta="+12" />
          <MetricRow icon={SignalGlyph} label="Вчерашняя нагрузка" value={strain > 12 ? 'Высокая' : 'Нормальная'} detail="" delta={strain > 12 ? '−6' : '+2'} tone={strain > 12 ? 'warn' : 'good'} />
          <MetricRow icon={FuelGlyph} label="Питание" value="На цели" detail="" delta="+4" />
        </div>
      </section>

      <section className="editorial-section">
        <div className="section-kicker">РЕКОМЕНДАЦИЯ НА СЕГОДНЯ</div>
        <button className="recommendation-strip" onClick={() => onNavigate?.('workouts')}>
          <span className="recommendation-strip__icon"><TrainGlyph className="w-6 h-6" /></span>
          <span className="recommendation-strip__copy"><small>Силовая тренировка</small><strong>{rec >= 67 ? 'Нормальный объём' : 'Умеренный объём'}</strong></span>
          <span className="recommendation-strip__rpe">RPE {rec >= 67 ? '7' : '5–6'}/10</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </section>

      <section className="day-targets">
        <div><span>КАЛОРИИ</span><strong>2 250</strong><small>ккал</small></div>
        <div><span>БЕЛОК</span><strong>150</strong><small>г</small></div>
        <div><span>ШАГИ</span><strong>10 000</strong><small></small></div>
        <div><span>СОН</span><strong>7ч 30м</strong><small></small></div>
      </section>

      <button className="insight-panel" onClick={() => onNavigate?.('coach')}>
        <span className="insight-panel__mark"><SignalGlyph className="w-5 h-5" /></span>
        <span className="insight-panel__copy"><small>AI INSIGHT</small><strong>Твоя готовность выше обычного для среды.</strong><span>Оптимальное окно для тренировки — 16:00–19:00.</span></span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
