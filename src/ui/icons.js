/**
 * DownWise inline icon set — one consistent 24px stroke grid (1.8px),
 * currentColor so icons inherit text color, zero external dependencies.
 */

const PATHS = {
  download: '<path d="M12 4v10"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 4.5-4.5a1.4 1.4 0 0 1 2 0L19 19"/>',
  video: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M10.2 9.4v5.2l4.6-2.6z" fill="currentColor" stroke="none"/>',
  audio: '<path d="M9 18V6l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
  document: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  archive: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5.5 9v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  other: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>',
  html: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13 5-2 14"/>',
  stream: '<circle cx="12" cy="12" r="2"/><path d="M7.7 16.3a6 6 0 0 1 0-8.6"/><path d="M16.3 7.7a6 6 0 0 1 0 8.6"/><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  moon: '<path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><circle cx="9" cy="6" r="2.3"/><circle cx="15" cy="12" r="2.3"/><circle cx="7" cy="18" r="2.3"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>',
  shieldCheck: '<path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  folder: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="m6.5 7 .5 12a1.8 1.8 0 0 0 1.8 1.7h6.4A1.8 1.8 0 0 0 17 19l.5-12"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  x: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4"/><path d="M12 17.2h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  zap: '<path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.5-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.5 11c-2 4.4-9.5 9-9.5 9z"/>',
};

export function icon(name, { size = 18, strokeWidth = 1.8, cls = '' } = {}) {
  const inner = PATHS[name];
  if (!inner) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" `
    + `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" `
    + `stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${inner}</svg>`;
}

/** Small helper for the popup empty-state illustration. */
export function emptyIllustration() {
  return `<svg width="120" height="86" viewBox="0 0 120 86" fill="none" aria-hidden="true">
    <path d="M30 62a16 16 0 0 1 2.4-31.8 22 22 0 0 1 42.4-5.4A15 15 0 0 1 88 54" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".38"/>
    <path d="M60 40v22" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <path d="m50 53 10 11 10-11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
    <path d="M42 74h36" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".3"/>
    <path d="m97 20 3 6.4 6.4 3-6.4 3-3 6.4-3-6.4-6.4-3 6.4-3z" fill="currentColor" opacity=".35"/>
    <circle cx="22" cy="26" r="2.4" fill="currentColor" opacity=".3"/>
  </svg>`;
}
