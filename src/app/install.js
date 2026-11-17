// Offline support and installing turnbase as an app.
import { create } from 'zustand';

export const useInstall = create(() => ({
  prompt: null, // The browser's deferred install prompt, where it offers one.
  installed: false,
  offlineReady: false,
}));

const standalone = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function setupInstall() {
  if (typeof window === 'undefined') return;
  useInstall.setState({ installed: standalone() });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstall.setState({ prompt: event });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null, installed: true }));

  // Only the production build has a service worker: in development it would cache stale code.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => useInstall.setState({ offlineReady: true }))
        .catch(() => {
          // The app still works online without it.
        });
    });
  }
}

export async function promptInstall() {
  const { prompt } = useInstall.getState();
  if (!prompt) return false;
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  useInstall.setState({ prompt: null });
  return choice?.outcome === 'accepted';
}
