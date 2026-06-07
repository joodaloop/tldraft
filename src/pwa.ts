import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onRegisteredSW(_swScriptUrl, registration) {
    if (!registration) return;
    void registration.update();
  },
  onNeedReload() {
    window.location.reload();
  },
  onRegisterError(error) {
    console.error("[PWA] service worker registration failed", error);
  },
});
