import React, { useState, useEffect, useRef } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { api } from '../services/api.js';

const EMOJI_PICKER = [
  '⚡', '💊', '🧊', '🧖‍♂️', '☕', '🍷', '🚶‍♂️', '🧘‍♂️',
  '🍕', '🕶️', '💧', '🏃', '🏋️', '🥑', '🍏', '☀️', '🌙', '🧠', '🌿', '🏊‍♂️'
];

const DEFAULT_HABITS = [
  { id: 'h1', icon: '💊', title: 'Магний на ночь', meta: 'помечено сегодня', defaultChecked: true, time: '22:10' },
  { id: 'h2', icon: '🧖‍♂️', title: 'Сауна / Баня', meta: '2 раза за 7 дней' },
  { id: 'h3', icon: '🧊', title: 'Холодный душ', meta: '3 раза за 7 дней' },
  { id: 'h4', icon: '☕', title: 'Кофе после 15:00', meta: 'может влиять на сон' },
  { id: 'h5', icon: '🍷', title: 'Алкоголь', meta: 'может влиять на Recovery' },
  { id: 'h6', icon: '🚶‍♂️', title: 'Прогулка 10k шагов', meta: 'цель выполнена', defaultChecked: true, time: '19:40' },
  { id: 'h7', icon: '🧘‍♂️', title: 'Медитация / дыхание', meta: '12 минут', defaultChecked: true, time: '21:15' }
];

export default function DailyJournal({ journalData, onRefresh, onOpenSettings }) {
  const entry = journalData?.entry || {};
  const customHabits = journalData?.habits;
  const habitsList = (customHabits && customHabits.length > 0) ? customHabits : DEFAULT_HABITS;

  const [selectedTags, setSelectedTags] = useState(() => entry.tags || ['Магний на ночь', 'Прогулка 10k шагов', 'Медитация / дыхание']);
  const [stressLevel, setStressLevel] = useState(entry.stress_level ?? 2);
  const [energyLevel, setEnergyLevel] = useState(entry.energy_level ?? 8);
  const [notes, setNotes] = useState(entry.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⚡');

  const lastSyncedDateRef = useRef(null);

  useEffect(() => {
    if (entry.date && entry.date !== lastSyncedDateRef.current) {
      lastSyncedDateRef.current = entry.date;
      setSelectedTags(entry.tags || ['Магний на ночь', 'Прогулка 10k шагов', 'Медитация / дыхание']);
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
      await api.saveJournalEntry({
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

  const selectedCount = habitsList.filter(h => isHabitSelected(h)).length;
  const totalCount = habitsList.length;

  return (
    <div className="screen-shell">
      {/* Header */}
      <header className="header minorHeader">
        <div>
          <div className="headTitle">Ритуалы</div>
          <div className="headSub">Вечерний check-in · ~15 сек</div>
        </div>
        <button type="button" className="iconBtn" onClick={onOpenSettings} aria-label="Настройки">
          <svg viewBox="0 0 24 24">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </button>
      </header>

      {/* Progress lead */}
      <div className="progressLead">
        <div>
          <b className="mono">{selectedCount} / {totalCount}</b>
          <div className="primarySub">факторов отмечено сегодня</div>
        </div>
        <span>15 сек</span>
      </div>

      {/* Summary 3 columns */}
      <div className="ritualSummary mono">
        <div><span>Стресс</span><b>{stressLevel} / 10</b></div>
        <div><span>Энергия</span><b className="accent">{energyLevel} / 10</b></div>
        <div><span>Шаги</span><b>10k ✓</b></div>
      </div>

      {/* Section Head & Add Factor */}
      <div className="sectionHead compact" style={{ marginTop: '16px' }}>
        <div className="sectionLabel">Сегодняшние факторы</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 14px' }}>
        <button
          type="button"
          className="addFactorBtn"
          style={{ margin: 0 }}
          onClick={() => setIsAddingHabit(prev => !prev)}
        >
          <span className="plus">+</span>
          Добавить фактор
        </button>
      </div>

      {/* Add Factor Form */}
      {isAddingHabit && (
        <form
          onSubmit={handleCreateHabit}
          className="bg-[#0c141c] border border-[#2f6545] rounded-xl p-3.5 space-y-3 mb-3 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Новый фактор в чек-лист:</span>
            <button
              type="button"
              onClick={() => setIsAddingHabit(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

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
                      ? 'bg-[#7cf0a5] text-slate-950 font-bold scale-105 shadow-md'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-white'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold">2. Название фактора:</span>
            <div className="flex items-center gap-2 bg-[#05090e] border border-[#253139] rounded-xl px-3 py-1">
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

          <button
            type="submit"
            disabled={!newHabitTitle.trim()}
            className="w-full py-2.5 rounded-xl bg-[#7cf0a5] hover:bg-[#68dd92] disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Сохранить фактор</span>
          </button>
        </form>
      )}

      {/* Ritual List */}
      <div className="ritualList">
        {habitsList.map((habit) => {
          const isSelected = isHabitSelected(habit);
          const habitLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;

          return (
            <div
              key={habit.id || habit.title}
              className={`ritual ${isSelected ? 'done' : ''}`}
              onClick={() => toggleHabit(habit)}
              role="button"
              tabIndex={0}
            >
              <div className="ritualMark">
                {isSelected && '✓'}
              </div>
              <div>
                <div className="ritualName">{habit.title}</div>
                <div className="ritualMeta">
                  {habit.meta || (isSelected ? 'помечено сегодня' : 'может влиять на сон')}
                </div>
              </div>
              {isSelected ? (
                <div className="small mono">{habit.time || '22:10'}</div>
              ) : habit.id && habit.id.length > 5 ? (
                <button
                  type="button"
                  onClick={(e) => handleDeleteHabit(habit.id, habitLabel, e)}
                  className="opacity-40 hover:opacity-100 hover:text-rose-400 p-1"
                  title="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : <div />}
            </div>
          );
        })}
      </div>

      {/* Sliders */}
      <div className="sectionHead compact" style={{ marginTop: '18px' }}>
        <div className="sectionLabel">Самочувствие подробнее</div>
        <span className="contextPill">2 поля</span>
      </div>

      <div className="sliderBlock">
        <div>
          <label>Стресс</label>
          <input
            className="range"
            type="range"
            min="1"
            max="10"
            value={stressLevel}
            onChange={(e) => setStressLevel(Number(e.target.value))}
          />
          <div className="sliderLabels">
            <span>Релакс</span>
            <span>Паника</span>
          </div>
        </div>
        <div className="sliderValue mono">{stressLevel}/10</div>
      </div>

      <div className="sliderBlock">
        <div>
          <label>Энергия</label>
          <input
            className="range"
            type="range"
            min="1"
            max="10"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
          />
          <div className="sliderLabels">
            <span>Спад</span>
            <span>Заряд</span>
          </div>
        </div>
        <div className="sliderValue mono">{energyLevel}/10</div>
      </div>

      {/* Note & Save */}
      <div className="section">
        <div className="sectionLabel">Заметка · необязательно</div>
        <textarea
          className="note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Что сегодня могло повлиять на сон, стресс или тренировку?"
        />
        <button
          type="button"
          className="saveDay"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'СОХРАНЕНИЕ...' : savedSuccess ? 'ДЕНЬ ЗАФИКСИРОВАН ✓' : 'ЗАФИКСИРОВАТЬ ДЕНЬ'}
        </button>
      </div>
    </div>
  );
}
