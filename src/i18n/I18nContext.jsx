import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLocale, setLocale, t, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './index.js';

const I18nContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, params) => key
});

export function I18nProvider({ children }) {
  const [currentLocale, setCurrentLocale] = useState(() => getLocale());

  useEffect(() => {
    const handleLocaleChanged = (e) => {
      if (e.detail && SUPPORTED_LOCALES.includes(e.detail)) {
        setCurrentLocale(e.detail);
      }
    };
    window.addEventListener('app_locale_changed', handleLocaleChanged);
    return () => window.removeEventListener('app_locale_changed', handleLocaleChanged);
  }, []);

  const changeLocale = (newLocale) => {
    if (SUPPORTED_LOCALES.includes(newLocale)) {
      setLocale(newLocale);
      setCurrentLocale(newLocale);
    }
  };

  const translate = (key, params) => t(key, params, currentLocale);

  return (
    <I18nContext.Provider value={{ locale: currentLocale, setLocale: changeLocale, t: translate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
