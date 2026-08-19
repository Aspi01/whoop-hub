// Менеджер оффлайн-кэша и фоновой синхронизации

const STORAGE_KEYS = {
  QUEUE: 'whoop_hub_offline_queue',
  CACHE_PREFIX: 'whoop_hub_cache_'
};

/**
 * 📦 Получить текущую очередь отложенных запросов
 */
export const getOfflineQueue = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

/**
 * 📥 Добавить действие в оффлайн-очередь
 */
export const enqueueOfflineAction = (action) => {
  const queue = getOfflineQueue();
  const newItem = {
    id: 'offline_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: Date.now(),
    ...action
  };
  queue.push(newItem);
  try {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
  } catch (e) {}
  return newItem;
};

/**
 * 🗑️ Удалить элемент из очереди
 */
export const dequeueOfflineAction = (actionId) => {
  const queue = getOfflineQueue().filter(item => item.id !== actionId);
  try {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
  } catch (e) {}
  return queue;
};

/**
 * 💾 Локальное кэширование данных (для работы без интернета)
 */
export const setCachedData = (key, data) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHE_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {}
};

/**
 * 📖 Чтение данных из локального кэша
 */
export const getCachedData = (key) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch (e) {
    return null;
  }
};

/**
 * 🔍 Классификация ошибок синхронизации
 * Возвращает категорию ошибки:
 * - 'NETWORK_ERROR': нет связи, тайм-аут, fetch threw TypeError (сохраняем, останавливаем текущий проход)
 * - 'TRANSIENT_SERVER': 5xx (сохраняем, останавливаем текущий проход)
 * - 'AUTH_REQUIRED': 401, 403 (сохраняем, останавливаем текущий проход до переавторизации)
 * - 'RATE_LIMITED': 429 (сохраняем, останавливаем текущий проход)
 * - 'PERMANENT_CLIENT_ERROR': 400, 404, 405, 422 (удаляем некорректный элемент, продолжаем очередь)
 */
export const classifySyncError = (err) => {
  if (!err || typeof err.status !== 'number') {
    return 'NETWORK_ERROR';
  }

  const status = err.status;

  if (status >= 500 && status <= 599) {
    return 'TRANSIENT_SERVER';
  }

  if (status === 401 || status === 403) {
    return 'AUTH_REQUIRED';
  }

  if (status === 429) {
    return 'RATE_LIMITED';
  }

  // Консервативный список невосстановимых ошибок клиента:
  // 400 (Bad Request / невалидный payload), 404 (Not Found), 405 (Method Not Allowed), 422 (Unprocessable Entity)
  if (status === 400 || status === 404 || status === 405 || status === 422) {
    return 'PERMANENT_CLIENT_ERROR';
  }

  // Любые прочие 4xx статусы (напр. 408 Request Timeout, 409 Conflict, 425 Too Early) трактуются консервативно как временные
  return 'TRANSIENT_SERVER';
};

let isSyncInProgress = false;

/**
 * 🚀 Фоновая отправка накопившихся оффлайн-действий на сервер
 */
export const flushOfflineQueue = async (apiClient, onProgress) => {
  // Мьютекс: предотвращаем параллельный запуск нескольких проходов синхронизации
  if (isSyncInProgress) {
    return { synced: 0, pending: getOfflineQueue().length, inProgress: true };
  }

  isSyncInProgress = true;

  try {
    const queue = getOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, pending: 0 };
    }

    console.log(`🔄 Отправка ${queue.length} оффлайн-записей на сервер...`);
    let syncedCount = 0;

    for (const item of queue) {
      try {
        if (item.type === 'workout') {
          await apiClient.saveWorkout(item.payload, true);
        } else if (item.type === 'journal') {
          await apiClient.saveJournalToday(item.payload, true);
        }
        // Успех -> удаляем из очереди и инкрементируем счётчик
        dequeueOfflineAction(item.id);
        syncedCount++;
        if (onProgress) onProgress(syncedCount, queue.length);
      } catch (err) {
        const errorCategory = classifySyncError(err);
        console.warn(`[OfflineSync] Элемент ${item.id} (${item.type}) завершился с ошибкой [${errorCategory}]:`, err.message);

        if (errorCategory === 'PERMANENT_CLIENT_ERROR') {
          // Невосстановимая ошибка (400, 404, 405, 422) -> удаляем битый элемент, чтобы не блокировать следующие
          dequeueOfflineAction(item.id);
          // Продолжаем цикл для обработки следующих корректных элементов
          continue;
        }

        // Для NETWORK_ERROR, TRANSIENT_SERVER (5xx), AUTH_REQUIRED (401/403), RATE_LIMITED (429):
        // Оставляем элемент в очереди и останавливаем ТЕКУЩИЙ проход синхронизации, чтобы избежать спама/зацикливания.
        break;
      }
    }

    return { synced: syncedCount, pending: getOfflineQueue().length };
  } finally {
    isSyncInProgress = false;
  }
};
