/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

/**
 * Picking up a new deploy. The service worker serves the stored copy of the
 * site first, so without this a deploy shows only after the app is closed
 * and opened again (and iPhones keep a home-screen app around for a long time).
 *
 * We check for a new version on launch, when the app comes back to the
 * foreground, and every half hour. A new version installs and takes over by
 * itself; the page then reloads into it, but only on the main menu: a reload
 * mid-game would end a Gauntlet run or drop you from a Quickdraw room. If
 * you're in a game, the page carries on as it is until you go back to the menu.
 */

const CHECK_EVERY = 30 * 60 * 1000;
const onMenu = () => location.hash === '' || location.hash === '#/' || location.hash === '#';

export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let pending = false;
  const apply = () => {
    if (pending && onMenu()) {
      pending = false;
      location.reload();
    }
  };

  registerSW({
    immediate: true,
    // A new version has taken over: reload into it (now, or on the menu).
    onNeedReload() {
      pending = true;
      apply();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine && !pending) reg.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
  window.addEventListener('hashchange', apply);
}
