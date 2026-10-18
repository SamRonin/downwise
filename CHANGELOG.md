# Changelog

All notable changes to **DownWise** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-18

Initial release. 🎉

### Added

**Downloads**

- Smart context menu on images, videos, audio elements and links:
  *Download original file*, *Detect type & download* (links), and real conversion targets
  (*Download as PNG/JPEG/WebP* on images, *Download as WAV* on audio). Menu language follows the
  UI language and rebuilds on switch.
- HTML-response detection: every response is validated by **both** headers and magic-byte
  sniffing before it can be saved; an HTML page raises `HTML_RESPONSE` instead of silently saving
  garbage.
- Smart page-resource recovery: when a site answers with a page (hotlink protection, login wall),
  DownWise inspects the page you clicked in for better candidates — `data-*` full-size attributes,
  `srcset` (widest first), `<picture>/<source>` variants, `og:image`, `twitter:image`,
  `link[rel=image_src]` and direct-download `<a href>` links — then retries automatically.
- CORS fallback: when the service-worker fetch is blocked, bytes are fetched from inside the page
  (same-origin cookies, `blob:` URLs) and handed back base64-encoded.
- Byte-accurate streamed downloads with throttled progress reporting, plus a lightweight 1 KB
  `Range` probe before original downloads.

**Conversion (real, never faked)**

- Image → **PNG / JPEG / WebP**: raster inputs (PNG, JPEG, WebP, AVIF, GIF, BMP, ICO, HEIC where
  Chromium decodes them) are decoded with `createImageBitmap` (EXIF-orientation aware) and encoded
  on `OffscreenCanvas` inside the service worker; SVG inputs are rasterized in the offscreen
  document with intrinsic-size parsing (viewBox/width/height), upscaling of small icons to
  ≥ 1024 px and a 4096 px max side; exotic raster inputs that fail in the worker fall back to the
  offscreen document's full DOM codec stack.
- Audio → **WAV** (16-bit PCM): decoding via Web Audio (`decodeAudioData`) for MP3, WAV, OGG/Opus,
  FLAC, AAC/M4A and the audio track of MP4/WebM containers, then DownWise's own minimal RIFF WAV
  encoder (pure module, unit-tested).
- Quality slider (50–100 %) for JPEG/WebP output; JPEG output flattens transparency onto white.

**Pipeline & UX**

- Full job lifecycle with visible statuses: queued → preparing → fetching → converting → saving →
  downloading → completed / failed / canceled, plus a dedicated `action_required` state that
  surfaces an inline "Enable access" button when site access is missing.
- Popup (384 px) with active jobs and history (the store keeps the latest 60 jobs; the popup
  lists active work plus the 20 most recent finished jobs), retry / remove / show-in-folder
  actions, per-job progress bars, error and note rows, and a permission chip with one-click grant.
