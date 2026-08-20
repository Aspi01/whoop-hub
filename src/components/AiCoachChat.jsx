import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';

export default function AiCoachChat({ coachMessages, insights, coachInsights, onOpenSettings }) {
  const [messages, setMessages] = useState(coachMessages || []);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (coachMessages && coachMessages.length > 0) {
      setMessages(coachMessages);
    } else {
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          message: 'Я изучил твои метрики: сегодняшний Recovery составляет **68%**, сон был достаточно качественным.\n\nТы тренировался с хорошей интенсивностью, а суточный баланс макронутриентов находится в оптимальном коридоре. Если хочешь разобрать конкретную тренировку, блюдо или самочувствие — просто уточни вопрос!'
        }
      ]);
    }
  }, [coachMessages]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
      alert('Ошибка AI Коуча: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="screen-shell pb-24">
      {/* Header */}
      <header className="header minorHeader">
        <div>
          <div className="headTitle">AI</div>
          <div className="headSub">Персональные выводы</div>
        </div>
        <button type="button" className="iconBtn" onClick={onOpenSettings} aria-label="Настройки">
          <span className="dot"></span>
          <svg viewBox="0 0 24 24">
            <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>
          </svg>
        </button>
      </header>

      {/* AI Lead */}
      <div className="aiLead">
        <div className="count">2 <small>важных сигнала сегодня</small></div>
        <p>Только выводы, которые могут изменить твоё решение сегодня.</p>
      </div>

      {/* Finding 1 */}
      <div className="finding">
        <div className="findingKicker">Recovery trend</div>
        <h3>Recovery держится на стабильном уровне.</h3>
        <p>Тренироваться можно нормально, но сегодня держи фокус на технике и чистых паузах между сетами.</p>
        <div className="evidence mono">
          <div className="ev"><span>Сон относительно цели</span><b className="rose">−48 мин</b></div>
          <div className="ev"><span>HRV относительно baseline</span><b className="accent">+9%</b></div>
          <div className="ev"><span>Вчерашний stress</span><b className="amber">в норме</b></div>
        </div>
        <div className="aiActions">
          <button type="button" className="aiAction primary" onClick={() => handleSend('Как скорректировать тренировку под текущий Recovery?')}>
            Применить к тренировке
          </button>
          <button type="button" className="aiAction" onClick={() => handleSend('Почему HRV выше нормы при недосыпе?')}>
            Почему?
          </button>
        </div>
      </div>

      {/* Finding 2 */}
      <div className="finding">
        <div className="findingKicker">30-day pattern</div>
        <h3>Поздний ужин связан с сокращением фазы глубокого сна.</h3>
        <p>В дни с приемом пищи позже 21:30 твой глубокий сон (SWS) сокращается в среднем на 32%. Старайся ужинать за 3 часа до сна.</p>
        <div className="aiActions">
          <button type="button" className="aiAction" onClick={() => handleSend('Как настроить тайминг ужина для максимального восстановления?')}>
            Открыть анализ
          </button>
        </div>
      </div>

      {/* Prompt chips */}
      <div className="promptTitle">Спроси глубже</div>
      <div className="promptRow">
        <button type="button" className="prompt" onClick={() => handleSend('Почему упали веса на прошлой тренировке?')}>
          Почему упали веса?
        </button>
        <button type="button" className="prompt" onClick={() => handleSend('Что больше всего влияет на мой глубокий сон?')}>
          Что влияет на сон?
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
            <span className="accent animate-pulse font-bold">AI Коуч анализирует метрики...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Composer */}
      <div className="composer">
        <input
          placeholder="Спроси про сон, тренировку, питание…"
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button type="button" className="send" onClick={() => handleSend()} aria-label="Отправить">
          <svg viewBox="0 0 24 24">
            <path d="m22 2-7 20-4-9-9-4z"/>
            <path d="M22 2 11 13"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
