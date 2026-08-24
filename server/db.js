import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { encryptToken, getEncryptionKey, isEncryptedToken, TokenEncryptionKeyError } from './utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Central Shared Persistence Resolver
export const isVolumeConfigured = Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.RAILWAY_VOLUME_MOUNT_PATH.trim());

export const DATA_DIR = isVolumeConfigured
  ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH.trim())
  : path.join(__dirname, '..');

export const DB_PATH = path.join(DATA_DIR, 'data.db');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Validate persistence directory at boot
export const validatePersistence = () => {
  if (isVolumeConfigured) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Test writeability to DATA_DIR
      const testFile = path.join(DATA_DIR, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok', 'utf8');
      fs.unlinkSync(testFile);
    } catch (err) {
      throw new Error(`CRITICAL: Railway persistent volume path '${DATA_DIR}' is not accessible or writable: ${err.message}`);
    }

    try {
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      const testUpload = path.join(UPLOADS_DIR, `.write_test_${Date.now()}`);
      fs.writeFileSync(testUpload, 'ok', 'utf8');
      fs.unlinkSync(testUpload);
    } catch (err) {
      throw new Error(`CRITICAL: Railway persistent uploads path '${UPLOADS_DIR}' is not accessible or writable: ${err.message}`);
    }
  } else {
    // Local dev: ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }
};

validatePersistence();

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('CRITICAL: Ошибка подключения к SQLite:', err.message);
    if (isVolumeConfigured) {
      throw new Error(`CRITICAL: Failed to open SQLite database at persistent volume path '${DB_PATH}': ${err.message}`);
    }
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
  // 1. Whoop Метрики (Все физиологические метрики по умолчанию NULL - zero-fake rule)
  await run(`
    CREATE TABLE IF NOT EXISTS whoop_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      recovery_score INTEGER DEFAULT NULL,
      recovery_state TEXT DEFAULT NULL,
      hrv REAL DEFAULT NULL,
      rhr INTEGER DEFAULT NULL,
      skin_temp REAL DEFAULT NULL,
      spo2 REAL DEFAULT NULL,
      sleep_need_min INTEGER DEFAULT NULL,
      sleep_actual_min INTEGER DEFAULT NULL,
      sleep_performance_pct INTEGER DEFAULT NULL,
      deep_sleep_min INTEGER DEFAULT NULL,
      rem_sleep_min INTEGER DEFAULT NULL,
      light_sleep_min INTEGER DEFAULT NULL,
      awake_min INTEGER DEFAULT NULL,
      respiratory_rate REAL DEFAULT NULL,
      strain REAL DEFAULT NULL,
      calories_burned INTEGER DEFAULT NULL,
      is_synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Non-destructive migration: Only clean physically impossible 0 values (HRV=0, RHR=0) without erasing legitimate physiological data
  try {
    await run(`UPDATE whoop_metrics SET hrv = NULL WHERE hrv = 0`);
    await run(`UPDATE whoop_metrics SET rhr = NULL WHERE rhr = 0`);
    await run(`UPDATE whoop_metrics SET recovery_state = NULL WHERE recovery_score IS NULL`);
  } catch (e) {}

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

  // Миграции для OpenAI Food Analysis
    try { await run(`ALTER TABLE meals ADD COLUMN fiber REAL DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE meals ADD COLUMN components_json TEXT`); } catch (e) {}
    try { await run(`ALTER TABLE meals ADD COLUMN confidence_json TEXT`); } catch (e) {}

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

  // 6. Пользовательские привычки / ритуалы с кастомными иконками (is_builtin для защиты системных факторов)
  await run(`
    CREATE TABLE IF NOT EXISTS custom_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '⚡',
      category TEXT DEFAULT 'Общее',
      is_builtin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    // Migration: add is_builtin column if missing in existing DBs
    const cols = await query("PRAGMA table_info(custom_habits)");
    if (cols && !cols.find(c => c.name === 'is_builtin')) {
      await run("ALTER TABLE custom_habits ADD COLUMN is_builtin INTEGER DEFAULT 0");
    }
  } catch (e) {}

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

  // 8. Настройки приложения (только пользовательские предпочтения и зашифрованные OAuth токены)
  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  console.log('✅ Таблицы SQLite успешно инициализированы');
  
  // Security Hardening R2: only remove a legacy static secret after its
  // environment replacement is present. Without that replacement the row is
  // deliberately preserved for rollback/migration, but no provider reads it.
  const legacyStaticSecrets = [
    ['gemini_api_key', 'GEMINI_API_KEY'],
    ['openai_api_key', 'OPENAI_API_KEY'],
    ['whoop_client_id', 'WHOOP_CLIENT_ID'],
    ['whoop_client_secret', 'WHOOP_CLIENT_SECRET']
  ];
  for (const [settingKey, environmentKey] of legacyStaticSecrets) {
    if (typeof process.env[environmentKey] === 'string' && process.env[environmentKey].trim()) {
      await run('DELETE FROM app_settings WHERE key = ?', [settingKey]);
    }
  }

  // Migrate dynamic Whoop tokens only after the explicit encryption key has
  // validated. A missing, invalid, or wrong key never overwrites a legacy row.
  const tokenRows = await query(`
    SELECT key, value FROM app_settings
    WHERE key IN ('whoop_access_token', 'whoop_refresh_token')
  `);

  const legacyTokenRows = tokenRows.filter(row => row.value && !isEncryptedToken(row.value));
  if (legacyTokenRows.length > 0) {
    try {
      getEncryptionKey();
      for (const row of legacyTokenRows) {
        await run('UPDATE app_settings SET value = ? WHERE key = ?', [encryptToken(row.value.trim()), row.key]);
        console.log(`🔒 [Security Migration] Encrypted ${row.key} at rest`);
      }
    } catch (error) {
      if (error instanceof TokenEncryptionKeyError) {
        console.warn('⚠️ Whoop token migration deferred: TOKEN_ENCRYPTION_KEY is missing or invalid');
      } else {
        throw error;
      }
    }
  }

  await seedInitialDataIfEmpty();
};

