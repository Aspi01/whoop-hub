import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { normalizeHealthData } from '../services/healthDataLayer.js';
import { Sparkles, Shield, Cpu, ChevronRight, X, ArrowRight, Check, FlaskConical, BarChart3, AlertCircle } from 'lucide-react';

export default function AiCoachChat({
  whoopData,
  mealsData,
  workoutsData,
  journalData,
  coachMessages,
  onNavigate,
  onOpenSettings,
  onOpenSources
}) {
  const health = normalizeHealthData({ whoopData, mealsData, workoutsData, journalData });

  const [activeFindings, setActiveFindings] = useState(health.findings);
  const [selectedFindingDetail, setSelectedFindingDetail] = useState(null);
  const [selectedPatternDetail, setSelectedPatternDetail] = useState(null);
  const [activeExperiments, setActiveExperiments] = useState(() => {
    try {
      const saved = localStorage.getItem('whoop_active_experiments');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [messages, setMessages] = useState(coachMessages || []);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Lock body scroll when detail modals are open
  useEffect(() => {
    if (selectedFindingDetail || selectedPatternDetail) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedFindingDetail, selectedPatternDetail]);

  useEffect(() => {
    if (coachMessages && coachMessages.length > 0) {
      setMessages(coachMessages);
    } else {
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          message: 'Я проанализировал твои метрики и персональный baseline. Сон и HRV находятся в нормальном коридоре относительно твоих 30-дневных средних значений.\n\nЕсли хочешь разобрать конкретную тренировку, влияние питания на глубокий сон или запустить эксперимент — просто напиши мне!'
        }
      ]);
    }
  }, [coachMessages]);

  const handleSend = async (questionToSend) => {
    const q = questionToSend || inputQuestion;
    if (!q.trim() || isLoading) return;

    setInputQuestion('');
    const tempUserMsg = { id: Date.now(), sender: 'user', message: q.trim() };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await api.askCoach(q.trim());
      if (res.success && res.messages) {
        setMessages(res.messages);
      }
    } catch (err) {
      alert('Ошибка AI: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissFinding = (id) => {
    setActiveFindings(prev => prev.filter(f => f.id !== id));
  };

  const handleToggleExperiment = (expId) => {
    const updated = { ...activeExperiments, [expId]: !activeExperiments[expId] };
    setActiveExperiments(updated);
    localStorage.setItem('whoop_active_experiments', JSON.stringify(updated));
  };

  return (
    <div className="screen-shell pb-44">
      {/* Header */}
      <header className="header minorHeader">
        <div>
          <div className="headTitle">AI Intelligence</div>
          <div className="headSub">Персональные инсайты и анализ</div>
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
        </div>
      </header>

      {/* AI Lead Summary */}
      <div className="aiLead">
        <div className="count">
          {activeFindings.length} <small>активных вывода сегодня</small>
        </div>
        <p>Системный анализ сигналов: восстановление, фазы сна, питание и тренировочный объём.</p>
      </div>

      {/* ==========================================
          A. ЧТО ВАЖНО СЕГОДНЯ (What Matters Today)
         ========================================== */}
      <div className="sectionHead compact" style={{ marginTop: '16px' }}>
        <div className="sectionLabel">Что важно сегодня</div>
        <span className="contextPill">Действия</span>
      </div>

      <div className="space-y-4">
        {activeFindings.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[#091219] border border-[#1d2b35] text-center text-xs text-[#8e9aa1]">
            Все сигналы на сегодня просмотрены. Показатели стабильны.
          </div>
        ) : (
          activeFindings.map((finding) => (
            <div key={finding.id} className="finding">
              <div className="findingKicker">{finding.kicker}</div>
              <h3>{finding.title}</h3>
              <p>{finding.description}</p>

              {/* Evidence Ledger vs Personal Baseline */}
              <div className="evidence mono">
                {finding.evidence.map((ev, i) => (
                  <div key={i} className="ev">
                    <span>{ev.label}</span>
                    <b className={ev.status === 'pos' ? 'accent' : ev.status === 'neg' ? 'rose' : ev.status === 'amber' ? 'amber' : ''}>
                      {ev.value}
                    </b>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="aiActions">
                <button
                  type="button"
                  className="aiAction primary"
                  onClick={() => {
                    if (onNavigate) onNavigate('workouts');
                    else handleSend('Как скорректировать сегодняшнюю тренировку?');
                  }}
                >
                  Применить к тренировке
                </button>
                <button
                  type="button"
                  className="aiAction"
                  onClick={() => setSelectedFindingDetail(finding)}
                >
                  Почему?
                </button>
                <button
                  type="button"
                  className="aiAction"
                  style={{ opacity: 0.6 }}
                  onClick={() => handleDismissFinding(finding.id)}
                >
                  Скрыть
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ==========================================
          B. НАЙДЕННЫЕ ЗАКОНОМЕРНОСТИ (Patterns Found)
         ========================================== */}
      <div className="sectionHead compact" style={{ marginTop: '26px' }}>
        <div className="sectionLabel">Найденные закономерности</div>
        <span className="contextPill">{health.patterns.length} паттерна</span>
      </div>

      <div className="space-y-2.5">
        {(!health.patterns || health.patterns.length === 0) ? (
          <div className="p-3.5 rounded-xl bg-[#091118] border border-[#1b2730] text-center">
            <div className="text-xs text-[#8e9ca4] font-medium">Недостаточно исторических данных</div>
            <div className="text-[10px] text-[#60707b] mt-1">
              Закономерности формируются автоматически при накоплении от 14 дней реальных записей.
            </div>
          </div>
        ) : (
          health.patterns.map((pattern) => (
            <div
              key={pattern.id}
              className="patternCard p-3.5 rounded-xl bg-[#091118] border border-[#1b2730] hover:border-[#283945] cursor-pointer transition-all active:scale-[0.99]"
              onClick={() => setSelectedPatternDetail(pattern)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#f3f6f4] flex items-center gap-1.5">
                    <span>{pattern.title}</span>
                  </div>
                  <div className="text-[10px] text-[#8e9ca4] mt-1 leading-relaxed">
                    {pattern.subtitle}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#60707b] shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#131e26] text-[9px]">
                <span className="text-[#7d8c95] mono">Выборка: {pattern.sampleDays} дней</span>
                <span className={`font-bold ${pattern.confidence === 'Высокая' ? 'text-[#7cf0a5]' : 'text-[#f1c463]'}`}>
                  Уверенность: {pattern.confidence}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ==========================================
          C. ПЕРСОНАЛЬНЫЕ ЭКСПЕРИМЕНТЫ (Experiments)
         ========================================== */}
      <div className="sectionHead compact" style={{ marginTop: '26px' }}>
        <div className="sectionLabel">Персональные эксперименты</div>
        <span className="contextPill">AI гипотезы</span>
      </div>

      <div className="space-y-3">
        {(!health.experiments || health.experiments.length === 0) ? (
          <div className="p-3.5 rounded-xl bg-[#091118] border border-[#1b2730] text-center">
            <div className="text-xs text-[#8e9ca4] font-medium">Нет активных экспериментов</div>
            <div className="text-[10px] text-[#60707b] mt-1">
              Эксперименты станут доступны после накопления персонального baseline.
            </div>
          </div>
        ) : (
          health.experiments.map((exp) => {
          const isActive = Boolean(activeExperiments[exp.id]);
          return (
            <div
              key={exp.id}
              className={`p-3.5 rounded-xl border transition-all ${isActive ? 'bg-[#0e1d17] border-[#25523a]' : 'bg-[#091118] border-[#1b2730]'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className={`w-4 h-4 ${isActive ? 'text-[#7cf0a5]' : 'text-[#87d8f5]'}`} />
                  <strong className="text-xs font-extrabold text-[#f3f6f4]">{exp.title}</strong>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[#142028] text-[#8e9ca4] border border-[#202f3a]">
                  {exp.duration}
                </span>
              </div>

              <p className="text-[10px] text-[#8e9ca4] mt-2 leading-relaxed">
                <b>Гипотеза:</b> {exp.hypothesis}
              </p>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#142028]">
                <div className="text-[9px] text-[#7d8c95]">
                  Метрики: {exp.trackedMetrics.join(', ')}
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleExperiment(exp.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#173926] text-[#7cf0a5] border border-[#24523a]'
                      : 'bg-[#13222d] text-[#e3e8e5] border border-[#243542] hover:bg-[#1a2d3a]'
                  }`}
                >
                  {isActive ? '✓ Активен' : 'Начать эксперимент'}
                </button>
              </div>
            </div>
          );
        }))}
      </div>

      {/* ==========================================
          D. ВОПРОСЫ И ЧАТ (Secondary Chat)
         ========================================== */}
      <div className="promptTitle" style={{ marginTop: '26px' }}>Спроси глубже</div>
      <div className="promptRow">
        <button type="button" className="prompt" onClick={() => handleSend('Почему упали веса на прошлой тренировке?')}>
          Почему упали веса?
        </button>
        <button type="button" className="prompt" onClick={() => handleSend('Что больше всего влияет на мой глубокий сон?')}>
          Что влияет на сон?
        </button>
        <button type="button" className="prompt" onClick={() => handleSend('Стоит ли сегодня тяжело тренироваться?')}>
          Стоит ли тяжело тренироваться?
        </button>
        <button type="button" className="prompt" onClick={() => handleSend('Какие привычки из дневника дают лучший Recovery?')}>
          Лучшие привычки
        </button>
      </div>

      {/* Chat Messages */}
      <div className="chatMini">
        {messages.map((m, idx) => (
          <div key={m.id || idx} className={`msg ${m.sender === 'user' ? 'user' : ''}`}>
            {m.message}
          </div>
        ))}
        {isLoading && (
          <div className="msg">
            <span className="accent animate-pulse font-bold">AI Коуч анализирует метрики и baseline...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Composer Input fixed above dock */}
      <div
        className="fixed left-0 right-0 z-40 px-3.5 pointer-events-none"
        style={{ bottom: 'calc(94px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-[402px] mx-auto bg-[#0a1319]/95 backdrop-blur-xl border border-[#2e3b43] rounded-2xl p-2 px-3 flex items-center gap-2 shadow-2xl pointer-events-auto">
          <input
            type="text"
            placeholder="Спроси про сон, тренировку, питание…"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-transparent border-0 text-white text-xs placeholder:text-[#5f6b73] outline-none py-1.5"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputQuestion.trim() && !isLoading}
            aria-label="Отправить"
            className="w-9 h-9 rounded-full bg-[#7cf0a5] hover:bg-[#68dd92] disabled:opacity-40 text-[#06120b] shrink-0 grid place-items-center cursor-pointer active:scale-95 transition-all shadow-md shadow-[#7cf0a5]/20"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none stroke-[2]">
              <path d="m22 2-7 20-4-9-9-4z"/>
              <path d="M22 2 11 13"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Modal 1: Expanded Finding Explanation ("Почему?") */}
      {selectedFindingDetail && (
        <div className="modal open" onClick={() => setSelectedFindingDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <div>
                <h2>{selectedFindingDetail.title}</h2>
                <div className="text-[10px] uppercase tracking-wider text-[#7cf0a5] mt-0.5 font-bold">
                  {selectedFindingDetail.kicker}
                </div>
              </div>
              <button type="button" className="close" onClick={() => setSelectedFindingDetail(null)}>×</button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-[#0b141b] border border-[#1d2931]">
                <div className="text-[9px] uppercase tracking-wider text-[#7d8c95] font-bold mb-1">
                  1. Наблюдаемый факт
                </div>
                <div className="text-xs text-[#f3f6f4] leading-relaxed">
                  {selectedFindingDetail.details?.fact}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0b141b] border border-[#1d2931]">
                <div className="text-[9px] uppercase tracking-wider text-[#7d8c95] font-bold mb-1">
                  2. Выявленный паттерн
                </div>
                <div className="text-xs text-[#c4d0cc] leading-relaxed">
                  {selectedFindingDetail.details?.pattern}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0e1d17] border border-[#24523a]">
                <div className="text-[9px] uppercase tracking-wider text-[#7cf0a5] font-bold mb-1">
                  3. Рекомендация на сегодня
                </div>
                <div className="text-xs text-[#e3ece7] leading-relaxed">
                  {selectedFindingDetail.details?.recommendationText}
                </div>
              </div>

              <div className="text-[10px] text-[#7d8c95] text-right font-mono">
                Уверенность: {selectedFindingDetail.details?.confidence}
              </div>

              <button
                type="button"
                className="connect mt-2"
                onClick={() => setSelectedFindingDetail(null)}
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Detailed Pattern Breakdown */}
      {selectedPatternDetail && (
        <div className="modal open" onClick={() => setSelectedPatternDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <div>
                <h2>{selectedPatternDetail.title}</h2>
                <div className="text-[10px] uppercase tracking-wider text-[#7f8b92] mt-0.5 font-bold">
                  {selectedPatternDetail.subtitle}
                </div>
              </div>
              <button type="button" className="close" onClick={() => setSelectedPatternDetail(null)}>×</button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#0b141b] border border-[#1d2931]">
                  <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Метрика</span>
                  <b className="text-xs text-[#f3f6f4] mt-1 block">{selectedPatternDetail.metric}</b>
                </div>
                <div className="p-3 rounded-xl bg-[#0b141b] border border-[#1d2931]">
                  <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Разница</span>
                  <b className={`text-xs mt-1 block ${selectedPatternDetail.effectDirection === 'positive' ? 'text-[#7cf0a5]' : 'text-[#ff8c78]'}`}>
                    {selectedPatternDetail.delta}
                  </b>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0b141b] border border-[#1d2931]">
                <div className="text-[9px] uppercase tracking-wider text-[#7d8c95] font-bold mb-1">
                  Подробности наблюдения
                </div>
                <div className="text-xs text-[#c4d0cc] leading-relaxed">
                  {selectedPatternDetail.details}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#121c24] border border-[#21303b]">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[#f1c463] font-bold mb-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Честная оговорка (Caveat)</span>
                </div>
                <div className="text-[10px] text-[#9bb0bc] leading-relaxed">
                  {selectedPatternDetail.caveat}
                </div>
              </div>

              <button
                type="button"
                className="connect mt-2"
                onClick={() => setSelectedPatternDetail(null)}
              >
                Закрыть анализ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
