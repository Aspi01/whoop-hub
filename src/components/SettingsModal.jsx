import React, { useState, useEffect } from 'react';
import { X, Key, Shield, ExternalLink, Check, Copy, Activity } from 'lucide-react';
import { api } from '../services/api.js';

export default function SettingsModal({ isOpen, onClose, onRefresh, onSaveSuccess }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [whoopClientId, setWhoopClientId] = useState('');
  const [whoopClientSecret, setWhoopClientSecret] = useState('');
  const [whoopStatus, setWhoopStatus] = useState(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      // 1. Загрузка из localStorage
      try {
        const saved = localStorage.getItem('whoop_saved_keys');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.geminiApiKey) setGeminiKey(parsed.geminiApiKey);
          if (parsed.clientId) setWhoopClientId(parsed.clientId);
          if (parsed.clientSecret) setWhoopClientSecret(parsed.clientSecret);
        }
      } catch (e) {}

      // 2. Загрузка с сервера
      api.getSettings().then(res => {
        if (res.success && res.settings) {
          if (res.settings.gemini_api_key) setGeminiKey(res.settings.gemini_api_key);
          if (res.settings.whoop_client_id) setWhoopClientId(res.settings.whoop_client_id);
          if (res.settings.whoop_client_secret) setWhoopClientSecret(res.settings.whoop_client_secret);
        }
      });
      api.getWhoopStatus().then(res => {
        if (res.success) setWhoopStatus(res);
      });

      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyRedirect = () => {
    const uri = whoopStatus?.redirectUri || whoopStatus?.localRedirectUri || `${window.location.origin}/api/whoop/oauth/callback`;
    navigator.clipboard.writeText(uri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      localStorage.setItem('whoop_saved_keys', JSON.stringify({
        geminiApiKey: geminiKey.trim(),
        clientId: whoopClientId.trim(),
        clientSecret: whoopClientSecret.trim()
      }));

      await api.saveSettings({
        gemini_api_key: geminiKey.trim(),
        whoop_client_id: whoopClientId.trim(),
        whoop_client_secret: whoopClientSecret.trim()
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 1500);

      try {
        if (typeof onRefresh === 'function') {
          onRefresh();
        } else if (typeof onSaveSuccess === 'function') {
          onSaveSuccess();
        }
      } catch (cbErr) {
        console.warn('Callback error:', cbErr);
      }
    } catch (err) {
      alert('Ошибка сохранения: ' + (err?.message || 'Неизвестная ошибка'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectWhoop = async () => {
    try {
      if (!whoopClientId.trim() || !whoopClientSecret.trim()) {
        alert('Пожалуйста, сначала введите и Client ID, и Client Secret в поля ниже!');
        return;
      }
      await api.saveSettings({
        whoop_client_id: whoopClientId.trim(),
        whoop_client_secret: whoopClientSecret.trim(),
        gemini_api_key: geminiKey.trim()
      });
      const res = await api.getWhoopOAuthUrl();
      if (res.success && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        alert(res.error || 'Не удалось сформировать ссылку авторизации');
      }
    } catch (err) {
      alert('Ошибка перехода в Whoop: ' + err.message);
    }
  };

  const activeRedirectUri = whoopStatus?.redirectUri || `${window.location.origin}/api/whoop/oauth/callback`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto p-4 sm:p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2 text-white font-bold text-sm" id="settings-modal-title">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Интеграции и Ключи API</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть настройки"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Блок привязки Whoop Developer Portal */}
        <div className="glass-card rounded-xl p-3.5 border border-emerald-500/30 bg-emerald-950/15 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-xs">Whoop OAuth 2.0</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              whoopStatus?.isConnected
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {whoopStatus?.isConnected ? '✓ Подключен' : 'Не привязан'}
            </span>
          </div>

          {/* Redirect URI */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
              1. Redirect URI (для Whoop Dashboard):
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1.5 px-2">
              <code className="flex-1 text-[10px] text-emerald-400 font-mono truncate select-all">
                {activeRedirectUri}
              </code>
              <button
                type="button"
                onClick={handleCopyRedirect}
                className="px-2 py-1 min-h-[30px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg flex items-center gap-1 shrink-0 active:scale-95"
              >
                {copiedRedirect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedRedirect ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
          </div>

          {/* Ссылка на портал */}
          <a
            href="https://developer-dashboard.whoop.com"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Открыть Whoop Developer Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Кнопка логина */}
          <button
            type="button"
            onClick={handleConnectWhoop}
            className="w-full py-2.5 min-h-[42px] rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 active:scale-98 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 transition-all"
          >
            <Activity className="w-4 h-4" />
            <span>{whoopStatus?.isConnected ? 'Переподключить аккаунт Whoop' : 'Войти через Whoop (OAuth)'}</span>
          </button>
        </div>

        {/* Форма сохранения ключей */}
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          {/* Whoop Client ID & Secret */}
          <div className="space-y-2 pt-1 border-t border-white/5">
            <label className="font-bold text-slate-300 block uppercase tracking-wider text-[10px]">
              2. Данные приложения из Whoop:
            </label>
            <input
              type="text"
              value={whoopClientId}
              onChange={(e) => setWhoopClientId(e.target.value)}
              placeholder="Client ID"
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

          {/* Gemini API Ключ */}
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <label className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              Google Gemini API Key (для Live Vision)
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer active:scale-95 transition-all"
            >
              Закрыть
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 min-h-[42px] rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : null}
              <span>{savedSuccess ? 'Сохранено!' : isSaving ? '...' : 'Сохранить'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