// Заполнение реалистичными демо-данными для мгновенного старта
// Заполнение базовыми шаблонами тренировок и привычек (БЕЗ фейковых метрик здоровья)
const seedInitialDataIfEmpty = async () => {
  // 1. Инициализация стандартных ритуалов / привычек (если таблица пуста)
  const existingHabits = await query(`SELECT COUNT(*) as count FROM custom_habits`);
  if (existingHabits[0]?.count === 0) {
    await run(`
      INSERT INTO custom_habits (title, icon, category) VALUES 
      ('Магний на ночь', '💊', 'Восстановление'),
      ('Холодный душ', '❄️', 'Тонус'),
      ('Сауна 25 мин', '🔥', 'Восстановление'),
      ('Прогулка 10k', '👟', 'Активность'),
      ('Медитация / дыхание', '🧘', 'Стресс')
    `);
  }

  // 2. Инициализация стандартных шаблонов тренировок (если таблица пуста)
  const existingTemplates = await query(`SELECT COUNT(*) as count FROM workout_templates`);
  if (existingTemplates[0]?.count === 0) {
    const pushA = [
      { name: 'Жим штанги лежа', sets: [{ weight: 80, reps: 8 }, { weight: 85, reps: 8 }, { weight: 90, reps: 6 }] },
      { name: 'Жим гантелей под углом', sets: [{ weight: 28, reps: 10 }, { weight: 30, reps: 8 }] },
      { name: 'Брусья на грудь', sets: [{ weight: 0, reps: 12 }, { weight: 10, reps: 8 }] }
    ];
    const legs = [
      { name: 'Приседания со штангой', sets: [{ weight: 100, reps: 6 }, { weight: 105, reps: 6 }, { weight: 110, reps: 5 }] },
      { name: 'Румынская тяга', sets: [{ weight: 90, reps: 8 }, { weight: 95, reps: 8 }] }
    ];
    const pullB = [
      { name: 'Подтягивания с весом', sets: [{ weight: 10, reps: 8 }, { weight: 10, reps: 7 }] },
      { name: 'Тяга штанги в наклоне', sets: [{ weight: 70, reps: 8 }, { weight: 75, reps: 8 }] }
    ];
    const fullBody = [
      { name: 'Жим штанги лежа', sets: [{ weight: 80, reps: 8 }, { weight: 85, reps: 8 }] },
      { name: 'Приседания со штангой', sets: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }] },
      { name: 'Подтягивания', sets: [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }] }
    ];

    await run(`INSERT INTO workout_templates (title, type, exercises_json) VALUES (?, 'Силовая', ?)`, ['Push A (Грудь/Плечи)', JSON.stringify(pushA)]);
    await run(`INSERT INTO workout_templates (title, type, exercises_json) VALUES (?, 'Силовая', ?)`, ['Legs (Ноги/Кор)', JSON.stringify(legs)]);
    await run(`INSERT INTO workout_templates (title, type, exercises_json) VALUES (?, 'Силовая', ?)`, ['Pull B (Спина/Бицепс)', JSON.stringify(pullB)]);
    await run(`INSERT INTO workout_templates (title, type, exercises_json) VALUES (?, 'Силовая', ?)`, ['Full Body Power', JSON.stringify(fullBody)]);
  }

  // Приветственное сообщение AI Коуча
  const existingChat = await query(`SELECT COUNT(*) as count FROM chat_messages`);
  if (existingChat[0]?.count === 0) {
    await run(`
      INSERT INTO chat_messages (sender, message)
      VALUES ('ai', 'Привет! Я твой персональный ассистент по здоровью, тренировкам, питанию и восстановлению в Whoop Hub. Подключи свой трекер в настройках или задай вопрос по питанию, тренировкам или навигации по приложению!')
    `);
  }
};

export default db;
