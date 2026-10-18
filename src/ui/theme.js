/**
 * Theme handling. data-theme="auto" lets CSS media queries decide;
 * light/dark pin the scheme. Includes a brief transition kick for smooth
 * switching without permanently animating everything.
 */

export const THEMES = ['auto', 'light', 'dark'];

export function applyTheme(theme) {
  const safe = THEMES.includes(theme) ? theme : 'auto';
  const root = document.documentElement;
  root.classList.add('theme-anim');
  root.dataset.theme = safe;
  setTimeout(() => root.classList.remove('theme-anim'), 320);
  return safe;
}

export function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function effectiveTheme(theme) {
  return theme === 'auto' ? systemTheme() : theme;
}

export function nextTheme(theme) {
  const i = THEMES.indexOf(theme);
  return THEMES[(i + 1) % THEMES.length];
}

export function watchSystemTheme(callback) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const handler = () => callback(systemTheme());
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
