import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// 🔄 Автоматическое мгновенное обновление интерфейса без ручной очистки кэша
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('🔄 Найдена новая версия приложения, мгновенно обновляю...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('✅ Оффлайн-кэш готов');
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
