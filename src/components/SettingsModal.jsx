import React, { useState, useEffect } from 'react';
import { X, Shield, ExternalLink, Check, Copy, Activity, Globe, Sparkles } from 'lucide-react';
import { api } from '../services/api.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function SettingsModal({ isOpen, onClose }) {
  const { locale, setLocale, t } = useI18n();
  const [integrationStatus, setIntegrationStatus] = useState({
    whoopConnected: false,
    whoopConfigured: false,
    geminiConfigured: false,
    openaiConfigured: false
  });
  const [whoopStatus, setWhoopStatus] = useState(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      // Load sanitized server integration statuses
      api.getSettings().then(res => {
        if (res?.success) {
          setIntegrationStatus({
            whoopConnected: Boolean(res.whoopConnected),
            whoopConfigured: Boolean(res.whoopConfigured),
            geminiConfigured: Boolean(res.geminiConfigured || res.hasGeminiKey),
            openaiConfigured: Boolean(res.openaiConfigured || res.hasOpenAIKey)
          });
        }
      }).catch((err) => console.warn('Settings load note:', err.message));

      api.getWhoopStatus().then(res => {
        if (res?.success) {
          setWhoopStatus(res);
          if (res.isConnected !== undefined) {
            setIntegrationStatus(prev => ({
              ...prev,
              whoopConnected: Boolean(res.isConnected),
              whoopConfigured: Boolean(res.isConfigured)
            }));
          }
        }
      }).catch((err) => console.warn('Whoop status load note:', err.message));

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

  const handleConnectWhoop = async () => {
    try {
      const res = await api.getWhoopOAuthUrl();
      if (res.success && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        alert(res.error || 'Не удалось сформировать ссылку авторизации Whoop. Проверьте переменные окружения сервера (WHOOP_CLIENT_ID).');
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
            <span>{t('settingsTitle')}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Блок переключения языка */}
        <div className="glass-card rounded-xl p-3.5 border border-white/10 bg-slate-950/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-xs">{t('settingsLanguage')}</span>
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-mono font-bold tracking-wider">
              {locale.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('settingsLanguage')}>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'en'}
              onClick={() => setLocale('en')}
              className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1 cursor-pointer min-h-[44px] ${
                locale === 'en'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900/80 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>English</span>
              {locale === 'en' && <Check className="w-3 h-3 text-emerald-400" />}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'ru'}
              onClick={() => setLocale('ru')}
              className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1 cursor-pointer min-h-[44px] ${
                locale === 'ru'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900/80 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>Русский</span>
              {locale === 'ru' && <Check className="w-3 h-3 text-emerald-400" />}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'uk'}
              onClick={() => setLocale('uk')}
              className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1 cursor-pointer min-h-[44px] ${
                locale === 'uk'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900/80 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>Українська</span>
              {locale === 'uk' && <Check className="w-3 h-3 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Блок привязки Whoop Developer Portal */}
        <div className="glass-card rounded-xl p-3.5 border border-emerald-500/30 bg-emerald-950/15 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white text-xs">Whoop OAuth 2.0</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              integrationStatus.whoopConnected
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {integrationStatus.whoopConnected ? '✓ Подключен' : 'Не привязан'}
            </span>
          </div>

          {/* Redirect URI */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 block">
              Redirect URI (для Whoop Dashboard):
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
            <span>{integrationStatus.whoopConnected ? 'Переподключить аккаунт Whoop' : 'Войти через Whoop (OAuth)'}</span>
          </button>
        </div>

        {/* Блок статуса AI Vision Провайдеров */}
        <div className="glass-card rounded-xl p-3.5 border border-white/10 bg-slate-950/40 space-y-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-xs">AI & Компьютерное зрение</span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Google Gemini */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-xs">Google Gemini Vision</div>
                <div className="text-[10px] text-slate-400">Переменная сервера GEMINI_API_KEY</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                integrationStatus.geminiConfigured
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {integrationStatus.geminiConfigured ? '✓ Настроен' : 'Не настроен'}
              </span>
            </div>

            {/* OpenAI */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-xs">OpenAI Vision</div>
                <div className="text-[10px] text-slate-400">Переменная сервера OPENAI_API_KEY</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                integrationStatus.openaiConfigured
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {integrationStatus.openaiConfigured ? '✓ Настроен' : 'Не настроен'}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer active:scale-95 transition-all"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
