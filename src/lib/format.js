/**
 * Locale-aware formatting (bytes, relative time, durations).
 * Pure module — also imported by Node tests.
 */

function intlLocale(lang) {
  return lang === 'fa' ? 'fa-IR' : 'en-US';
}

export function formatBytes(bytes, lang = 'en') {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : 1;
  const num = new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: digits }).format(v);
  return `${num} ${units[i]}`;
}

export function formatRelativeTime(timestamp, lang = 'en', now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(lang === 'fa' ? 'fa' : 'en', { numeric: 'auto' });
  let diff = (timestamp - now) / 1000; // seconds
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  diff /= 60;
  if (abs < 3600) return rtf.format(Math.round(diff), 'minute');
  diff /= 60;
  if (abs < 86400) return rtf.format(Math.round(diff), 'hour');
  diff /= 24;
  if (abs < 2592000) return rtf.format(Math.round(diff), 'day');
  diff /= 30;
  if (abs < 31536000) return rtf.format(Math.round(diff), 'month');
  diff /= 12;
  return rtf.format(Math.round(diff), 'year');
}

/** 3:05 / 1:02:30 (Latin digits — compact and universal). */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatNumber(n, lang = 'en') {
  return new Intl.NumberFormat(intlLocale(lang)).format(Number(n) || 0);
}
