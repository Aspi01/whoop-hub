import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDB } from './db.js';
import whoopRoutes from './routes/whoop.js';
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

// Статическая раздача собранного фронтенда
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(404).send('Frontend index.html not found. Please run npm run build.');
});

// Запуск сервера после инициализации БД
const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Whoop Hub Backend запущен на порту: ${PORT}`);
      console.log(`📱 Готов к работе в облаке (24/7)\n`);
    });
  } catch (err) {
    console.error('Критическая ошибка запуска сервера:', err);
  }
};

startServer();
