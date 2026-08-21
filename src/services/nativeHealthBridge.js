// Native shells can expose this explicit capability in the future. Web/PWA
// user-agent, display mode, query parameters, and storage flags are not proof.
export function hasNativeHealthBridge() {
  return typeof window !== 'undefined'
    && window.WhoopHubNativeHealth?.isAvailable === true;
}

export function getAppleHealthCapability() {
  return hasNativeHealthBridge() ? 'AVAILABLE' : 'REQUIRES_NATIVE_APP';
}
