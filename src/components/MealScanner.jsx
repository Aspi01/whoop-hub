import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Clock, Sparkles, MessageSquare, Check, Trash2, Flame, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api.js';

export default function MealScanner({ mealsData, onRefresh, onOpenSettings }) {
  const [isUploading, setIsUploading] = useState(false);
  const [userComment, setUserComment] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('auto');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isReplying, setIsReplying] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [notFoodModal, setNotFoodModal] = useState({ isOpen: false, message: '' });

  // Calorie & Protein Goal Modal
  const [isGoalSheetOpen, setIsGoalSheetOpen] = useState(false);
  const [calorieGoal, setCalorieGoal] = useState(() => {
    try {
      return Number(localStorage.getItem('whoop_calorie_goal')) || 2250;
    } catch (e) {
      return 2250;
    }
  });
  const [proteinGoal, setProteinGoal] = useState(() => {
    try {
      return Number(localStorage.getItem('whoop_protein_goal')) || 150;
    } catch (e) {
      return 150;
    }
  });
  const [tempKcalGoal, setTempKcalGoal] = useState(String(calorieGoal));
  const [tempProteinGoal, setTempProteinGoal] = useState(String(proteinGoal));

  useEffect(() => {
    if (isGoalSheetOpen || notFoodModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isGoalSheetOpen, notFoodModal.isOpen]);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const meals = mealsData?.meals || [];
  const totals = mealsData?.totals || { calories: 0, protein: 0, fats: 0, carbs: 0 };
  const stats = mealsData?.stats || {};

  const handleSaveGoal = () => {
    const cleanKcal = parseInt(tempKcalGoal.replace(/\D/g, ''), 10) || 2250;
    const cleanProtein = parseInt(tempProteinGoal.replace(/\D/g, ''), 10) || 150;
    setCalorieGoal(cleanKcal);
    setProteinGoal(cleanProtein);
    localStorage.setItem('whoop_calorie_goal', String(cleanKcal));
    localStorage.setItem('whoop_protein_goal', String(cleanProtein));
    window.dispatchEvent(new Event('whoop_goal_updated'));
    setIsGoalSheetOpen(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleQuickTag = (tag) => {
    setUserComment((prev) => (prev ? `${prev}, ${tag}` : tag));
  };

  const handleSubmitMeal = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedFile && !userComment.trim()) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      if (selectedFile) formData.append('image', selectedFile);
      if (userComment.trim()) formData.append('comment', userComment.trim());
      if (selectedMealType !== 'auto') formData.append('meal_type', selectedMealType);

      await api.uploadMeal(formData);
      
      setSelectedFile(null);
      setPreviewImage(null);
      setUserComment('');
      setSelectedMealType('auto');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';

      await onRefresh();
    } catch (err) {
      if (err.message && (err.message.includes('не обнаружена') || err.message.includes('Не еда') || err.message.includes('не похоже'))) {
        setNotFoodModal({
          isOpen: true,
          message: err.message
        });
      } else {
        alert('Ошибка добавления блюда: ' + err.message);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendClarification = async (mealId) => {
    const reply = replyTextMap[mealId];
    if (!reply || !reply.trim()) return;

    try {
      setIsReplying(true);
      await api.replyMealClarification(mealId, reply.trim());
      setReplyTextMap(prev => ({ ...prev, [mealId]: '' }));
      await onRefresh();
    } catch (err) {
      alert('Ошибка обновления блюда: ' + err.message);
    } finally {
      setIsReplying(false);
    }
  };

  const handleDeleteMeal = async (id) => {
    if (confirm('Удалить этот прием пищи?')) {
      await api.deleteMeal(id);
      await onRefresh();
    }
  };

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const timeFormatted = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const caloriesLeft = Math.max(0, calorieGoal - totals.calories);

  const proteinPercent = Math.min(100, Math.round((totals.protein / proteinGoal) * 100)) || 0;
  const fatGoal = 70;
  const fatPercent = Math.min(100, Math.round((totals.fats / fatGoal) * 100)) || 0;
  const carbGoal = 250;
  const carbPercent = Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) || 0;

  return (
    <div className="screen-shell">
      {/* Скрытые инпуты для камеры и галереи */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <header className="header minorHeader">
        <div>
          <div className="headTitle">Питание</div>
          <div className="headSub">Сегодня · {dateFormatted}</div>
        </div>
        <button type="button" className="iconBtn" onClick={onOpenSettings} aria-label="Настройки">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.6V21h-4v-.1a1.8 1.8 0 0 0-1.1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 13.9H3v-4h.1a1.8 1.8 0 0 0 1.6-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10.1 3H10V3h4v.1a1.8 1.8 0 0 0 1.1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1.1h.1v4h-.1A1.8 1.8 0 0 0 19.4 15z"/>
          </svg>
        </button>
      </header>

      {/* Hero Calories Lead */}
      <div className="dataLead mono">
        <div>
          <div className="primaryMetric">{totals.calories.toLocaleString('ru-RU')} <small>ккал</small></div>
          <div className="primarySub">Из {calorieGoal.toLocaleString('ru-RU')} на сегодня · темп нормальный</div>
        </div>
        <div className="dataLeadRight">
          <span>Осталось</span>
          <b className="accent">{caloriesLeft.toLocaleString('ru-RU')}</b>
          <button
            type="button"
            className="goalAction"
            onClick={() => {
              setTempKcalGoal(String(calorieGoal));
              setTempProteinGoal(String(proteinGoal));
              setIsGoalSheetOpen(true);
            }}
            style={{ marginTop: '9px' }}
          >
            <span>Цель</span>
            <b id="goalValue">{calorieGoal.toLocaleString('ru-RU')}</b>
            <span>›</span>
          </button>
        </div>
      </div>

      {/* Single Clean Macros 3-Strip (NO DUPLICATES) */}
      <div className="macroStrip mono">
        <div className="macro">
          <span>Белок</span>
          <b>{totals.protein} / {proteinGoal} г</b>
          <div className="bar">
            <i style={{ width: `${proteinPercent}%` }} />
          </div>
        </div>
        <div className="macro">
          <span>Жиры</span>
          <b>{totals.fats} / {fatGoal} г</b>
          <div className="bar">
            <i style={{ width: `${fatPercent}%`, background: 'var(--amber)' }} />
          </div>
        </div>
        <div className="macro">
          <span>Углеводы</span>
          <b>{totals.carbs} / {carbGoal} г</b>
          <div className="bar">
            <i style={{ width: `${carbPercent}%`, background: 'var(--cyan)' }} />
          </div>
        </div>
      </div>

      {/* Food Capture Section */}
      <div className="capture">
        <div className="captureTop">
          <b>Добавить приём пищи</b>
          <span>Авто-тайминг · {timeFormatted}</span>
        </div>

        {previewImage && (
          <div className="relative mt-3 rounded-xl overflow-hidden border border-[#233139] max-h-48 bg-[#091118] flex items-center justify-center">
            <img src={previewImage} alt="Превью" className="max-h-48 w-full object-cover" />
            <button
              type="button"
              onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        <div className="dual">
          <button
            type="button"
            className="primaryBtn"
            onClick={() => cameraInputRef.current?.click()}
          >
            Сделать фото
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => galleryInputRef.current?.click()}
          >
            Из галереи
          </button>
        </div>

        <input
          className="inputLine"
          placeholder="Комментарий: рис 200 г, без масла…"
          value={userComment}
          onChange={(e) => setUserComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmitMeal(e)}
        />

        <div className="quickRow">
          <button type="button" className="quick" onClick={() => handleQuickTag('Без масла')}>+ Без масла</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('Двойной белок')}>+ Двойной белок</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('Соус отдельно')}>+ Соус отдельно</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('После тренировки')}>+ После трен</button>
        </div>

        {(selectedFile || userComment.trim()) && (
          <button
            type="button"
            className="saveDay mt-3"
            onClick={handleSubmitMeal}
            disabled={isUploading}
          >
            {isUploading ? 'Распознавание блюда AI...' : 'Зафиксировать приём пищи'}
          </button>
        )}
      </div>

      {/* Meals History List */}
      <div className="sectionHead compact">
        <div className="sectionLabel">Приёмы пищи · {meals.length}</div>
        <span className="contextPill">Сегодня</span>
      </div>

      <div className="mealList">
        {meals.length === 0 ? (
          <div className="empty">
            <div>○</div>
            <b>Пока нет записей</b>
            <p className="text-[10px] text-slate-500 mt-1">Сделайте фото или введите блюдо вручную</p>
          </div>
        ) : (
          meals.map((meal) => (
            <div key={meal.id} className="meal">
              <div className="thumb">
                {meal.image_url ? (
                  <img src={meal.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  '○'
                )}
              </div>
              <div>
                <small>
                  {meal.created_at ? new Date(meal.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '12:00'} · {meal.meal_type || 'Приём пищи'}
                </small>
                <strong>{meal.name || meal.description || 'Блюдо'}</strong>
                <div className="mealMeta">
                  Б {meal.protein || 0} · Ж {meal.fats || 0} · У {meal.carbs || 0}
                </div>

                {/* Clarification prompt if AI asked a question */}
                {meal.clarification_question && (
                  <div className="mt-2 p-2 bg-[#121c22] rounded-lg border border-[#2a3a44] text-[10px]">
                    <div className="text-[#f1c463] mb-1 font-semibold">❓ {meal.clarification_question}</div>
                    <div className="flex gap-1.5 mt-1">
                      <input
                        type="text"
                        placeholder="Ответить..."
                        value={replyTextMap[meal.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [meal.id]: e.target.value })}
                        className="flex-1 bg-[#091118] border border-[#24333c] text-white px-2 py-1 rounded text-[10px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendClarification(meal.id)}
                        disabled={isReplying}
                        className="bg-[#7cf0a5] text-[#06120b] font-bold px-2 py-1 rounded text-[10px]"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mealKcal flex flex-col items-end">
                <b>{meal.calories || 0}</b>
                <span>ккал</span>
                <button
                  type="button"
                  onClick={() => handleDeleteMeal(meal.id)}
                  className="text-slate-600 hover:text-rose-400 mt-2 p-1"
                  title="Удалить"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Calorie & Protein Goal Modal */}
      {isGoalSheetOpen && (
        <div className="modal open" onClick={() => setIsGoalSheetOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Цель по калориям</h2>
              <button type="button" className="close" onClick={() => setIsGoalSheetOpen(false)}>×</button>
            </div>
            <div className="goalSheetRow">
              <span>Дневная цель (ккал)</span>
              <input
                value={tempKcalGoal}
                onChange={(e) => setTempKcalGoal(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="goalSheetRow">
              <span>Белок (г)</span>
              <input
                value={tempProteinGoal}
                onChange={(e) => setTempProteinGoal(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="small" style={{ marginTop: '12px', lineHeight: '1.45' }}>
              Это базовая цель. На Today она показывается как контекст дня, а в Food — как рабочая цель питания.
            </div>
            <button type="button" className="connect" onClick={handleSaveGoal}>
              Сохранить цели
            </button>
          </div>
        </div>
      )}

      {/* Not Food Alert Modal */}
      {notFoodModal.isOpen && (
        <div className="modal open" onClick={() => setNotFoodModal({ isOpen: false, message: '' })}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Не еда</h2>
              <button type="button" className="close" onClick={() => setNotFoodModal({ isOpen: false, message: '' })}>×</button>
            </div>
            <p className="text-xs text-slate-300 my-4 leading-relaxed">
              {notFoodModal.message || 'На фото не обнаружена еда. Пожалуйста, сфотографируйте ваше блюдо.'}
            </p>
            <button
              type="button"
              className="connect"
              onClick={() => setNotFoodModal({ isOpen: false, message: '' })}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
