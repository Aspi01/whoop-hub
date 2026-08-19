import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Clock, Sparkles, MessageSquare, Check, Trash2, Flame, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api.js';
import { FuelGlyph } from './BrandGlyphs.jsx';

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

  // Состояние для попапа "Не еда"
  const [notFoodModal, setNotFoodModal] = useState({ isOpen: false, message: '' });

  // 🚀 Высокоточное сжатие изображения (768px — нативное разрешение тайла Gemini Vision для максимальной точности текстур и быстрой передачи)
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 768;
          let width = img.width;
          let height = img.height;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name || 'meal.jpg', {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                resolve({
                  file: compressedFile,
                  preview: canvas.toDataURL('image/jpeg', 0.72)
                });
              } else {
                resolve({ file, preview: event.target.result });
              }
            },
            'image/jpeg',
            0.72
          );
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const { file: compressedFile, preview } = await compressImage(file);
      setSelectedFile(compressedFile);
      setPreviewImage(preview);
    }
  };

  const [uploadSeconds, setUploadSeconds] = useState(0);

  useEffect(() => {
    let interval = null;
    if (isUploading) {
      setUploadSeconds(0);
      interval = setInterval(() => {
        setUploadSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isUploading]);

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

  return (
    <div className="space-y-3.5 pb-28">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[15px] bg-amber-400/[.09] border border-amber-300/[.12] text-amber-300 grid place-items-center shrink-0">
            <FuelGlyph className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="eyebrow text-amber-300/75">Nutrition intelligence</span>
            <h1 className="mt-1 text-[22px] leading-none font-extrabold tracking-[-.035em] text-white">Питание сегодня</h1>
          </div>
        </div>
      </div>

      {/* Карточка суммарных макросов за день */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Сегодня потреблено
            </span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-white font-mono">{totals.calories}</span>
            <span className="text-xs text-slate-400 ml-1 font-medium">ккал</span>
          </div>
        </div>

        {/* Сетка БЖУ */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-rose-400">Белки</span>
            <div className="text-base font-black text-white font-mono mt-0.5">{totals.protein}г</div>
          </div>
          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-amber-400">Жиры</span>
            <div className="text-base font-black text-white font-mono mt-0.5">{totals.fats}г</div>
          </div>
          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2">
            <span className="text-[10px] uppercase font-bold text-cyan-400">Углеводы</span>
            <div className="text-base font-black text-white font-mono mt-0.5">{totals.carbs}г</div>
          </div>
        </div>

        {/* Тайминги приема пищи */}
        {stats.lastMealTime && (
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Посл. прием: <strong className="text-slate-200 font-mono">{stats.lastMealTime}</strong>
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              Окно сна защищено
            </span>
          </div>
        )}
      </div>

      {/* Форма добавления еды (Фото / Описание) */}
      <form onSubmit={handleSubmitMeal} className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Добавить прием пищи
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Авто-тайминг
          </span>
        </div>

        {/* Превью фото еды */}
        {previewImage && (
          <div className="relative rounded-xl overflow-hidden max-h-44 border border-slate-700">
            <img src={previewImage} alt="Превью еды" className="w-full h-44 object-cover" />
            <button
              type="button"
              onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
              className="absolute top-2 right-2 bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Кнопки съемки / загрузки */}
        <div className="grid grid-cols-2 gap-2">
          {/* Инпут Камеры */}
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
            className="flex items-center justify-center gap-2 py-3 px-3 min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs cursor-pointer hover:opacity-95 active:scale-98 transition-all shadow-md shadow-emerald-950/50"
          >
            <Camera className="w-4 h-4" />
            <span>Сделать фото</span>
          </button>

          {/* Инпут Галереи */}
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
            className="flex items-center justify-center gap-2 py-3 px-3 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs cursor-pointer active:scale-98 transition-all"
          >
            <ImageIcon className="w-4 h-4" />
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
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <div className="flex gap-1.5 overflow-x-auto py-0.5 text-[10px] text-slate-400 no-scrollbar">
            <span className="shrink-0 text-slate-500 font-medium py-0.5">Теги:</span>
            {['Без масла', 'Двойной белок', 'Сливочный соус', 'После тренировки'].map(tag => (
              <button
                type="button"
                key={tag}
                onClick={() => setUserComment(prev => prev ? `${prev}, ${tag}` : tag)}
                className="shrink-0 bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-lg border border-slate-800 text-slate-300 active:scale-95 transition-all"
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
            className="w-full py-3 min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin text-slate-950" />
                AI анализирует фото... ({uploadSeconds}с)
              </span>
            ) : (
              <span>Оценить КБЖУ и сохранить</span>
            )}
          </button>
        )}
      </form>

      {/* Список приемов пищи за день */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Приемы пищи за сегодня ({meals.length})
        </h2>

        {meals.length === 0 ? (
          <div className="glass-card rounded-2xl p-5 text-center text-slate-400 space-y-2">
            <FuelGlyph className="w-7 h-7 mx-auto text-slate-600" />
            <p className="text-xs font-medium">Вы еще не добавляли приемы пищи сегодня.</p>
            <p className="text-[11px] text-slate-500">Сделайте фото тарелки, чтобы AI оценила калории и время приема.</p>
          </div>
        ) : (
          meals.map((meal) => {
            const isNeedClarification = meal.status === 'needs_clarification';

            return (
              <div
                key={meal.id}
                className={`glass-card rounded-2xl p-3.5 space-y-2.5 transition-all ${
                  isNeedClarification ? 'border-amber-500/50 bg-amber-950/15' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {meal.image_url ? (
                    <img
                      src={meal.image_url}
                      alt={meal.title}
                      className="w-13 h-13 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-13 h-13 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                      <Flame className="w-5 h-5" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
                        {meal.meal_type} • {meal.time_str}
                      </span>
                      {meal.glycemic_index && (
                        <span className="text-[9px] font-semibold text-slate-400">
                          ГИ: {meal.glycemic_index}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-white mt-1 truncate">
                      {meal.title}
                    </h3>
                    <div className="text-[11px] text-slate-300 font-mono mt-0.5 flex items-center gap-1 flex-wrap">
                      <strong className="text-emerald-400 font-bold">{meal.calories} ккал</strong>
                      <span className="text-slate-600">|</span>
                      <span>Б: {meal.protein}г</span>
                      <span className="text-slate-600">·</span>
                      <span>Ж: {meal.fats}г</span>
                      <span className="text-slate-600">·</span>
                      <span>У: {meal.carbs}г</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteMeal(meal.id)}
                    aria-label="Удалить прием пищи"
                    className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* AI Биохакинг заметка */}
                {meal.ai_notes && (
                  <div className="bg-slate-900/70 border border-white/5 rounded-xl p-2 text-[11px] text-slate-300 flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{meal.ai_notes}</span>
                  </div>
                )}

                {/* Блок уточнения от AI */}
                {isNeedClarification && meal.clarification_question && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-start gap-1.5 text-xs text-amber-200">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-amber-400 font-bold text-[11px]">Уточнение от AI:</strong>
                        <span className="text-[11px]">{meal.clarification_question}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ (напр.: соус томатный, без сыра)..."
                        value={replyTextMap[meal.id] || ''}
                        onChange={(e) => setReplyTextMap({ ...replyTextMap, [meal.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendClarification(meal.id)}
                        className="flex-1 bg-slate-950 border border-amber-500/30 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => handleSendClarification(meal.id)}
                        disabled={isReplying}
                        className="px-3 py-1.5 min-h-[36px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all active:scale-95"
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

      {/* 🚫 Модальный Попап "Не еда" */}
      {notFoodModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 w-full max-w-sm text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <span className="text-2xl">🚫</span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-white">Это не похоже на еду</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {notFoodModal.message}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotFoodModal({ isOpen: false, message: '' })}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-95 cursor-pointer transition-all border border-slate-700"
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
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/25 active:scale-95 cursor-pointer transition-all"
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
