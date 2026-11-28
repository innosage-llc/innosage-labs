export function registerOffline() {
  if (!__DEV__ && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('./recorder-offline.js').catch(() => {});
  }
}
