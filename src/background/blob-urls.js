/**
 * Blob-URL registry (service-worker side).
 * Blob URLs for converted files are created inside the offscreen document
 * (URL.createObjectURL is unavailable in service workers). The offscreen
 * document must stay alive while a chrome.downloads transfer still reads
 * from those URLs — otherwise the download dies mid-flight.
 *
 * This registry tracks every live blob URL so the offscreen host knows when
 * the document can safely be closed. Pure in-memory state, SW-lifetime only.
 */

/** All blob URLs handed out but not yet released. */
const alive = new Set();
/** downloadId → { url, kind } — downloads that still read from a blob URL. */
const byDownload = new Map();

/** Called as soon as a blob URL is created (before downloads.download). */
export function trackBlobUrl(entry) {
  if (entry?.url) alive.add(entry.url);
}

/** Called when the downloadId is known, to pin the URL to the transfer. */
export function trackBlobDownload(downloadId, entry) {
  if (downloadId != null && entry?.url) {
    alive.delete(entry.url);
    byDownload.set(downloadId, entry);
  }
}

/**
 * Drop the tracking entry for a settled download and return it
 * (the caller revokes the URL in the offscreen document).
 */
export function releaseBlobDownload(downloadId) {
  const entry = byDownload.get(downloadId) || null;
  byDownload.delete(downloadId);
  if (entry) alive.delete(entry.url);
  return entry;
}

/** Forget a URL that was revoked early (download start failure). */
export function discardBlobUrl(url) {
  alive.delete(url);
  for (const [id, entry] of byDownload) {
    if (entry.url === url) byDownload.delete(id);
  }
}

/** Any blob URL still referenced by an active download or pending handoff? */
export function hasLiveBlobs() {
  return alive.size > 0 || byDownload.size > 0;
}
