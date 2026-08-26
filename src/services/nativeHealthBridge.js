import { Capacitor, registerPlugin } from '@capacitor/core';

const appleHealthPlugin = registerPlugin('AppleHealth');

// A Capacitor native-platform signal is an explicit shell capability, unlike a
// user agent, display mode, or browser storage flag. Plugin calls remain the
// final availability check because an iOS build can still lack HealthKit.
export function isNativeAppleHealthRuntime(capacitor = Capacitor) {
  return capacitor.isNativePlatform() && capacitor.getPlatform() === 'ios';
}

export function createNativeHealthBridge({ plugin = appleHealthPlugin, capacitor = Capacitor } = {}) {
  const isNativeRuntime = () => isNativeAppleHealthRuntime(capacitor);

  return {
    isNativeRuntime,
    async isAvailable() {
      if (!isNativeRuntime()) return { available: false, state: 'REQUIRES_NATIVE_APP' };
      try {
        const status = await plugin.isAvailable();
        return status?.available
          ? { available: true, state: 'AVAILABLE' }
          : { available: false, state: 'UNAVAILABLE' };
      } catch {
        return { available: false, state: 'UNAVAILABLE' };
      }
    },
    async getAuthorizationStatus(metrics) {
      if (!isNativeRuntime()) return { state: 'REQUIRES_NATIVE_APP', can_request: false };
      return plugin.getAuthorizationStatus({ metrics });
    },
    async requestAuthorization(metrics) {
      if (!isNativeRuntime()) return { state: 'REQUIRES_NATIVE_APP', request_completed: false };
      return plugin.requestAuthorization({ metrics });
    },
    async readSamples(metric, from, to) {
      if (!isNativeRuntime()) return { metric, samples: [], state: 'REQUIRES_NATIVE_APP' };
      return plugin.readSamples({ metric, from, to });
    },
    async readWorkouts(from, to) {
      if (!isNativeRuntime()) return { workouts: [], state: 'REQUIRES_NATIVE_APP' };
      return plugin.readWorkouts({ from, to });
    }
  };
}

export const nativeHealthBridge = createNativeHealthBridge();

// Kept synchronous for existing source cards. It never marks the browser/PWA
// as native; callers that need definitive native availability call isAvailable.
export function hasNativeHealthBridge() {
  return nativeHealthBridge.isNativeRuntime();
}

export function getAppleHealthCapability() {
  return hasNativeHealthBridge() ? 'AVAILABLE' : 'REQUIRES_NATIVE_APP';
}
