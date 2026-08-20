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

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const meals = mealsData?.meals || [];
  const totals = mealsData?.totals || { calories: 0, protein: 0, fats: 0, carbs: 0 };
  const stats = mealsData?.stats || {};

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
  const caloriesLeft = Math.max(0, 2250 - totals.calories);

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
          <div className="primaryMetric">{totals.calories} <small>ккал</small></div>
          <div className="primarySub">Из 2 250 на сегодня · темп нормальный</div>
        </div>
        <div className="dataLeadRight">
          <span>Осталось</span>
          <b className="accent">{caloriesLeft}</b>
        </div>
      </div>

      {/* Macros 3 Strip */}
      <div className="macroStrip mono">
        <div className="macro">
          <span>Белок</span>
          <b>{totals.protein} / 150 г</b>
          <div className="bar">
            <i style={{ width: `${Math.min(100, Math.round((totals.protein / 150) * 100))}%` }} />
          </div>
        </div>
        <div className="macro">
          <span>Жиры</span>
          <b>{totals.fats} / 70 г</b>
          <div className="bar">
            <i style={{ width: `${Math.min(100, Math.round((totals.fats / 70) * 100))}%`, background: 'var(--amber)' }} />
          </div>
        </div>
        <div className="macro">
          <span>Углеводы</span>
          <b>{totals.carbs} / 250 г</b>
          <div className="bar">
            <i style={{ width: `${Math.min(100, Math.round((totals.carbs / 250) * 100))}%`, background: 'var(--cyan)' }} />
          </div>
        </div>
      </div>

      {/* Add Meal Box */}
      <div className="capture">
        <div className="captureTop">
          <b>Добавить приём пищи</b>
          <span>Авто-тайминг · {timeFormatted}</span>
        </div>

        {previewImage && (
          <div className="mt-3 relative rounded-xl overflow-hidden border border-[#2f6545] max-h-48 flex items-center justify-center bg-black/40">
            <img src={previewImage} alt="Превью" className="max-h-48 object-cover w-full" />
            <button
              type="button"
              onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5"
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
            {selectedFile ? 'Фото выбрано ✓' : 'Сделать фото'}
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
          <button type="button" className="quick" onClick={() => handleQuickTag('без масла')}>+ Без масла</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('двойной белок')}>+ Двойной белок</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('соус отдельно')}>+ Соус отдельно</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('после тренировки')}>+ После трен</button>
        </div>

        {(selectedFile || userComment.trim()) && (
          <button
            type="button"
            onClick={handleSubmitMeal}
            disabled={isUploading}
            className="w-full mt-3 h-12 rounded-xl bg-[#7cf0a5] hover:bg-[#68dd92] text-[#06120b] font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-[#7cf0a5]/20 flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>AI Vision распознает состав...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Оценить и записать блюдо</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Meals List */}
      <div className="sectionHead compact">
        <div className="sectionLabel">Приёмы пищи · {meals.length}</div>
        <button type="button" className="linkBtn">История ›</button>
      </div>

      {meals.length === 0 ? (
        <div className="empty">
          <UtensilsIcon className="w-8 h-8 mx-auto stroke-current opacity-40" />
          <b>Вы еще не добавляли приемы пищи сегодня.</b>
          <span className="small">Сделайте фото тарелки, чтобы AI оценила калории и макросы.</span>
        </div>
      ) : (
        <div className="mealList">
          {meals.map((meal) => {
            const timeStr = meal.logged_at
              ? new Date(meal.logged_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '12:00';
            const mealTypeMap = {
              breakfast: 'Завтрак',
              lunch: 'Обед',
              dinner: 'Ужин',
              snack: 'Перекус'
            };
            const typeStr = mealTypeMap[meal.meal_type] || meal.meal_type || 'Приём пищи';

            return (
              <div key={meal.id} className="meal">
                <div className="thumb">
                  {meal.meal_type === 'breakfast' ? '🍳' : meal.meal_type === 'lunch' ? '🥗' : meal.meal_type === 'dinner' ? '🍗' : '○'}
                </div>
                <div>
                  <small>{timeStr} · {typeStr}</small>
                  <strong>{meal.name || meal.description || 'Блюдо'}</strong>
                  <div className="mealMeta">
                    Б {meal.protein || 0} · Ж {meal.fats || 0} · У {meal.carbs || 0}
                  </div>

                  {/* AI уточнение, если есть */}
                  {meal.clarification_question && (
                    <div className="mt-2 p-2 rounded-lg bg-[#111b24] border border-amber-500/30 text-xs">
                      <div className="text-amber-300 flex items-center gap-1 font-bold text-[10px]">
                        <MessageSquare className="w-3 h-3" />
                        <span>Вопрос AI:</span>
                      </div>
                      <div className="text-slate-300 mt-1 text-[11px]">{meal.clarification_question}</div>
                      <div className="mt-2 flex gap-1">
                        <input
                          type="text"
                          value={replyTextMap[meal.id] || ''}
                          onChange={(e) => setReplyTextMap({ ...replyTextMap, [meal.id]: e.target.value })}
                          placeholder="Ответ (напр.: жарил на масле)..."
                          className="w-full bg-[#05090e] border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                          onKeyDown={(e) => e.key === 'Enter' && handleSendClarification(meal.id)}
                        />
                        <button
                          type="button"
                          onClick={() => handleSendClarification(meal.id)}
                          disabled={isReplying}
                          className="px-2.5 py-1 bg-[#7cf0a5] text-slate-950 font-bold rounded-lg text-xs"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="mealKcal">
                    <b>{meal.calories || 0}</b>
                    <span>ккал</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMeal(meal.id)}
                    className="opacity-30 hover:opacity-100 hover:text-rose-400 p-1"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно "Не еда" */}
      {notFoodModal.isOpen && (
        <div className="modal open" onClick={() => setNotFoodModal({ isOpen: false, message: '' })}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHead">
              <h2>Объект не распознан</h2>
              <button className="close" onClick={() => setNotFoodModal({ isOpen: false, message: '' })}>×</button>
            </div>
            <div className="mt-3 text-sm text-slate-300 leading-relaxed">
              {notFoodModal.message || 'На фото не обнаружена еда. Пожалуйста, сделайте четкое фото блюда или тарелки.'}
            </div>
            <button
              className="connect mt-5"
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

function UtensilsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 2v14a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <line x1="6" y1="2" x2="6" y2="22" />
    </svg>
  );
}
