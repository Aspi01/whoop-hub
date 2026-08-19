import React, { useState, useEffect, useRef } from 'react';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../services/api.js';
import { RitualGlyph } from './BrandGlyphs.jsx';

const EMOJI_PICKER = [
  '⚡', '💊', '🧊', '🧖‍♂️', '☕', '🍷', '🚶‍♂️', '🧘‍♂️',
  '🍕', '🕶️', '💧', '🏃', '🏋️', '🥑', '🍏', '☀️', '🌙', '🧠', '🌿', '🏊‍♂️'
];

export default function DailyJournal({ journalData, onRefresh }) {
  const entry = journalData?.entry || {};
  const habitsList = journalData?.habits || [
    { icon: '💊', title: 'Магний на ночь' },
    { icon: '🧖‍♂️', title: 'Сауна / Баня' },
    { icon: '🥶', title: 'Холодный душ' },
    { icon: '☕', title: 'Кофе после 15:00' },
    { icon: '🍷', title: 'Алкоголь' },
    { icon: '🚶‍♂️', title: 'Прогулка 10k шагов' },
    { icon: '🧘‍♂️', title: 'Медитация / Дыхание' },
    { icon: '🍕', title: 'Поздний плотный ужин' },
    { icon: '🕶️', title: 'Очки Blue-Blockers' },
    { icon: '💧', title: '3+ литра воды' }
  ];

  const [selectedTags, setSelectedTags] = useState(entry.tags || []);
  const [stressLevel, setStressLevel] = useState(entry.stress_level ?? 2);
  const [energyLevel, setEnergyLevel] = useState(entry.energy_level ?? 8);
  const [notes, setNotes] = useState(entry.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Состояние создания новой привычки
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⚡');

  const lastSyncedDateRef = useRef(null);

  useEffect(() => {
    // Only overwrite local form state when the date changes or on first initialization
    if (entry.date && entry.date !== lastSyncedDateRef.current) {
      lastSyncedDateRef.current = entry.date;
      setSelectedTags(entry.tags || []);
      setStressLevel(entry.stress_level ?? 2);
      setEnergyLevel(entry.energy_level ?? 8);
      setNotes(entry.notes || '');
    }
  }, [entry.date, entry.tags, entry.stress_level, entry.energy_level, entry.notes]);

  const normalizeTag = (tag) => (tag || '').trim();

  const isHabitSelected = (habit) => {
    const fullLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;
    return selectedTags.some(t => {
      const norm = normalizeTag(t);
      return norm === fullLabel || norm === habit.title || norm.endsWith(habit.title);
    });
  };

  const toggleHabit = (habit) => {
    const fullLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;
    if (isHabitSelected(habit)) {
      setSelectedTags(selectedTags.filter(t => {
        const norm = normalizeTag(t);
        return norm !== fullLabel && norm !== habit.title && !norm.endsWith(habit.title);
      }));
    } else {
      setSelectedTags([...selectedTags, fullLabel]);
    }
  };

  const handleCreateHabit = async (e) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;

    try {
      await api.createJournalHabit({
        title: newHabitTitle.trim(),
        icon: newHabitIcon
      });
      setSelectedTags([...selectedTags, `${newHabitIcon} ${newHabitTitle.trim()}`]);
      setNewHabitTitle('');
      setIsAddingHabit(false);
      await onRefresh();
    } catch (err) {
      alert('Ошибка добавления привычки: ' + err.message);
    }
  };

  const handleDeleteHabit = async (habitId, habitTitle, e) => {
    e.stopPropagation();
    if (!confirm(`Удалить привычку "${habitTitle}"?`)) return;
    try {
      if (habitId) {
        await api.deleteJournalHabit(habitId);
      }
      setSelectedTags(selectedTags.filter(t => !t.includes(habitTitle)));
      await onRefresh();
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
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
    <div className="space-y-3.5 pb-28">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[15px] bg-cyan-400/[.08] border border-cyan-300/[.1] text-cyan-300 grid place-items-center shrink-0">
            <RitualGlyph className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="eyebrow text-cyan-300/70">Behavior context</span>
            <h1 className="mt-1 text-[22px] leading-none font-extrabold tracking-[-.035em] text-white">Ритуалы дня</h1>
          </div>
        </div>
        <span className="text-[9px] text-slate-500 font-bold px-2.5 py-1.5 rounded-full bg-white/[.025] border border-white/[.045] shrink-0">15 сек</span>
      </div>

      {/* Список ритуалов и привычек */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Привычки и факторы сегодня
          </span>
          <button
            type="button"
            onClick={() => setIsAddingHabit(true)}
            className="flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
        </div>

        {/* Форма добавления нового ритуала (100% Mobile Safe, vertical stack, no horizontal overflow) */}
        {isAddingHabit && (
          <form
            onSubmit={handleCreateHabit}
            className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-3.5 space-y-3 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Новый ритуал в чек-лист:</span>
              <button
                type="button"
                onClick={() => setIsAddingHabit(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Выбор эмодзи */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">1. Выберите иконку:</span>
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {EMOJI_PICKER.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewHabitIcon(emoji)}
                    className={`w-9 h-9 shrink-0 rounded-xl text-base flex items-center justify-center transition-all cursor-pointer ${
                      newHabitIcon === emoji
                        ? 'bg-emerald-500 text-slate-950 font-bold scale-105 shadow-md shadow-emerald-500/30'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Ввод названия */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">2. Название ритуала:</span>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1">
                <span className="text-lg shrink-0">{newHabitIcon}</span>
                <input
                  type="text"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="Например: Креатин 5г, Сауна 20м..."
                  className="w-full bg-transparent py-2 text-xs text-white focus:outline-none placeholder:text-slate-600"
                  autoFocus
                />
              </div>
            </div>

            {/* Кнопка сохранения во всю ширину — исключает переполнение */}
            <button
              type="submit"
              disabled={!newHabitTitle.trim()}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 active:scale-98 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить ритуал</span>
            </button>
          </form>
        )}

        {/* Сетка ритуалов */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {habitsList.map((habit) => {
            const habitLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;
            const isSelected = isHabitSelected(habit);

            return (
              <div
                key={habit.id || habit.title}
                onClick={() => toggleHabit(habit)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                className={`group flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-semibold border transition-all cursor-pointer select-none active:scale-95 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>{habit.icon}</span>
                <span>{habit.title}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />}
                {habit.id && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteHabit(habit.id, habitLabel, e)}
                    className="opacity-40 hover:opacity-100 hover:text-rose-400 ml-1 p-0.5"
                    title="Удалить ритуал"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Шкалы Стресса и Энергии */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Стресс */}
        <div className="glass-card rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Стресс</span>
            <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full ${
              stressLevel <= 3 ? 'bg-emerald-500/15 text-emerald-400' :
              stressLevel <= 6 ? 'bg-amber-500/15 text-amber-400' :
              'bg-rose-500/15 text-rose-400'
            }`}>
              {stressLevel} / 10
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={stressLevel}
            onChange={(e) => setStressLevel(Number(e.target.value))}
            className="w-full accent-rose-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>Релакс (1)</span>
            <span>Паника (10)</span>
          </div>
        </div>

        {/* Энергия */}
        <div className="glass-card rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Энергия</span>
            <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full ${
              energyLevel >= 7 ? 'bg-emerald-500/15 text-emerald-400' :
              energyLevel >= 4 ? 'bg-amber-500/15 text-amber-400' :
              'bg-rose-500/15 text-rose-400'
            }`}>
              {energyLevel} / 10
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
            <span>Спад (1)</span>
            <span>Заряд (10)</span>
          </div>
        </div>
      </div>

      {/* Заметка дня */}
      <div className="glass-card rounded-2xl p-3.5 space-y-2">
        <span className="text-xs font-bold text-slate-300 block">Заметки / самочувствие:</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Как прошел день? Джетлаг, сытный ужин, самочувствие перед сном..."
          rows={3}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none transition-all"
        />
      </div>

      {/* Кнопка сохранения */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3.5 min-h-[48px] rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:opacity-95 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20 transition-all"
      >
        {savedSuccess ? (
          <>
            <Check className="w-4 h-4 text-slate-950" />
            <span>Сохранено в базу данных!</span>
          </>
        ) : isSaving ? (
          <span>Сохранение...</span>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>Зафиксировать день</span>
          </>
        )}
      </button>
    </div>
  );
}
