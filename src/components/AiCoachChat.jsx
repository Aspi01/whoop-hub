import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, User, Brain, AlertCircle, ArrowUpRight } from 'lucide-react';
import { api } from '../services/api.js';

export default function AiCoachChat({ coachMessages, insights, onRefresh }) {
  const [messages, setMessages] = useState(coachMessages || []);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (coachMessages) setMessages(coachMessages);
  }, [coachMessages]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (questionToSend) => {
    const q = questionToSend || inputQuestion;
    if (!q.trim() || isLoading) return;

    setInputQuestion('');
    
    // Добавляем оптимистично сообщение юзера
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

  const quickPrompts = [
    { title: '📉 Почему упали веса?', prompt: 'Проанализируй, почему на последней тренировке упали веса или была сильная усталость? Найди причины в моем сне, питании и нагрузке.' },
    { title: '🌙 Анализ глубокого сна', prompt: 'Какие факторы за последнюю неделю больше всего ухудшали мой глубокий сон (SWS) и ночной HRV?' },
    { title: '🧖‍♂️ Топ моих суперсил', prompt: 'Какие привычки из моего дневника дают максимальный прирост к показателю Recovery?' },
    { title: '🥗 Оценка питания и таймингов', prompt: 'Оцени время моих приемов пищи и интервал до сна: как это сказывается на качестве восстановления?' }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-145px)] pb-24 space-y-3">
      {/* Заголовок */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-emerald-400">
              <Brain className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              AI Биохакер
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h1>
            <span className="text-[10px] text-slate-400">
              Полный кросс-анализ Whoop + Еда + Тренировки
            </span>
          </div>
        </div>
      </div>

      {/* Быстрые карточки инсайтов / паттернов (если есть) */}
      {insights && insights.length > 0 && (
        <div className="flex gap-2 overflow-x-auto shrink-0 py-1 scrollbar-none">
          {insights.map(item => (
            <div
              key={item.id}
              onClick={() => handleSend(`Расскажи подробнее про паттерн: ${item.title}`)}
              className="shrink-0 w-64 glass-card glass-card-hover rounded-2xl p-2.5 text-left cursor-pointer border border-emerald-500/20"
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                <span>{item.title}</span>
                <ArrowUpRight className="w-3 h-3" />
              </div>
              <p className="text-[10px] text-slate-300 mt-1 line-clamp-2">{item.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, idx) => {
          const isAi = m.sender === 'ai';

          return (
            <div
              key={m.id || idx}
              className={`flex items-start gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}
            >
              {isAi && (
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-3xl p-3.5 text-xs leading-relaxed ${
                  isAi
                    ? 'bg-slate-900/90 border border-slate-800 text-slate-200 shadow-md'
                    : 'bg-emerald-600 text-white font-medium rounded-br-none shadow-lg shadow-emerald-950/40'
                }`}
              >
                {/* Форматирование текста (разбивка на абзацы и списки) */}
                <div className="space-y-1.5 whitespace-pre-wrap">
                  {m.message}
                </div>
              </div>

              {!isAi && (
                <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-3xl p-3 text-xs flex items-center gap-2">
              <span>Сопоставляю показатели сна, питания и тренировок...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Быстрые вопросы-подсказки */}
      <div className="shrink-0 flex gap-1.5 overflow-x-auto py-1 text-[11px]">
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(qp.prompt)}
            className="shrink-0 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-xl border border-slate-800 transition-all"
          >
            {qp.title}
          </button>
        ))}
      </div>

      {/* Поле ввода сообщения */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="shrink-0 flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 focus-within:border-emerald-500 transition-all shadow-xl"
      >
        <input
          type="text"
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          placeholder="Спроси AI: почему упали веса, как сон..."
          className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputQuestion.trim() || isLoading}
          className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold transition-all cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
