/**
 * Context-menu construction & routing.
 * Menus are rebuilt when the user switches UI language.
 * Only REAL conversions are offered per context type (registry is the truth).
 */
import { t, DEFAULT_LANG } from '../i18n/index.js';
import { OUTPUT_FORMATS, menuOutputsForContext } from '../converters/registry.js';

export const MENU_ROOT_ID = 'dw-root';
export const MENU_ORIGINAL_ID = 'dw-original';
const MENU_FMT_PREFIX = 'dw-fmt-';

export async function buildContextMenus(lang = DEFAULT_LANG) {
  await chrome.contextMenus.removeAll();

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

  for (const contextType of ['image', 'audio']) {
    for (const formatId of menuOutputsForContext(contextType)) {
      chrome.contextMenus.create({
        id: `${MENU_FMT_PREFIX}${formatId}`,
        parentId: MENU_ROOT_ID,
        title: t(lang, 'menu.convertTo', { format: OUTPUT_FORMATS[formatId].label }),
        contexts: [contextType],
      });
    }
  }
}

/** Map a click to { target } — null when the id is unknown. */
export function resolveMenuAction(menuItemId) {
  const id = String(menuItemId);
  if (id === MENU_ORIGINAL_ID) return { target: 'original' };
  if (id.startsWith(MENU_FMT_PREFIX)) {
    const formatId = id.slice(MENU_FMT_PREFIX.length);
    if (OUTPUT_FORMATS[formatId]) return { target: formatId };
  }
  return null;
}

export function registerMenuHandlers(onAction) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const action = resolveMenuAction(info.menuItemId);
    if (action) onAction(info, tab, action);
  });
}
