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

  // Manage habits state
  const [localHabits, setLocalHabits] = useState(() => {
    if (customHabits && customHabits.length > 0) return customHabits;
    return DEFAULT_HABITS.map(h => ({ ...h, type: 'builtin', is_builtin: true }));
  });

  useEffect(() => {
    if (customHabits && Array.isArray(customHabits) && customHabits.length > 0) {
      setLocalHabits(customHabits);
    }
  }, [customHabits]);

  const [isManageMode, setIsManageMode] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);

  const [selectedTags, setSelectedTags] = useState(() => entry.tags || []);
  const [stressLevel, setStressLevel] = useState(() => entry.stress_level ?? null);
  const [energyLevel, setEnergyLevel] = useState(() => entry.energy_level ?? null);
  const [notes, setNotes] = useState(entry.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('⚡');

  const lastSyncedDateRef = useRef(null);
  const isDirtyRef = useRef(false);

  // Lock body scroll when modals are open
  useEffect(() => {
    if (deleteConfirmTarget || isAddingHabit) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [deleteConfirmTarget, isAddingHabit]);

  useEffect(() => {
    if (entry.date && entry.date !== lastSyncedDateRef.current) {
      lastSyncedDateRef.current = entry.date;
      isDirtyRef.current = false;
      setSelectedTags(entry.tags || []);
      setStressLevel(entry.stress_level ?? null);
      setEnergyLevel(entry.energy_level ?? null);
      setNotes(entry.notes || '');
    }
  }, [entry.date]);

  const normalizeTag = (tag) => (tag || '').trim();

  const isHabitSelected = (habit) => {
    const fullLabel = habit.icon ? `${habit.icon} ${habit.title}` : habit.title;
    return selectedTags.some(t => {
      const norm = normalizeTag(t);
      return norm === fullLabel || norm === habit.title || norm.endsWith(habit.title);
    });
  };

  const toggleHabit = (habit) => {
    if (isManageMode) return;
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
    if (e && e.preventDefault) e.preventDefault();
    if (!newHabitTitle.trim()) return;

    try {
      const res = await api.createJournalHabit({
        title: newHabitTitle.trim(),
        icon: newHabitIcon
      });

      if (res?.habits) {
        setLocalHabits(res.habits);
      } else {
        setLocalHabits(prev => [...prev, {
          id: 'custom_' + Date.now(),
          icon: newHabitIcon,
          title: newHabitTitle.trim(),
          type: 'custom',
          is_builtin: false,
          meta: 'создано пользователем'
        }]);
      }

      setSelectedTags([...selectedTags, `${newHabitIcon} ${newHabitTitle.trim()}`]);
      setNewHabitTitle('');
      setIsAddingHabit(false);
      await onRefresh?.();
    } catch (err) {
      alert('Ошибка добавления привычки: ' + err.message);
    }
  };

  const handleAskDelete = (habit, e) => {
    e.stopPropagation();
    setDeleteConfirmTarget(habit);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const target = deleteConfirmTarget;
    try {
      const updated = localHabits.filter(h => h.id !== target.id);
      setLocalHabits(updated);

      if (target.id && (target.type === 'custom' || !target.is_builtin)) {
        await api.deleteJournalHabit(target.id);
      }

      setDeleteConfirmTarget(null);
      await onRefresh?.();
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
      isDirtyRef.current = false;
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      await onRefresh?.();
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = localHabits.filter(h => isHabitSelected(h)).length;
  const totalCount = localHabits.length;

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
        <div>
          <span>Стресс</span>
          <b>{stressLevel !== null ? `${stressLevel} / 10` : '— / 10'}</b>
        </div>
        <div>
          <span>Энергия</span>
          <b className={energyLevel !== null ? 'accent' : ''}>{energyLevel !== null ? `${energyLevel} / 10` : '— / 10'}</b>
        </div>
        <div>
          <span>Шаги</span>
          <b>{entry.steps ? `${entry.steps.toLocaleString()} ✓` : 'Нет данных'}</b>
        </div>
      </div>

      {/* Section Head with Manage and Add Factor Button */}
      <div className="sectionHead compact">
        <div className="sectionLabel">Сегодняшние факторы</div>
        <button
          type="button"
          className={`ritualManageBtn ${isManageMode ? 'active' : ''}`}
          onClick={() => setIsManageMode(!isManageMode)}
        >
          {isManageMode ? 'Готово' : 'Управлять'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 14px' }}>
        <button
          type="button"
          className="addFactorBtn"
          onClick={() => setIsAddingHabit(true)}
          style={{ margin: 0 }}
        >
          <span className="plus">+</span>Добавить фактор
        </button>
      </div>

      {/* Habit list with single row items */}
      <div className={`ritualList ${isManageMode ? 'manage' : ''}`}>
        {localHabits.map((habit) => {
          const checked = isHabitSelected(habit);
          return (
            <div
              key={habit.id}
              className={`ritual ${checked ? 'done' : ''}`}
              onClick={() => toggleHabit(habit)}
            >
              {/* Column 1: Check indicator */}
              <div className="ritualMark">
                {checked && <Check className="w-4 h-4 text-[#06120b] stroke-[3]" />}
              </div>

              {/* Column 2: Title and Subtitle */}
              <div className="min-w-0 pr-2">
                <div className="ritualName truncate">{habit.title}</div>
                <div className="ritualMeta truncate">{habit.meta || 'привычка'}</div>
              </div>

              {/* Column 3: Delete Action in Manage Mode OR Time in normal mode (SAME ROW) */}
              {isManageMode ? (
                (habit.type === 'custom' || !habit.is_builtin) ? (
                  <button
                    type="button"
                    className="ritualDelete"
                    onClick={(e) => handleAskDelete(habit, e)}
                    aria-label="Удалить привычку"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </button>
                ) : (
                  <span className="text-[9px] text-[#60707b] uppercase font-bold tracking-wider px-1">системный</span>
                )
              ) : (
                habit.time ? <div className="small">{habit.time}</div> : <div />
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Sliders */}
      <div className="sectionHead compact" style={{ marginTop: '22px' }}>
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
            value={stressLevel ?? 5}
            onChange={(e) => {
              isDirtyRef.current = true;
              setStressLevel(Number(e.target.value));
            }}
            onInput={(e) => {
              isDirtyRef.current = true;
              setStressLevel(Number(e.target.value));
            }}
          />
          <div className="sliderLabels">
            <span>Релакс</span>
            <span>Паника</span>
          </div>
        </div>
        <div className="sliderValue mono">{stressLevel !== null ? `${stressLevel}/10` : 'Не указано'}</div>
      </div>

      <div className="sliderBlock">
        <div>
          <label>Энергия</label>
          <input
            className="range"
            type="range"
            min="1"
            max="10"
            value={energyLevel ?? 5}
            onChange={(e) => {
              isDirtyRef.current = true;
              setEnergyLevel(Number(e.target.value));
            }}
            onInput={(e) => {
              isDirtyRef.current = true;
              setEnergyLevel(Number(e.target.value));
            }}
          />
          <div className="sliderLabels">
            <span>Спад</span>
            <span>Заряд</span>
          </div>
        </div>
        <div className="sliderValue mono">{energyLevel !== null ? `${energyLevel}/10` : 'Не указано'}</div>
      </div>

      {/* Notes and Save Day CTA */}
      <div className="section">
        <div className="sectionLabel">Заметка · необязательно</div>
        <textarea
          className="note"
          placeholder="Что сегодня могло повлиять на сон, стресс или тренировку?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          className="saveDay"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Сохранение...' : savedSuccess ? '✓ Зафиксировано!' : 'Зафиксировать день'}
        </button>
      </div>

      {/* Ritual Delete Confirmation Bottom Sheet */}
      {deleteConfirmTarget && (
        <div
          className="modal open"
          onClick={() => setDeleteConfirmTarget(null)}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Удалить фактор?</h2>
              <button type="button" className="close" onClick={() => setDeleteConfirmTarget(null)}>×</button>
            </div>
            <p className="text-xs text-slate-300 my-3 leading-relaxed">
              «{deleteConfirmTarget.title}» исчезнет из списка привычек.
            </p>
            <div className="confirmActions">
              <button type="button" onClick={() => setDeleteConfirmTarget(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="danger"
                onClick={handleConfirmDelete}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Habit Modal */}
      {isAddingHabit && (
        <div className="modal open" onClick={() => setIsAddingHabit(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Новый фактор</h2>
              <button type="button" className="close" onClick={() => setIsAddingHabit(false)}>✕</button>
            </div>
            
            <form onSubmit={handleCreateHabit} className="mt-4 space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Иконка</label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {EMOJI_PICKER.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewHabitIcon(emoji)}
                      className={`p-2 text-xl rounded-lg ${newHabitIcon === emoji ? 'bg-[#7cf0a5]/20 border border-[#7cf0a5]' : 'bg-[#0f1b22]'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Название привычки</label>
                <input
                  type="text"
                  placeholder="Например: Сауна, Креатин, Прогулка..."
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  className="inputLine"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="connect mt-4"
              >
                Добавить в ритуалы
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
