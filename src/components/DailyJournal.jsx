import React, { useState, useEffect } from 'react';
import { BookOpen, Check, Plus, Sparkles, Smile, BatteryCharging, Zap } from 'lucide-react';
import { api } from '../services/api.js';

export default function DailyJournal({ journalData, onRefresh }) {
  const defaultTags = journalData?.defaultTags || [
    '☕ Кофе после 15:00',
    '🍷 Алкоголь',
    '🧖‍♂️ Сауна / Баня',
    '💊 Магний на ночь',
    '🥶 Холодный душ',
    '🚶‍♂️ Прогулка 10k шагов',
    '🧘‍♂️ Медитация / Дыхание',
    '🍕 Поздний плотный ужин'
  ];

  const entry = journalData?.entry || {};
  const [selectedTags, setSelectedTags] = useState(entry.tags || []);
  const [customTagInput, setCustomTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState(defaultTags);
  const [stressLevel, setStressLevel] = useState(entry.stress_level || 2);
  const [energyLevel, setEnergyLevel] = useState(entry.energy_level || 8);
  const [notes, setNotes] = useState(entry.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (entry.tags) setSelectedTags(entry.tags);
    if (entry.stress_level !== undefined) setStressLevel(entry.stress_level);
    if (entry.energy_level !== undefined) setEnergyLevel(entry.energy_level);
    if (entry.notes !== undefined) setNotes(entry.notes);
  }, [journalData]);

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddCustomTag = (e) => {
    e.preventDefault();
    if (!customTagInput.trim()) return;
    const newTag = customTagInput.trim();
    if (!availableTags.includes(newTag)) {
      setAvailableTags([...availableTags, newTag]);
    }
    if (!selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
    }
    setCustomTagInput('');
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await api.saveJournalToday({
        tags: selectedTags,
        stress_level: stressLevel,
        energy_level: energyLevel,
        notes
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      await onRefresh();
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-teal-400 font-bold">
            Вечерний биохак-чекап
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Дневник факторов
          </h1>
        </div>
        <span className="text-[11px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
          15 секунд в день
        </span>
      </div>

      {/* Быстрые теги факторов */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
          Что присутствовало за день:
        </span>

        <div className="flex flex-wrap gap-2">
          {availableTags.map(tag => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`py-2 px-3.5 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-teal-500 text-black border border-teal-400 shadow-md shadow-teal-500/20 scale-102'
                    : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                <span>{tag}</span>
              </button>
            );
          })}
        </div>

        {/* Добавить свой кастомный вопрос/фактор */}
        <form onSubmit={handleAddCustomTag} className="flex gap-2 pt-2 border-t border-slate-800/80">
          <input
            type="text"
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            placeholder="Добавить свой фактор (напр.: Бассейн, Креатин)..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить</span>
          </button>
        </form>
      </div>

      {/* Шкалы Стресса и Энергии */}
      <div className="glass-card rounded-3xl p-5 space-y-4">
        {/* Уровень энергии */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Уровень энергии сегодня:
            </span>
            <span className="font-mono font-black text-white bg-slate-800 px-2.5 py-0.5 rounded-lg">
              {energyLevel} / 10
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer"
          />
        </div>

        {/* Уровень стресса */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-teal-400" />
              Уровень стресса:
            </span>
            <span className={`font-mono font-black px-2.5 py-0.5 rounded-lg ${
              stressLevel >= 4 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {stressLevel} / 5 • {stressLevel >= 4 ? 'Высокий' : stressLevel >= 3 ? 'Умеренный' : 'Низкий'}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={stressLevel}
            onChange={(e) => setStressLevel(Number(e.target.value))}
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>

        {/* Заметки по дню */}
        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Заметки по самочувствию (опционально)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows="2"
            placeholder="Как ощущения в теле? Была ли крепатура, туман в голове или наоборот прилив сил..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Кнопка сохранения */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:opacity-95 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-teal-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        {savedSuccess ? (
          <span className="flex items-center gap-1.5 text-white">
            <Check className="w-4 h-4 stroke-[3]" />
            Сохранено! AI обновил паттерны
          </span>
        ) : isSaving ? (
          <span>Сохранение...</span>
        ) : (
          <span>Сохранить вечерний чекап</span>
        )}
      </button>
    </div>
  );
}
