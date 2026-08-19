import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDB, getOne } from './db.js';
import whoopRoutes, { syncLiveWhoopData } from './routes/whoop.js';
import mealsRoutes from './routes/meals.js';
import workoutsRoutes from './routes/workouts.js';
import journalRoutes from './routes/journal.js';
import coachRoutes from './routes/coach.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Включаем доверие к прокси для Render, Railway, Cloudflare
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Статическая папка для загруженных фотографий еды
const uploadsPath = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// API Роуты
app.use('/api/whoop', whoopRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/workouts', workoutsRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/settings', settingsRoutes);

// Статическая раздача собранного фронтенда с правильным управлением кэшем
const distPath = path.join(__dirname, '..', 'dist');

app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js') || filePath.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.includes('assets')) {
      // Хэшированные JS/CSS файлы кэшируются безопасно, так как хэш меняется при сборке
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(indexPath);
  }
  return res.status(404).send('Frontend index.html not found. Please run npm run build.');
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка Express:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Внутренняя ошибка сервера'
  });
});

// Запуск сервера после инициализации БД
const startServer = async () => {
  try {
    await initDB();

    // Автоматическая фоновая синхронизация реальных метрик Whoop при старте сервера
    try {
      const row = await getOne(`SELECT value FROM app_settings WHERE key = 'whoop_access_token'`);
      if (row?.value) {
        console.log('🔄 Запуск фоновой синхронизации метрик Whoop...');
        syncLiveWhoopData(row.value).catch(err => console.warn('Ошибка фоновой синхронизации Whoop:', err.message));
      }
    } catch (e) {}

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Whoop Hub Backend запущен на порту: ${PORT}`);
      console.log(`📱 Готов к работе в облаке (24/7)\n`);
    });
  } catch (err) {
    console.error('Критическая ошибка запуска сервера:', err);
  }
};

startServer();
