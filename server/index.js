import express from 'express';
import cors from 'cors';
import path from 'path';
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

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Статическая папка для загруженных фотографий еды
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

// API Роуты
app.use('/api/whoop', whoopRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/workouts', workoutsRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/settings', settingsRoutes);

// Статическая раздача собранного фронтенда (для production)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.send(`
        <html>
          <body style="background:#090d16;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <h2>Whoop Hub Backend API работает 🟢</h2>
            <p>Для разработки запустите клиентскую часть командой: <code>npm run dev</code></p>
          </body>
        </html>
      `);
    }
  });
});

// Запуск сервера после инициализации БД
const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Whoop Hub Backend запущен: http://localhost:${PORT}`);
      console.log(`📱 Доступен по локальной сети для мобильного PWA\n`);
    });
  } catch (err) {
    console.error('Критическая ошибка запуска сервера:', err);
  }
};

startServer();
