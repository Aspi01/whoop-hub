import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Clock, Sparkles, MessageSquare, Check, Trash2, Flame, Image as ImageIcon, PlusCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api.js';

export default function MealScanner({ mealsData, onRefresh, onOpenSettings }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userComment, setUserComment] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notFoodModal, setNotFoodModal] = useState({ isOpen: false, message: '' });

  // AI Analysis Result Modal & Correction State
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [serverImageUrl, setServerImageUrl] = useState(null);

  // Editable fields in analysis result
  const [editableFoodName, setEditableFoodName] = useState('');
  const [editableComponents, setEditableComponents] = useState([]);
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentGrams, setNewComponentGrams] = useState('');

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
    if (isGoalSheetOpen || notFoodModal.isOpen || analysisModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isGoalSheetOpen, notFoodModal.isOpen, analysisModalOpen]);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const meals = mealsData?.meals || [];
  const totals = mealsData?.totals || { calories: 0, protein: 0, fats: 0, carbs: 0 };

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

  /**
   * Step 1: Trigger OpenAI Food Analysis
   */
  const handleStartAnalysis = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedFile && !userComment.trim()) return;

    try {
      setIsAnalyzing(true);
      const formData = new FormData();
      if (selectedFile) formData.append('image', selectedFile);
      if (userComment.trim()) formData.append('comment', userComment.trim());

      const res = await api.analyzeFood(formData);
      if (res.success && res.analysis) {
        const analysis = res.analysis;
        setAnalysisResult(analysis);
        setServerImageUrl(res.imageUrl || null);
        setEditableFoodName(analysis.foodName || 'Приём пищи');
        
        // Deep copy components with initial scale ratio
        const initialComponents = (analysis.components || []).map(c => ({
          ...c,
          originalWeight: c.estimatedWeightG || 100,
          originalCalories: c.calories || 0,
          originalProtein: c.protein_g || 0,
          originalFat: c.fat_g || 0,
          originalCarbs: c.carbs_g || 0
        }));
        setEditableComponents(initialComponents);
        setAnalysisModalOpen(true);
      }
    } catch (err) {
      if (err.message && (err.message.includes('не обнаружена') || err.message.includes('Не еда') || err.message.includes('не похоже'))) {
        setNotFoodModal({
          isOpen: true,
          message: err.message
        });
      } else {
        alert('Ошибка анализа: ' + err.message);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Recalculate component nutrition on weight change
   */
  const handleComponentWeightChange = (index, newGramsStr) => {
    const newGrams = parseInt(newGramsStr, 10) || 0;
    setEditableComponents(prev => prev.map((comp, idx) => {
      if (idx !== index) return comp;
      const ratio = comp.originalWeight > 0 ? (newGrams / comp.originalWeight) : 1;
      return {
        ...comp,
        estimatedWeightG: newGrams,
        calories: Math.round(comp.originalCalories * ratio),
        protein_g: Math.round(comp.originalProtein * ratio * 10) / 10,
        fat_g: Math.round(comp.originalFat * ratio * 10) / 10,
        carbs_g: Math.round(comp.originalCarbs * ratio * 10) / 10
      };
    }));
  };

  const handleComponentDelete = (index) => {
    setEditableComponents(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAddComponent = () => {
    if (!newComponentName.trim()) return;
    const grams = parseInt(newComponentGrams, 10) || 100;
    const estimatedKcal = Math.round(grams * 1.5); // approximate default
    const newComp = {
      name: newComponentName.trim(),
      estimatedWeightG: grams,
      originalWeight: grams,
      calories: estimatedKcal,
      originalCalories: estimatedKcal,
      protein_g: Math.round(grams * 0.08 * 10) / 10,
      originalProtein: Math.round(grams * 0.08 * 10) / 10,
      fat_g: Math.round(grams * 0.04 * 10) / 10,
      originalFat: Math.round(grams * 0.04 * 10) / 10,
      carbs_g: Math.round(grams * 0.15 * 10) / 10,
      originalCarbs: Math.round(grams * 0.15 * 10) / 10
    };
    setEditableComponents(prev => [...prev, newComp]);
    setNewComponentName('');
    setNewComponentGrams('');
  };

  // Live recalculated totals from editable components
  const computedTotalCalories = editableComponents.length > 0
    ? editableComponents.reduce((sum, c) => sum + (c.calories || 0), 0)
    : (analysisResult?.trackerCalories || analysisResult?.calories?.best || 0);

  const computedTotalProtein = editableComponents.length > 0
    ? Math.round(editableComponents.reduce((sum, c) => sum + (c.protein_g || 0), 0) * 10) / 10
    : (analysisResult?.macros?.protein_g || 0);

  const computedTotalFat = editableComponents.length > 0
    ? Math.round(editableComponents.reduce((sum, c) => sum + (c.fat_g || 0), 0) * 10) / 10
    : (analysisResult?.macros?.fat_g || 0);

  const computedTotalCarbs = editableComponents.length > 0
    ? Math.round(editableComponents.reduce((sum, c) => sum + (c.carbs_g || 0), 0) * 10) / 10
    : (analysisResult?.macros?.carbs_g || 0);

  const computedTotalFiber = analysisResult?.macros?.fiber_g || 0;

  /**
   * Step 2: Save Confirmed/Corrected Meal to Database
   */
  const handleSaveConfirmedMeal = async () => {
    try {
      setIsSaving(true);
      await api.saveMeal({
        title: editableFoodName.trim() || 'Приём пищи',
        image_url: serverImageUrl || null,
        calories: Math.round(computedTotalCalories),
        protein: computedTotalProtein,
        fats: computedTotalFat,
        carbs: computedTotalCarbs,
        fiber: computedTotalFiber,
        glycemic_index: 'Средний',
        ai_notes: analysisResult?.uncertainties?.join(', ') || '',
        components: editableComponents,
        confidence: analysisResult?.confidence || null,
        clarification_question: analysisResult?.clarifyingQuestion || null
      });

      setAnalysisModalOpen(false);
      setAnalysisResult(null);
      setSelectedFile(null);
      setPreviewImage(null);
      setUserComment('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';

      await onRefresh();
    } catch (err) {
      alert('Ошибка сохранения блюда: ' + err.message);
    } finally {
      setIsSaving(false);
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
      {/* Hidden file inputs */}
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
          <div className="primarySub">
            {meals.length === 0
              ? `Из ${calorieGoal.toLocaleString('ru-RU')} на сегодня · сегодня пока нет записей`
              : `Из ${calorieGoal.toLocaleString('ru-RU')} на сегодня · ${caloriesLeft > 0 ? `осталось ${caloriesLeft.toLocaleString('ru-RU')} ккал` : 'норма выполнена'}`}
          </div>
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

      {/* Macros Strip */}
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
          <b>Анализ еды через OpenAI Vision</b>
          <span>Авто-тайминг · {timeFormatted}</span>
        </div>

        {previewImage && (
          <div className="relative mt-3 rounded-xl overflow-hidden border border-[#233139] max-h-52 bg-[#091118] flex items-center justify-center">
            <img src={previewImage} alt="Превью" className="max-h-52 w-full object-cover" />
            <button
              type="button"
              onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 text-xs hover:bg-black"
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
          placeholder="Уточнение: одно яйцо, без масла, съел половину…"
          value={userComment}
          onChange={(e) => setUserComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStartAnalysis(e)}
        />

        <div className="quickRow">
          <button type="button" className="quick" onClick={() => handleQuickTag('Одно яйцо')}>+ Одно яйцо</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('Без масла')}>+ Без масла</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('Съел половину')}>+ Съел 1/2</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('Это индейка')}>+ Это индейка</button>
          <button type="button" className="quick" onClick={() => handleQuickTag('2 ч.л. масла')}>+ 2 ч.л. масла</button>
        </div>

        {(selectedFile || userComment.trim()) && (
          <button
            type="button"
            className="saveDay mt-3 flex items-center justify-center gap-2"
            onClick={handleStartAnalysis}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Sparkles className="w-4 h-4 text-[#7cf0a5] animate-spin" />
                <span>OpenAI анализирует фото и состав...</span>
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 text-[#7cf0a5]" />
                <span>Анализировать состав (Analyze)</span>
              </>
            )}
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
            <p className="text-[10px] text-slate-500 mt-1">Сделайте фото или введите блюдо для AI анализа</p>
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
                <strong>{meal.title || meal.name || 'Блюдо'}</strong>
                <div className="mealMeta">
                  Б {meal.protein || 0} · Ж {meal.fats || 0} · У {meal.carbs || 0}
                  {meal.fiber > 0 && ` · Кл ${meal.fiber}г`}
                </div>
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

      {/* ==============================================================
          AI Food Analysis Result & Correction Modal Sheet
         ============================================================== */}
      {analysisModalOpen && analysisResult && (
        <div className="modal open" onClick={() => setAnalysisModalOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="sheetHead">
              <div>
                <h2>Результат анализа OpenAI</h2>
                <div className="text-[10px] uppercase tracking-wider text-[#7cf0a5] mt-0.5 font-bold">
                  Проверьте и при необходимости скорректируйте вес
                </div>
              </div>
              <button type="button" className="close" onClick={() => setAnalysisModalOpen(false)}>×</button>
            </div>

            {/* Editable Food Name */}
            <div className="mt-3">
              <label className="text-[10px] uppercase tracking-wider text-[#7d8c95] font-bold block mb-1">
                Название блюда
              </label>
              <input
                type="text"
                value={editableFoodName}
                onChange={(e) => setEditableFoodName(e.target.value)}
                className="w-full bg-[#0b141b] border border-[#233139] rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#7cf0a5]"
              />
            </div>

            {/* Hero Calorie & Confidence Display */}
            <div className="p-3.5 mt-3 rounded-xl bg-[#091219] border border-[#1d2b35] flex items-center justify-between">
              <div>
                <div className="text-[26px] font-[800] text-[#7cf0a5] font-mono leading-none">
                  {Math.round(computedTotalCalories)} <span className="text-xs text-[#8e9ca4] font-normal">ккал</span>
                </div>
                <div className="text-[10px] text-[#8e9ca4] mt-1">
                  Диапазон: {analysisResult.calories?.low || Math.round(computedTotalCalories * 0.85)}–{analysisResult.calories?.high || Math.round(computedTotalCalories * 1.2)} ккал
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#14261d] text-[#7cf0a5] border border-[#24523a]">
                  Точность: {Math.round((analysisResult.confidence?.score || 0.85) * 100)}% ({analysisResult.confidence?.level === 'high' ? 'Высокая' : 'Средняя'})
                </span>
              </div>
            </div>

            {/* Calculated Macros Row */}
            <div className="grid grid-cols-4 gap-2 mt-3 text-center mono">
              <div className="p-2.5 rounded-lg bg-[#0b141b] border border-[#1c272f]">
                <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Белки</span>
                <b className="text-xs text-[#7cf0a5] block mt-0.5">{computedTotalProtein} г</b>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b141b] border border-[#1c272f]">
                <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Жиры</span>
                <b className="text-xs text-[#f1c463] block mt-0.5">{computedTotalFat} г</b>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b141b] border border-[#1c272f]">
                <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Углеводы</span>
                <b className="text-xs text-[#87d8f5] block mt-0.5">{computedTotalCarbs} г</b>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0b141b] border border-[#1c272f]">
                <span className="text-[8px] uppercase tracking-wider text-[#7d8c95] block">Клетчатка</span>
                <b className="text-xs text-[#c4d0cc] block mt-0.5">{computedTotalFiber} г</b>
              </div>
            </div>

            {/* Editable Components Breakdown */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8e9ca4] font-bold">
                  Состав и компоненты порции
                </span>
                <span className="text-[9px] text-[#63727b]">Граммовки можно менять</span>
              </div>

              <div className="space-y-2">
                {editableComponents.map((comp, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-[#091118] border border-[#1b2730] flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditableComponents(prev => prev.map((c, i) => i === idx ? { ...c, name: val } : c));
                        }}
                        className="w-full bg-transparent text-xs font-bold text-white outline-none border-b border-transparent focus:border-[#384c59]"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap text-[9px] text-[#7d8c95] mt-0.5">
                        <span>Б {comp.protein_g}г · Ж {comp.fat_g}г · У {comp.carbs_g}г</span>
                        {comp.source && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                            comp.source === 'user' ? 'bg-[#143220] text-[#7cf0a5] border border-[#1f4a30]' :
                            comp.source === 'user+vision' ? 'bg-[#122836] text-[#78c6e6] border border-[#1e3e54]' :
                            'bg-[#121c24] text-[#8e9ca4] border border-[#1f2d38]'
                          }`}>
                            {comp.source === 'user' ? 'Пользователь' : comp.source === 'user+vision' ? 'Факт + Вес AI' : 'AI Vision'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 bg-[#101c24] border border-[#21303b] rounded-lg px-2 py-1">
                        <input
                          type="number"
                          value={comp.estimatedWeightG || ''}
                          onChange={(e) => handleComponentWeightChange(idx, e.target.value)}
                          className="w-12 bg-transparent text-xs font-mono font-bold text-white text-right outline-none"
                        />
                        <span className="text-[10px] text-[#7d8c95]">г</span>
                      </div>

                      <div className="w-14 text-right mono text-xs font-bold text-[#7cf0a5]">
                        {comp.calories} <span className="text-[9px] text-[#7d8c95] font-normal">ккал</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleComponentDelete(idx)}
                        className="text-[#64748b] hover:text-rose-400 p-1"
                        title="Удалить компонент"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Component Line */}
              <div className="mt-2.5 p-2 rounded-xl bg-[#081016] border border-[#17232b] flex items-center gap-2">
                <input
                  type="text"
                  placeholder="+ Добавить ингредиент..."
                  value={newComponentName}
                  onChange={(e) => setNewComponentName(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white px-2 py-1 outline-none"
                />
                <input
                  type="number"
                  placeholder="Вес (г)"
                  value={newComponentGrams}
                  onChange={(e) => setNewComponentGrams(e.target.value)}
                  className="w-16 bg-[#101c24] border border-[#21303b] rounded-lg px-2 py-1 text-xs text-white text-right outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddComponent}
                  disabled={!newComponentName.trim()}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#173926] text-[#7cf0a5] border border-[#24523a] disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            {/* Highlights: Main Calorie Sources & Uncertainties */}
            {analysisResult.mainCalorieSources?.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-[#152129]">
                <span className="text-[9px] uppercase tracking-wider text-[#7d8c95] font-bold block mb-1.5">
                  Основные источники калорий
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {analysisResult.mainCalorieSources.map((src, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-[#101c24] text-[#8e9ca4] border border-[#1d2b35]">
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.uncertainties?.length > 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-[#121c24] border border-[#21303b]">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[#f1c463] font-bold mb-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Факторы неопределенности</span>
                </div>
                <div className="text-[10px] text-[#9bb0bc] leading-relaxed">
                  {analysisResult.uncertainties.join(' · ')}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="connect flex items-center justify-center gap-2"
                onClick={handleSaveConfirmedMeal}
                disabled={isSaving}
              >
                {isSaving ? 'Сохранение в дневник...' : '✓ Сохранить в дневник (Save Meal)'}
              </button>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-xs text-[#8e9ca4] hover:text-white bg-[#0b141b] border border-[#1d2931]"
                onClick={() => setAnalysisModalOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Modal */}
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

      {/* Not Food Modal */}
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