- Toolbar badge with active-job count and ✓/! result flashes; optional desktop notifications
  (clickable, opens the downloaded file's folder).
- Options page with six sections: Appearance (theme preview cards), Language, Download
  (quality slider + notifications), Permissions (grant/revoke), History, About.
- Permission grant page (`grant.html`) explaining site access before Chrome's prompt.
- Runtime language switching (fa ⇄ en) with full RTL/LTR handling — no browser restart; Persian
  is the default with Vazirmatn typography, English uses Inter. Persian numerals for sizes and
  counts via `Intl`.
- Dark / light / auto theme with instant switching everywhere.

**Privacy & security**

- Everything runs locally: no analytics, no telemetry, no accounts, no remote code, no network
  calls beyond the file you asked to download.
- Minimal required permissions (`contextMenus`, `downloads`, `storage`, `scripting`, `activeTab`,
  `notifications`); site access (`*://*/*`) is **optional** — never requested at install, needed
  only for format conversion, grantable and revocable at any time.
- Settings sync via `chrome.storage.sync`; job history strictly local (`chrome.storage.local`,
  max 60 jobs).

**Developer**

- No build step: vanilla ES modules loaded directly by Chrome (Manifest V3 module service
  worker).
- 45 unit tests (`node --test`) covering MIME tables, content sniffing, filename sanitation, the
  WAV encoder, i18n dictionary parity and registry honesty; ESLint (flat config) clean.
- Typed error codes with i18n-mapped messages — no raw English strings leak into the Persian UI.

### Known limitations (by design)

- No AVIF/SVG/MP3 **encoding** — Chromium provides no encoder for these, and renaming a file is
  not a conversion.
- No video transcoding — that would require bundling ffmpeg, which conflicts with the project's
  no-build, no-remote-code stance.
- No HLS (`.m3u8`), DASH (`.mpd`) or MSE streams — segment playlists cannot be merged into a
  playable file without remuxing, and MediaSource `blob:` URLs cannot be re-fetched.
- 250 MB hard cap per fetched file; 30 MB for image conversions and 45 MB for audio/video-frame
  conversions (converted payloads cross an internal base64 bridge).
- Animated images convert only their first frame (the UI tells you when this happens).
- Requires Chrome/Chromium 116+ (`chrome.runtime.getContexts` and `chrome.offscreen`).

### Updated in place (same release, hardened & expanded)

**Offscreen document lifecycle & memory hygiene**

- The offscreen document is now closed automatically after **30 s of idle time**
  (`chrome.offscreen.closeDocument()`) and transparently re-created on demand. "Idle" means zero
  in-flight conversion calls **and** zero downloads still reading an offscreen-created blob URL
  (tracked by a dedicated blob-URL registry) — so auto-closing can never kill a running transfer.
- `chrome.runtime.onSuspend` performs a final idle sweep; blob URLs are revoked on completion,
  cancellation and download-start failure.
- All temporary media resources are freed deterministically after every conversion: object URLs
  (`URL.revokeObjectURL`), `AudioContext.close()` + source disconnect + stream-track stops after
  MediaRecorder runs, canvas backing stores zeroed after frame capture, and `<video>` elements
  reset via `removeAttribute('src')` + `load()`.
- New zero-dependency **concurrency queue** (`src/lib/task-queue.js`): heavy conversions run two
  at a time (blob-URL hand-offs are serialized) so several simultaneous right-click conversions
  can no longer stack decode buffers and crash renderer memory.

**Converters**

- Audio → **WebM (Opus)** alongside WAV: recorded with the browser's own `MediaRecorder`
  (zero npm dependencies), with a user-selectable bitrate (64/96/128/192/256 kbps, default 128).
- Video → **PNG / JPEG / WebP frame capture** (Poster): the offscreen document seeks the video,
  rasterizes one frame on canvas and frees everything afterwards. Menu items are labelled
  *"Save frame as …"* — honest stills, never a container remux.
- Magic-byte sniffing hardened: HEIC/HEIF brand families (`heic/heix/hevc/…`), AVIF detection
  through compatible brands inside HEIF containers, M4A/M4B/M4P audio containers, and a validated
  MP3 frame-sync check (layer + bitrate bits) that rejects lookalike garbage. Truncated headers
  never throw.
- `Content-Disposition` support: the real filename (quoted, RFC 5987 `filename*` with UTF-8
  percent-decoding, legacy RFC 2047 encoded-words) now overrides the URL tail when servers
  reveal it — including path-stripping and control-character cleanup.

**Refactoring**

- Every runtime message type lives in one frozen catalogue (`src/lib/messages.js`); the service
  worker and offscreen routers are generated from it (`createRouter`) — no duplicated
  `onMessage` boilerplate, no raw string literals scattered in the code.
- Font loading is subsetted at the CSS level with `unicode-range`: Persian pages no longer
  download Inter and English pages no longer download Vazirmatn (the woff2 binaries stay
  untouched — no build step; see `docs/FONTS.md`).

**Settings (options page)**

- Preferred image conversion format (WebP/PNG/JPEG) — hoisted to the top of the context menu.
- Download behaviour: *ask where to save each file* vs. silent auto-save (per-download `saveAs`).
- Toggle to remove the DownWise submenu from the browser context menu entirely.
- WebM (Opus) bitrate selector for compressed audio output.

**Tests**

- 84 unit tests (`node --test`), now also covering: Content-Disposition filename extraction
  (quoted / `filename*` / RFC 2047 / paths / dotfiles), the concurrency queue (limit, ordering,
  error isolation), the message catalogue (frozen, unique, prefix-safe) and the extended magic
  bytes (HEIC/AVIF/MP3/WebM, truncated buffers). ESLint flat config stays clean.

[1.0.0]: https://github.com/SamRonin/downwise/releases/tag/v1.0.0
