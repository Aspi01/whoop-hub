import React, { useState, useEffect } from 'react';
import { X, Key, Shield, Smartphone, ExternalLink, Check, Copy, Activity } from 'lucide-react';
import { api } from '../services/api.js';

export default function SettingsModal({ isOpen, onClose, onRefresh }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [whoopClientId, setWhoopClientId] = useState('');
  const [whoopClientSecret, setWhoopClientSecret] = useState('');
  const [whoopStatus, setWhoopStatus] = useState(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
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
      api.getWhoopStatus().then(res => {
        if (res.success) setWhoopStatus(res);
      });
    }
  }, [isOpen]);

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
      await api.saveSettings({
        gemini_api_key: geminiKey,
        whoop_client_id: whoopClientId,
        whoop_client_secret: whoopClientSecret
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 1500);
      onRefresh();
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>Интеграции и Ключи</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 🟢 Блок привязки Whoop Developer Portal */}
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/30 bg-emerald-950/20 space-y-3">
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

          {/* Redirect URI поле для копирования */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
              1. Ваш Redirect URI (вставьте в кабинет Whoop):
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-2">
              <code className="flex-1 text-[11px] text-emerald-400 font-mono truncate select-all">
                {activeRedirectUri}
              </code>
              <button
                type="button"
                onClick={handleCopyRedirect}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg flex items-center gap-1 shrink-0"
              >
                {copiedRedirect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedRedirect ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
          </div>

          {/* Ссылка на портал разработчика */}
          <a
            href="https://developer-dashboard.whoop.com"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>Открыть Whoop Developer Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Кнопка прямого логина через Whoop */}
          <button
            type="button"
            onClick={handleConnectWhoop}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Activity className="w-4 h-4" />
            <span>{whoopStatus?.isConnected ? 'Переподключить аккаунт Whoop' : 'Войти через Whoop (OAuth)'}</span>
          </button>
        </div>

        {/* Форма сохранения ключей */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Whoop Client ID & Secret */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <label className="font-bold text-slate-300 block uppercase tracking-wider text-[10px]">
              2. Данные приложения из Whoop Dashboard:
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
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
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
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
            >
              Закрыть
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : null}
              <span>{savedSuccess ? 'Сохранено!' : isSaving ? '...' : 'Сохранить ключи'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
