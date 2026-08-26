import { HEALTH_SOURCE_IDS, HEALTH_SOURCE_STATES } from './healthSourceModel.js';
import { createWhoopHealthAdapter } from './adapters/whoopHealthAdapter.js';

const futureSource = ({ id, display_name, platform, state, capabilities }) => ({
  id,
  display_name,
  platform,
  async getStatus() {
    return { id, display_name, platform, connection_state: state, capabilities, last_sync_at: null, error_state: null, metadata: { planned: true, normalization_version: 1 } };
  },
  getCapabilities() { return capabilities; },
  async sync() { return { supported: false }; },
  normalize() { return []; },
  async disconnect() { return { supported: false }; }
});

export function createHealthSourceRegistry({ whoopAdapter = createWhoopHealthAdapter() } = {}) {
  const nativeCapabilities = ['sleep_duration', 'hrv_rmssd', 'resting_heart_rate', 'steps', 'active_calories', 'spo2', 'workout_duration'].map(metric => ({ metric, available: false, planned: true }));
  const adapters = new Map([
    [HEALTH_SOURCE_IDS.WHOOP, whoopAdapter],
    [HEALTH_SOURCE_IDS.APPLE_HEALTH, futureSource({ id: HEALTH_SOURCE_IDS.APPLE_HEALTH, display_name: 'Apple Health', platform: 'ios_native', state: HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP, capabilities: nativeCapabilities })],
    [HEALTH_SOURCE_IDS.HEALTH_CONNECT, futureSource({ id: HEALTH_SOURCE_IDS.HEALTH_CONNECT, display_name: 'Health Connect', platform: 'android_native', state: HEALTH_SOURCE_STATES.REQUIRES_NATIVE_APP, capabilities: nativeCapabilities })],
    [HEALTH_SOURCE_IDS.GARMIN, futureSource({ id: HEALTH_SOURCE_IDS.GARMIN, display_name: 'Garmin', platform: 'server_oauth', state: HEALTH_SOURCE_STATES.COMING_SOON, capabilities: ['sleep_duration', 'hrv_rmssd', 'resting_heart_rate', 'steps', 'workout_duration'].map(metric => ({ metric, available: false, planned: true })) })]
  ]);
  return {
    getSource(id) { return adapters.get(id) || null; },
    async listSources() { return Promise.all([...adapters.values()].map(adapter => adapter.getStatus())); },
    async getConnectedSources() { return (await this.listSources()).filter(source => source.connection_state === HEALTH_SOURCE_STATES.CONNECTED); },
    async getAvailableMetrics() { return [...new Set((await this.listSources()).flatMap(source => source.capabilities.filter(capability => capability.available).map(capability => capability.metric)))]; }
  };
}

export const healthSourceRegistry = createHealthSourceRegistry();
