import React, { useState, useEffect } from 'react';
import { X, Key, Shield, Smartphone, RefreshCw, Check } from 'lucide-react';
import { api } from '../services/api.js';

export default function SettingsModal({ isOpen, onClose, onRefresh }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [whoopClientId, setWhoopClientId] = useState('');
  const [whoopClientSecret, setWhoopClientSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getSettings().then(res => {
        if (res.success && res.settings) {
          if (res.settings.gemini_api_key) setGeminiKey(res.settings.gemini_api_key);
          if (res.settings.whoop_client_id) setWhoopClientId(res.settings.whoop_client_id);
          if (res.settings.whoop_client_secret) setWhoopClientSecret(res.settings.whoop_client_secret);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await api.saveSettings({
        gemini_api_key: geminiKey,
        whoop_client_id: whoopClientId,
        whoop_client_secret: whoopClientSecret
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1500);
      onRefresh();
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>Настройки и Ключи</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Gemini API Ключ */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              Google Gemini API Key (для Live AI Vision)
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
            <p className="text-[10px] text-slate-500 leading-normal">
              Опционально. Если ключ не указан, работает встроенный смарт-эмулятор для распознавания еды и ответов коуча.
            </p>
          </div>

          {/* Whoop OAuth Client */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="font-bold text-slate-300 block uppercase tracking-wider text-[10px]">
              Whoop Developer Portal (OAuth 2.0)
            </label>
            <input
              type="text"
              value={whoopClientId}
              onChange={(e) => setWhoopClientId(e.target.value)}
              placeholder="Client ID (из developer.whoop.com)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
            <input
              type="password"
              value={whoopClientSecret}
              onChange={(e) => setWhoopClientSecret(e.target.value)}
              placeholder="Client Secret"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Инструкция по установке на телефон */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-bold text-[11px]">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span>Как установить на телефон (PWA):</span>
            </div>
            <ol className="list-decimal list-inside text-[11px] space-y-1 leading-normal">
              <li>Откройте сайт в браузере Chrome или Safari на смартфоне.</li>
              <li>Нажмите в меню браузера (три точки или «Поделиться»).</li>
              <li>Выберите <strong>«Добавить на главный экран»</strong>.</li>
            </ol>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : null}
              <span>{savedSuccess ? 'Сохранено!' : isSaving ? '...' : 'Сохранить'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
