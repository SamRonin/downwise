/**
 * Settings persistence (chrome.storage.sync) with graceful fallbacks.
 * Safe to import in Node/tests — all chrome access is guarded.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'fa', // UI language: 'fa' | 'en' (Persian is the default)
  theme: 'auto',  // 'auto' | 'light' | 'dark'
  quality: 0.92,  // JPEG/WebP encoder quality (0.5 – 1)
  notifications: true,
});

export const LANGUAGES = ['fa', 'en'];

function syncStorage() {
  return typeof chrome !== 'undefined' && chrome?.storage?.sync ? chrome.storage.sync : null;
}

export async function getSettings() {
  const s = syncStorage();
  if (!s) return { ...DEFAULT_SETTINGS };
  const got = await s.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...got };
  if (!LANGUAGES.includes(merged.language)) merged.language = DEFAULT_SETTINGS.language;
  if (!['auto', 'light', 'dark'].includes(merged.theme)) merged.theme = 'auto';
  merged.quality = Math.min(1, Math.max(0.5, Number(merged.quality) || DEFAULT_SETTINGS.quality));
  merged.notifications = Boolean(merged.notifications);
  return merged;
}

export async function setSetting(key, value) {
  const s = syncStorage();
  if (!s || !(key in DEFAULT_SETTINGS)) return;
  await s.set({ [key]: value });
}

/** Subscribe to settings changes; returns an unsubscribe function. */
export function onSettingsChanged(callback) {
  const ch = typeof chrome !== 'undefined' && chrome?.storage?.onChanged;
  if (!ch) return () => {};
  const handler = (changes, area) => {
    if (area === 'sync') callback(changes);
  };
  ch.addListener(handler);
  return () => ch.removeListener(handler);
}
