import React, { useState, useEffect } from 'react';
import { BookOpen, Check, Plus, Sparkles, Smile, BatteryCharging, Zap, Trash2, X } from 'lucide-react';
import { api } from '../services/api.js';

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
  const [stressLevel, setStressLevel] = useState(entry.stress_level || 2);
  const [energyLevel, setEnergyLevel] = useState(entry.energy_level || 8);
  const [notes, setNotes] = useState(entry.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Состояние создания новой привычки
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⚡');

  useEffect(() => {
    if (entry.tags) setSelectedTags(entry.tags);
    if (entry.stress_level !== undefined) setStressLevel(entry.stress_level);
    if (entry.energy_level !== undefined) setEnergyLevel(entry.energy_level);
    if (entry.notes !== undefined) setNotes(entry.notes);
  }, [journalData]);

  const toggleHabit = (habitTitle) => {
    if (selectedTags.includes(habitTitle)) {
      setSelectedTags(selectedTags.filter(t => t !== habitTitle));
    } else {
      setSelectedTags([...selectedTags, habitTitle]);
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
      setSelectedTags(selectedTags.filter(t => t !== habitTitle));
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
    <div className="space-y-4 pb-24">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-teal-400 font-bold">
            Вечерний биохак-чекап
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Дневник ритуалов
          </h1>
        </div>
        <span className="text-[11px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
          15 секунд в день
        </span>
      </div>

      {/* Список ритуалов и привычек */}
      <div className="glass-card rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
            Ваши привычки и факторы сегодня:
          </span>
          <button
            onClick={() => setIsAddingHabit(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Новый ритуал</span>
          </button>
        </div>

        {/* Форма добавления нового ритуала с выбором иконки */}
        {isAddingHabit && (
          <form onSubmit={handleCreateHabit} className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Создать персональный ритуал:</span>
              <button
                type="button"
                onClick={() => setIsAddingHabit(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Выбор эмодзи (компактный горизонтальный скролл) */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Иконка:</span>
              <div className="flex gap-1.5 overflow-x-auto pb-1 py-0.5">
                {EMOJI_PICKER.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewHabitIcon(emoji)}
                    className={`w-8 h-8 shrink-0 rounded-xl text-sm flex items-center justify-center transition-all cursor-pointer ${
                      newHabitIcon === emoji
                        ? 'bg-emerald-500 text-black scale-110 shadow-md font-bold'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-white'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Ввод названия */}
            <div className="flex gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                {newHabitIcon}
              </div>
              <input
                type="text"
                value={newHabitTitle}
                onChange={(e) => setNewHabitTitle(e.target.value)}
                placeholder="Название (например, Креатин 5г, Очки BlueBlocker)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                autoFocus
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </form>
        )}

        {/* Сетка ритуалов */}
        <div className="flex flex-wrap gap-2 pt-1">
          {habitsList.map((habit) => {
            const habitLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;
            const isSelected = selectedTags.includes(habitLabel) || selectedTags.includes(habit.title);

            return (
              <div
                key={habit.id || habit.title}
                onClick={() => toggleHabit(habitLabel)}
                className={`group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>{habit.icon}</span>
                <span>{habit.title}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />}
                {habit.id && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteHabit(habit.id, habitLabel, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 ml-1 p-0.5"
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
      <div className="grid grid-cols-2 gap-3">
        {/* Стресс */}
        <div className="glass-card rounded-3xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Уровень стресса</span>
            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
              stressLevel <= 3 ? 'bg-emerald-500/20 text-emerald-300' :
              stressLevel <= 6 ? 'bg-amber-500/20 text-amber-300' :
              'bg-rose-500/20 text-rose-300'
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
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Релакс (1)</span>
            <span>Паника (10)</span>
          </div>
        </div>

        {/* Энергия */}
        <div className="glass-card rounded-3xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Субъективная энергия</span>
            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
              energyLevel >= 7 ? 'bg-emerald-500/20 text-emerald-300' :
              energyLevel >= 4 ? 'bg-amber-500/20 text-amber-300' :
              'bg-rose-500/20 text-rose-300'
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
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Истощен (1)</span>
            <span>Заряжен (10)</span>
          </div>
        </div>
      </div>

      {/* Заметка дня */}
      <div className="glass-card rounded-3xl p-4 space-y-2">
        <span className="text-xs font-bold text-slate-300 block">Заметки / самочувствие:</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Как прошел день? Был ли джетлаг, тяжесть после еды, особое настроение..."
          rows={3}
          className="w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 text-xs text-white focus:outline-none focus:border-teal-500 resize-none"
        />
      </div>

      {/* Кнопка сохранения */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:opacity-95 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20 transition-all"
      >
        {savedSuccess ? (
          <>
            <Check className="w-4 h-4 text-black" />
            <span>Сохранено в базу данных!</span>
          </>
        ) : isSaving ? (
          <span>Сохранение...</span>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-black" />
            <span>Зафиксировать день</span>
          </>
        )}
      </button>
    </div>
  );
}
