import React, { useState, useRef } from 'react';
import { Camera, Plus, Clock, Sparkles, MessageSquare, Check, Trash2, ArrowRight, Flame } from 'lucide-react';
import { api } from '../services/api.js';

export default function MealScanner({ mealsData, onRefresh }) {
  const [isUploading, setIsUploading] = useState(false);
  const [userComment, setUserComment] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('auto');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Состояния для интерактивного диалога уточнений
  const [replyTextMap, setReplyTextMap] = useState({});
  const [isReplying, setIsReplying] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const meals = mealsData?.meals || [];
  const totals = mealsData?.totals || { calories: 0, protein: 0, fats: 0, carbs: 0 };
  const stats = mealsData?.stats || {};

  // Состояние для красивого попапа "Не еда"
  const [notFoodModal, setNotFoodModal] = useState({ isOpen: false, message: '' });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitMeal = async (e) => {
    e.preventDefault();
    if (!selectedFile && !userComment.trim()) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      if (selectedFile) formData.append('image', selectedFile);
      if (userComment.trim()) formData.append('comment', userComment.trim());
      if (selectedMealType !== 'auto') formData.append('meal_type', selectedMealType);

      await api.uploadMeal(formData);
      
      // Сброс формы при успехе
      setSelectedFile(null);
      setPreviewImage(null);
      setUserComment('');
      setSelectedMealType('auto');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';

      await onRefresh();
    } catch (err) {
      // Показываем красивый модальный попап, если на фото не еда
      setNotFoodModal({
        isOpen: true,
        message: err.message || 'На фото не обнаружена еда. Пожалуйста, сфотографируйте вашу тарелку или напиток!'
      });
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

  return (
    <div className="space-y-4 pb-24">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
            AI Vision Нутрициолог
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Счетчик калорий
          </h1>
        </div>
      </div>

      {/* Карточка суммарных макросов за день */}
      <div className="glass-card rounded-3xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Сегодня потреблено
            </span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-white font-mono">{totals.calories}</span>
            <span className="text-xs text-slate-400 ml-1">ккал</span>
          </div>
        </div>

        {/* Сетка БЖУ */}
        <div className="grid grid-cols-3 gap-2.5 mt-3 text-center">
          <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-rose-400">Белки</span>
            <div className="text-lg font-black text-white font-mono mt-0.5">{totals.protein}г</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-amber-400">Жиры</span>
            <div className="text-lg font-black text-white font-mono mt-0.5">{totals.fats}г</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800/70 rounded-2xl p-2.5">
            <span className="text-[10px] uppercase font-bold text-cyan-400">Углеводы</span>
            <div className="text-lg font-black text-white font-mono mt-0.5">{totals.carbs}г</div>
          </div>
        </div>

        {/* Биохакинг тайминги: Окно питания и последний ужин */}
        {stats.lastMealTime && (
          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Посл. прием пищи: <strong className="text-slate-200">{stats.lastMealTime}</strong>
            </span>
            <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              Окно сна защищено
            </span>
          </div>
        )}
      </div>

      {/* Форма добавления еды (Фото / Описание) */}
      <form onSubmit={handleSubmitMeal} className="glass-card rounded-3xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Добавить прием пищи
          </span>
          <span className="text-[11px] text-slate-400">
            {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Авто-тайминг
          </span>
        </div>

        {/* Превью фото еды */}
        {previewImage && (
          <div className="relative rounded-2xl overflow-hidden max-h-48 border border-slate-700">
            <img src={previewImage} alt="Превью еды" className="w-full h-48 object-cover" />
            <button
              type="button"
              onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 text-xs hover:bg-black"
            >
              ✕
            </button>
          </div>
        )}

        {/* Кнопка съемки / загрузки */}
        <div className="grid grid-cols-2 gap-2">
          {/* Скрытый инпут для Камеры */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="hidden"
            id="meal-camera-input"
          />
          <button
            type="button"
            onClick={() => {
              if (cameraInputRef.current) {
                cameraInputRef.current.value = '';
                cameraInputRef.current.click();
              }
            }}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs cursor-pointer hover:opacity-95 active:scale-98 transition-all shadow-lg shadow-emerald-950/50"
          >
            <Camera className="w-4 h-4" />
            <span>Сделать фото</span>
          </button>

          {/* Скрытый инпут для Галереи (БЕЗ capture) */}
          <input
            type="file"
            accept="image/*"
            ref={galleryInputRef}
            onChange={handleFileChange}
            className="hidden"
            id="meal-gallery-input"
          />
          <button
            type="button"
            onClick={() => {
              if (galleryInputRef.current) {
                galleryInputRef.current.value = '';
                galleryInputRef.current.click();
              }
            }}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs cursor-pointer active:scale-98 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Из галереи</span>
          </button>
        </div>

        {/* Текстовое описание / комментарий */}
        <div className="space-y-1.5">
          <input
            type="text"
            value={userComment}
            onChange={(e) => setUserComment(e.target.value)}
            placeholder="Комментарий (напр.: рис 200г, говядина без масла)..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <div className="flex gap-1.5 overflow-x-auto py-1 text-[10px] text-slate-400">
            <span className="shrink-0 text-slate-500 font-medium">Быстрые теги:</span>
            {['Без масла', 'Двойной белок', 'Сливочный соус', 'После тренировки'].map(tag => (
              <button
                type="button"
                key={tag}
                onClick={() => setUserComment(prev => prev ? `${prev}, ${tag}` : tag)}
                className="shrink-0 bg-slate-800/80 hover:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-700/60 transition-all"
              >
                +{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Кнопка отправки на анализ */}
        {(selectedFile || userComment.trim()) && (
          <button
            type="submit"
            disabled={isUploading}
            className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                AI анализирует фото...
              </span>
            ) : (
              <span>Оценить КБЖУ и сохранить</span>
            )}
          </button>
        )}
      </form>

      {/* Список приемов пищи за день */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Приемы пищи за сегодня ({meals.length})
        </h2>

        {meals.length === 0 ? (
          <div className="glass-card rounded-3xl p-6 text-center text-slate-400 space-y-2">
            <UtensilsIcon className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-xs">Вы еще не добавляли приемы пищи сегодня.</p>
            <p className="text-[11px] text-slate-500">Сделайте фото тарелки, чтобы AI оценила калории и время приема.</p>
          </div>
        ) : (
          meals.map((meal) => {
            const isNeedClarification = meal.status === 'needs_clarification';

            return (
              <div
                key={meal.id}
                className={`glass-card rounded-3xl p-4 space-y-3 transition-all ${
                  isNeedClarification ? 'border-amber-500/50 bg-amber-950/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {meal.image_url ? (
                    <img
                      src={meal.image_url}
                      alt={meal.title}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                      <Flame className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {meal.meal_type} • {meal.time_str}
                      </span>
                      {meal.glycemic_index && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          ГИ: {meal.glycemic_index}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white mt-1 truncate">
                      {meal.title}
                    </h3>
                    <div className="text-xs text-slate-300 font-mono mt-0.5">
                      <strong className="text-emerald-400">{meal.calories} ккал</strong>
                      <span className="text-slate-500 mx-1.5">|</span>
                      <span>Б: {meal.protein}г</span>
                      <span className="text-slate-500 mx-1">·</span>
                      <span>Ж: {meal.fats}г</span>
                      <span className="text-slate-500 mx-1">·</span>
                      <span>У: {meal.carbs}г</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteMeal(meal.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* AI Биохакинг заметка */}
                {meal.ai_notes && (
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-2.5 text-[11px] text-slate-300 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{meal.ai_notes}</span>
                  </div>
                )}

                {/* Блок уточнения от AI (Clarification Dialogue) */}
                {isNeedClarification && meal.clarification_question && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-3 space-y-2.5">
                    <div className="flex items-start gap-2 text-xs text-amber-200">
                      <MessageSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-amber-400 font-bold">Уточнение от AI:</strong>
                        {meal.clarification_question}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ (напр.: соус томатный, без сыра)..."
                        value={replyTextMap[meal.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [meal.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendClarification(meal.id)}
                        className="flex-1 bg-slate-900/90 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => handleSendClarification(meal.id)}
                        disabled={isReplying}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Ок</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 🚫 Красивый Модальный Попап "Не еда" */}
      {notFoodModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl shadow-black">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <span className="text-3xl">🚫</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black text-white">Это не похоже на еду</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {notFoodModal.message}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setNotFoodModal({ isOpen: false, message: '' })}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-95 cursor-pointer transition-all border border-slate-700"
              >
                Понятно
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotFoodModal({ isOpen: false, message: '' });
                  if (cameraInputRef.current) {
                    cameraInputRef.current.value = '';
                    cameraInputRef.current.click();
                  }
                }}
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 active:scale-95 cursor-pointer transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>Новое фото</span>
              </button>
            </div>
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
