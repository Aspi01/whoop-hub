import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data.db');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Ошибка подключения к SQLite:', err.message);
  } else {
    console.log('✅ SQLite база данных подключена:', DB_PATH);
  }
});

// Promisified DB helpers
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const getOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Инициализация структуры таблиц
export const initDB = async () => {
  // 1. Whoop Метрики
  await run(`
    CREATE TABLE IF NOT EXISTS whoop_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      recovery_score INTEGER DEFAULT 0,
      recovery_state TEXT DEFAULT 'green',
      hrv REAL DEFAULT 0,
      rhr INTEGER DEFAULT 0,
      skin_temp REAL DEFAULT 0,
      spo2 REAL DEFAULT 0,
      sleep_need_min INTEGER DEFAULT 0,
      sleep_actual_min INTEGER DEFAULT 0,
      sleep_performance_pct INTEGER DEFAULT 0,
      deep_sleep_min INTEGER DEFAULT 0,
      rem_sleep_min INTEGER DEFAULT 0,
      light_sleep_min INTEGER DEFAULT 0,
      awake_min INTEGER DEFAULT 0,
      respiratory_rate REAL DEFAULT 0,
      strain REAL DEFAULT 0,
      calories_burned INTEGER DEFAULT 0,
      is_synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Питание (AI Vision)
  await run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_str TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      meal_type TEXT NOT NULL,
      image_url TEXT,
      title TEXT NOT NULL,
      calories INTEGER DEFAULT 0,
      protein REAL DEFAULT 0,
      fats REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      glycemic_index TEXT DEFAULT 'Средний',
      ai_notes TEXT,
      status TEXT DEFAULT 'confirmed',
      clarification_question TEXT,
      user_reply TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Тренировки и Прогрессия весов
  await run(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'Силовая',
      duration_min INTEGER DEFAULT 0,
      strain REAL DEFAULT 0,
      avg_hr INTEGER DEFAULT 0,
      max_hr INTEGER DEFAULT 0,
      fatigue_rpe INTEGER DEFAULT 5,
      notes TEXT,
      exercises_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Дневник биохакинга
  await run(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      tags_json TEXT,
      stress_level INTEGER DEFAULT 2,
      energy_level INTEGER DEFAULT 7,
      notes TEXT,
      custom_answers_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Чат с AI Коучем
  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Пользовательские привычки / ритуалы с кастомными иконками
  await run(`
    CREATE TABLE IF NOT EXISTS custom_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '⚡',
      category TEXT DEFAULT 'Общее',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. Шаблоны и пресеты тренировок
  await run(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'Силовая',
      exercises_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. Настройки приложения
  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  console.log('✅ Таблицы SQLite успешно инициализированы');
  
  // Инициализация настроек из переменных окружения при их наличии
  if (process.env.WHOOP_CLIENT_ID) {
    await run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('whoop_client_id', ?)`, [process.env.WHOOP_CLIENT_ID]);
  }
  if (process.env.WHOOP_CLIENT_SECRET) {
    await run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('whoop_client_secret', ?)`, [process.env.WHOOP_CLIENT_SECRET]);
  }
  if (process.env.GEMINI_API_KEY) {
    await run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('gemini_api_key', ?)`, [process.env.GEMINI_API_KEY]);
  }

  await seedInitialDataIfEmpty();
};

// Заполнение реалистичными демо-данными для мгновенного старта
const seedInitialDataIfEmpty = async () => {
  const existingMetrics = await query(`SELECT COUNT(*) as count FROM whoop_metrics`);
  if (existingMetrics[0]?.count === 0) {
    console.log('🌱 Инициализация тестовых данных для демонстрации...');
    const today = new Date();
    
    // Создаем историю за последние 7 дней
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      // Реалистичные колебания
      let recScore = 86;
      let hrv = 74;
      let rhr = 51;
      let deep = 95;
      let rem = 110;
      let strain = 13.4;
      let recState = 'green';

      if (i === 2) {
        // День с поздним ужином и провалом
        recScore = 48;
        recState = 'yellow';
        hrv = 44;
        rhr = 59;
        deep = 38;
        rem = 70;
        strain = 16.8;
      } else if (i === 5) {
        // День после сауны и магния
        recScore = 94;
        recState = 'green';
        hrv = 88;
        rhr = 48;
        deep = 120;
        rem = 125;
        strain = 11.2;
      } else if (i === 0) {
        // Сегодня
        recScore = 78;
        recState = 'green';
        hrv = 68;
        rhr = 53;
        deep = 85;
        rem = 98;
        strain = 8.5;
      }

      await run(`
        INSERT INTO whoop_metrics (
          date, recovery_score, recovery_state, hrv, rhr, skin_temp, spo2,
          sleep_need_min, sleep_actual_min, sleep_performance_pct,
          deep_sleep_min, rem_sleep_min, light_sleep_min, awake_min,
          respiratory_rate, strain, calories_burned, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        dateStr, recScore, recState, hrv, rhr, 36.4, 98.2,
        480, (deep + rem + 180), Math.round(((deep + rem + 180)/480)*100),
        deep, rem, 180, 25,
        14.2, strain, 2450
      ]);

      // Дневник привычек
      const tags = i === 2 
        ? ['Поздний ужин 22:30', 'Кофе после 16:00', 'Стресс на работе']
        : i === 5 
        ? ['Сауна 25 мин', 'Магний L-Треонат', 'Прогулка 10k']
        : ['Магний на ночь', 'Прогулка 8k', 'Холодный душ'];

      await run(`
        INSERT INTO journal_entries (date, tags_json, stress_level, energy_level, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [
        dateStr,
        JSON.stringify(tags),
        i === 2 ? 4 : 2,
        i === 2 ? 4 : 8,
        i === 2 ? 'Тяжелый день, поздно поужинал пиццей' : 'Отличное самочувствие и бодрость'
      ]);
    }

    // Добавляем тестовые приемы пищи
    const todayStr = today.toISOString().split('T')[0];
    await run(`
      INSERT INTO meals (date, time_str, meal_type, title, calories, protein, fats, carbs, glycemic_index, ai_notes)
      VALUES 
      (?, '09:15', 'Завтрак', 'Омлет из 3 яиц с авокадо и цельнозерновым тостом', 480, 26, 32, 22, 'Низкий', 'Отличный белково-жировой баланс для стабильного сахара крови'),
      (?, '14:20', 'Обед', 'Грудка индейки на гриле с диким рисом и брокколи', 590, 48, 14, 62, 'Средний', 'Идеальный источник сложных углеводов перед тренировкой')
    `, [todayStr, todayStr]);

    // Добавляем тестовую силовую тренировку
    const exercises = [
      { name: 'Жим штанги лежа', sets: [{ weight: 90, reps: 8 }, { weight: 90, reps: 8 }, { weight: 95, reps: 6 }] },
      { name: 'Приседания со штангой', sets: [{ weight: 110, reps: 6 }, { weight: 110, reps: 6 }, { weight: 115, reps: 5 }] },
      { name: 'Подтягивания с весом', sets: [{ weight: 10, reps: 8 }, { weight: 10, reps: 7 }] }
    ];

    await run(`
      INSERT INTO workouts (date, title, type, duration_min, strain, avg_hr, max_hr, fatigue_rpe, notes, exercises_json)
      VALUES (?, 'Силовая: Грудь + Ноги', 'Силовая', 65, 14.2, 138, 172, 7, 'Хороший памп, но на последних подходах приседа чувствовалась утомляемость', ?)
    `, [todayStr, JSON.stringify(exercises)]);

    // Приветственное сообщение от AI Коуча
    await run(`
      INSERT INTO chat_messages (sender, message, metadata_json)
      VALUES ('ai', 'Привет! Я твой персональный AI-биохакер. Я уже проанализировал твои данные Whoop, приемы пищи и тренировочный дневник за неделю.\n\n💡 **Главное наблюдение:** 2 дня назад при позднем ужине в 22:30 твой глубокий сон упал до 38 минут, а Recovery опустился до 48%. Сегодня же твоя готовность 78% — отличный день для запланированной силовой сессии!\n\nСпрашивай меня о любых закономерностях, или присылай фото еды, когда будешь кушать.', '{"type": "welcome"}')
    `);
  }
};

export default db;
