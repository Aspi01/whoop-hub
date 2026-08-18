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
    id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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
 * 🚀 Фоновая отправка накопившихся оффлайн-действий на сервер при появлении сети
 */
export const flushOfflineQueue = async (apiClient, onProgress) => {
  if (!navigator.onLine) return { synced: 0, pending: getOfflineQueue().length };

  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, pending: 0 };

  console.log(`🔄 Отправка ${queue.length} оффлайн-записей на сервер...`);
  let syncedCount = 0;

  for (const item of queue) {
    try {
      if (item.type === 'workout') {
        await apiClient.saveWorkout(item.payload, true);
        dequeueOfflineAction(item.id);
        syncedCount++;
      } else if (item.type === 'journal') {
        await apiClient.saveJournalToday(item.payload, true);
        dequeueOfflineAction(item.id);
        syncedCount++;
      }
      if (onProgress) onProgress(syncedCount, queue.length);
    } catch (err) {
      console.warn('Не удалось синхронизировать элемент очереди:', item.id, err.message);
      // Если это сетевая ошибка, останавливаем цикл до следующего подключения
      if (!navigator.onLine) break;
    }
  }

  return { synced: syncedCount, pending: getOfflineQueue().length };
};
