/**
 * Context-menu construction & routing.
 * Menus are rebuilt when the user switches UI language, flips the
 * context-menu toggle, or changes the preferred conversion format.
 * Only REAL conversions are offered per context type (registry is the truth).
 *
 * Menu item ids are namespaced per context type — `dw-fmt-video-png` —
 * because the same output format (PNG) can be offered for several contexts
 * and chrome.contextMenus requires globally unique ids.
 */
import { t, DEFAULT_LANG } from '../i18n/index.js';
import { OUTPUT_FORMATS, menuOutputsForContext, isFrameCapture } from '../converters/registry.js';

export const MENU_ROOT_ID = 'dw-root';
export const MENU_ORIGINAL_ID = 'dw-original';
const MENU_FMT_PREFIX = 'dw-fmt-';
const MENU_FMT_RE = /^dw-fmt-([a-z]+)-([a-z0-9]+)$/;

const menuItemId = (contextType, formatId) => `${MENU_FMT_PREFIX}${contextType}-${formatId}`;

/**
 * @param {{ language?: string, contextMenus?: boolean, defaultImageTarget?: string }} settings
 */
export async function buildContextMenus(settings = {}) {
  const lang = settings.language || DEFAULT_LANG;

  await chrome.contextMenus.removeAll();

  // User opted out of the DownWise submenu entirely — leave it clean.
  if (settings.contextMenus === false) return;

  const preferred = settings.defaultImageTarget || '';

  chrome.contextMenus.create({
    id: MENU_ROOT_ID,
    title: t(lang, 'menu.parent'),
    contexts: ['image', 'video', 'audio', 'link'],
  });
  chrome.contextMenus.create({
    id: MENU_ORIGINAL_ID,
    parentId: MENU_ROOT_ID,
    title: t(lang, 'menu.original'),
    contexts: ['image', 'video', 'audio', 'link'],
  });

  for (const contextType of ['image', 'video', 'audio']) {
    for (const formatId of menuOutputsForContext(contextType, preferred)) {
      chrome.contextMenus.create({
        id: menuItemId(contextType, formatId),
        parentId: MENU_ROOT_ID,
        title: isFrameCapture(contextType, formatId)
          ? t(lang, 'menu.captureFrame', { format: OUTPUT_FORMATS[formatId].label })
          : t(lang, 'menu.convertTo', { format: OUTPUT_FORMATS[formatId].label }),
        contexts: [contextType],
      });
    }
  }
}

/** Map a click to { target } — null when the id is unknown. */
export function resolveMenuAction(menuItemId) {
  const id = String(menuItemId);
  if (id === MENU_ORIGINAL_ID) return { target: 'original' };
  const match = MENU_FMT_RE.exec(id);
  if (match && menuOutputsForContext(match[1]).includes(match[2])) {
    return { target: match[2] };
  }
  return null;
}

export function registerMenuHandlers(onAction) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const action = resolveMenuAction(info.menuItemId);
    if (action) onAction(info, tab, action);
  });
}
