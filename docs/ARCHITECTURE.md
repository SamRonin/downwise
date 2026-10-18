# DownWise — Architecture

A guided tour for contributors: module map, data flow, the messaging protocol, storage schema,
and the reasoning behind every deliberate limitation.

> Language note: this document exists in English only. The user-facing docs have Persian mirrors
> ([README.fa.md](../README.fa.md), [INSTALL.fa.md](INSTALL.fa.md)); the architecture doc stays
> English because it references identifiers verbatim.

## Design constraints (read first)

DownWise is a **Manifest V3 Chrome extension** with three non-negotiable properties:

1. **No build step.** Chrome loads the source tree directly — vanilla ES modules, including the
   module-type service worker. What you read is what runs.
2. **Honest conversions only.** `src/converters/registry.js` is the single source of truth. A
   format appears in the UI only when a real encoder exists. Nothing renames files and calls it
   conversion.
3. **Local-only.** No analytics, no remote code, no endpoints. The only network requests ever
   made are the ones needed to download the file you asked for.

Minimum Chrome version is **116** (`minimum_chrome_version` in `manifest.json`), because 116
completed the `chrome.offscreen` + `chrome.runtime.getContexts` pair that the offscreen document
relies on.

## Module map

```
downwise/
├── manifest.json                 MV3 manifest: permissions, optional host access, fa/en locales
├── _locales/                     Store-facing extName/extDesc (chrome.i18n, install-time only)
├── assets/
│   ├── fonts/                    Vazirmatn (fa) + Inter (en), variable woff2, OFL
│   └── icons/                    16 / 32 / 48 / 128 / 512 px PNGs
├── src/
│   ├── background/               ── the module service worker ──
│   │   ├── service-worker.js     entry point: bootstrap, menu rebuild on lang change, message router
│   │   ├── menu.js               context-menu construction (registry-driven) + click resolution
│   │   ├── pipeline.js           job lifecycle: guards → fetch/recover → convert → download → notify
│   │   ├── fetcher.js            guarded network layer: streamed fetch, Range probe, caps, HTML guard
│   │   ├── recovery.js           in-page candidate finder + in-page fetch (chrome.scripting)
│   │   └── offscreen-host.js     offscreen document lifecycle + blob-URL bridge (data: fallback)
│   ├── converters/
│   │   ├── registry.js           OUTPUT_FORMATS + availableOutputs() — the honesty contract
│   │   ├── index.js              convertFile(): picks service-worker path or offscreen path
│   │   ├── image.js              raster (OffscreenCanvas) + SVG rasterization (DOM, offscreen-only)
│   │   ├── audio.js              decodeAudioData → PCM (OfflineAudioContext, offscreen-only)
│   │   └── wav-encoder.js        pure 16-bit RIFF WAV encoder (no Chrome APIs; Node-tested)
│   ├── lib/
│   │   ├── mime.js               MIME/extension tables, kind classification, scheme checks
│   │   ├── sniff.js              magic-byte + text-heuristic content sniffing
│   │   ├── filename.js           sanitize, derive from URL, swap extensions
│   │   ├── settings.js           chrome.storage.sync settings with defaults + validation
│   │   ├── jobs.js               dwJobs store (serialized writes) + UI broadcast
│   │   ├── errors.js             DownWiseError, typed codes → i18n keys
│   │   ├── format.js             locale-aware bytes/times (Persian numerals via Intl)
│   │   ├── base64.js             bytes ⇄ base64 helpers (chunked, SW-safe)
│   │   └── branding.js           APP_NAME / VERSION / REPO_URL — single source of truth
│   ├── i18n/
│   │   ├── fa.js / en.js         dictionaries (key parity enforced by tests/i18n.test.js)
│   │   └── index.js              t(), RTL/LTR switching, data-i18n DOM localization
│   ├── ui/
│   │   ├── popup.html/.js/.css   384 px control center: active jobs, history, quick settings
│   │   ├── options.html/.js/.css six sections incl. theme preview cards + permission management
│   │   ├── grant.html/.js/.css   pre-prompt explanation page for site access
│   │   ├── theme.js              auto/light/dark application
│   │   └── icons.js              inline SVG icon set (no icon font, no images at runtime)
│   └── offscreen/
│       ├── offscreen.html        hidden document created on demand
│       └── offscreen.js          SVG rasterization, audio decode, blob-URL factory
└── tests/                        45 `node --test` tests over the pure modules
```

**Layering rule:** `lib/` and `converters/wav-encoder.js` are *pure* — no `chrome.*` calls — so
they run identically in the service worker, the offscreen document, and Node's test runner.
Everything else is an adapter around Chrome APIs.

## Data flow

### Original download (the "just save it" path)

```
 right-click on image/video/audio/link
        │
        ▼
 chrome.contextMenus.onClicked
        │  menu.resolveMenuAction() → { target: 'original' }
        ▼
 pipeline.handleMenuClick()
   ├─ guard: supportedScheme(url)?          http(s)/data/blob only
   ├─ guard: isStreamManifestUrl(url)?      .m3u8/.mpd → bail out with UNSUPPORTED_STREAM
   ├─ createJob({ status:'queued' })        ──► broadcastJobs() → popup/options
   ▼
 runJob(): status 'preparing'
        │
        ├─ data:/blob: URL ─────────────► chrome.downloads.download directly
        │                                  (workers cannot probe these)
        ▼
 fetcher.probeResource(url)               Range: bytes=0-1023, never throws
        │
        ├─ not reachable ────────────────► download anyway (browser stack may still succeed)
        │
        ├─ HTML response? ──► recovery.findPageCandidates(tabId, frameId, kind, url)
        │                        in-page scan: data-* attrs, srcset (widest first),
        │                        <picture>/<source>, og:image, twitter:image,
        │                        link[rel=image_src], matching <a href>
        │                      probe top 3 candidates → first non-HTML wins
        │                      none? → DownWiseError('RECOVERY_FAILED' | 'HTML_RESPONSE')
        ▼
 chrome.downloads.download({ url, conflictAction:'uniquify' })
        │
        ▼
 downloads.onChanged ──► complete / interrupted → update job, revoke temporaries,
                         notify (clickable → chrome.downloads.show), badge flash ✓/!
```

### Conversion (the real-encoder path)

```
 menu click → { target: 'png'|'jpeg'|'webp'|'wav' }
        │
        ▼
 runJob() → status 'preparing'
        │
        ├─ blob: URL ──► recovery.pageFetch()  in-page fetch of the blob
        │                MSE/cross-origin blobs can't be re-fetched → UNSUPPORTED_STREAM
        │
        ▼ (http(s) URLs)
 fetcher.fetchResource(url)
   • streamed body, byte-accurate progress (throttled to ~3 updates/s)
   • hard cap 250 MB → FILE_TOO_LARGE
   • HTML guard: Content-Type header AND magic-byte sniff → HTML_RESPONSE
        │
        ├─ HTML_RESPONSE ──► recovery: candidates → fetch top 2 (recoverAndFetch)
        ├─ CORS ──────────► recovery.pageFetch() (same-origin cookies inside the page)
        │                    still failing without host access?
        │                    → status 'action_required' + PERMISSION_REQUIRED
        │                      popup shows an inline "Enable access" button → DW_RETRY
        ▼
 sniffType(bytes) → sourceKind / sourceMime        trust bytes, not headers
   ├─ stream  → UNSUPPORTED_STREAM
   ├─ fmt.kind ≠ sourceKind → KIND_MISMATCH (no fake image-from-video)
   └─ size cap: image 30 MB · audio 45 MB → TOO_LARGE_FOR_CONVERSION
        │
        ▼
 converters.convertFile(bytes, source, target, { quality })
        │
        ├─ raster image ──► convertRasterImage()      IN THE SERVICE WORKER
        │                   createImageBitmap (EXIF-aware) → OffscreenCanvas →
        │                   canvas.convertToBlob(PNG | JPEG(flattened white) | WebP)
        │                   decode failure? → retry via offscreen (full DOM codec stack)
        ├─ SVG ──────────► convertSvgImage()          IN THE OFFSCREEN DOCUMENT
        │                 parse intrinsic size (viewBox/width/height) →
        │                 Image element → canvas (upscale to ≥1024 px, cap 4096 px side)
        ├─ audio ────────► decodeAudioToWav()         IN THE OFFSCREEN DOCUMENT
        │                 OfflineAudioContext.decodeAudioData → wav-encoder.js (16-bit PCM)
        ▼
 makeBlobUrl(bytes, mime)                    offscreen-host.js
   • URL.createObjectURL does NOT exist in service workers
   • offscreen document creates the blob: URL
   • if offscreen is unavailable → inline data: URL fallback (kind:'data')
        │
        ▼
 chrome.downloads.download({ url: blobUrl, filename: name.png|jpg|webp|wav })
        │
        ▼
 downloads.onChanged: complete → revoke the blob URL (via offscreen), job 'completed',
                      notification, badge flash, broadcastJobs()
```

### Live UI updates

`jobs.js` owns the truth (`chrome.storage.local`); the popup never reads storage itself.
Every mutation funnels through `broadcastJobs()`:

```
 job mutation (create/update/clear) ──► broadcastJobs()
        └─ chrome.runtime.sendMessage({ type:'DW_JOBS_UPDATED', jobs })
              └─ popup listener → re-render (jobs, badge counts, permission chip)
```

The toolbar badge is recomputed from the job list after every mutation
(`updateBadge()`), with a colored ✓/! flash on completion/failure.

## Messaging protocol

All messages travel over `chrome.runtime.sendMessage`. Typed payloads, JSON-safe (base64 for
bytes). The service worker ignores anything it doesn't know; the offscreen document only answers
`DW_OFFSCREEN_*`.

### Extension pages → service worker

| Type | Direction | Payload | Response |
|:---|:---|:---|:---|
| `DW_PING` | any extension page / tooling → SW (health check) | — | `{ ok, pong: true }` |
| `DW_GET_STATE` | popup → SW | — | `{ ok, jobs, settings, hostAccess }` |
| `DW_RETRY` | popup → SW | `{ jobId }` | `{ ok }` (re-queues a finished job) |
| `DW_REMOVE_JOB` | popup → SW | `{ jobId }` | `{ ok }` (active jobs are protected) |
| `DW_CLEAR_HISTORY` | popup/options → SW | — | `{ ok, count }` (finished jobs removed) |

### Service worker → extension pages (broadcast)

| Type | Sender | Payload | Notes |
|:---|:---|:---|:---|
| `DW_JOBS_UPDATED` | `jobs.broadcastJobs()` | `{ jobs }` | Full list, sent after every mutation; popup re-renders from it. |

### Service worker ↔ offscreen document

The offscreen document (`src/offscreen/offscreen.js`) listens only for the `DW_OFFSCREEN_` prefix.
The SW side (`offscreen-host.js`) wraps calls with a 180 s timeout and lazy-creates the document
with reasons `DOM_PARSER` + `AUDIO_PLAYBACK`.

| Type | Direction | Payload | Response |
|:---|:---|:---|:---|
| `DW_OFFSCREEN_PING` | SW → offscreen | — | `{ pong: true }` |
| `DW_OFFSCREEN_CONVERT_IMAGE` | SW → offscreen | `{ base64, mime, target, quality }` | `{ base64, mime, size, width, height }` |
| `DW_OFFSCREEN_CONVERT_AUDIO` | SW → offscreen | `{ base64 }` | `{ base64, mime, size, durationSec, sampleRate, channels }` |
| `DW_OFFSCREEN_MAKE_BLOB_URL` | SW → offscreen | `{ base64, mime }` | `{ url }` (`blob:` URL created in a DOM context) |
| `DW_OFFSCREEN_REVOKE_BLOB_URL` | SW → offscreen | `{ url }` | `{ revoked: true }` |

Bytes cross this bridge as base64 (`lib/base64.js`, chunked encoding) because messages must be
JSON-serializable. That cost is one reason conversions have tighter caps (30/45 MB) than plain
fetches.

## Storage schema

### `chrome.storage.sync` — settings (key: each field directly)

Written by `lib/settings.js`; every read is validated and merged over the defaults, so corrupt or
absent values can never break the UI.

| Key | Type | Default | Values |
|:---|:---|:---|:---|
| `language` | string | `'fa'` | `'fa'` \| `'en'` (invalid values reset to default) |
| `theme` | string | `'auto'` | `'auto'` \| `'light'` \| `'dark'` |
| `quality` | number | `0.92` | `0.5 … 1` (clamped; JPEG/WebP encoder quality) |
| `notifications` | boolean | `true` | desktop toasts on completion/failure |

Sync storage was chosen because these are exactly the "four small preferences" it is designed
for. No browsing data, URLs, or history ever enter `sync`.

### `chrome.storage.local` — job history (key: `dwJobs`)

Owned by `lib/jobs.js`. An **array of job objects, newest first**, capped at **60** entries.
All writes go through a serialized promise chain (`withLock`) so concurrent jobs can't corrupt
the read-modify-write cycle.

Job shape (fields from `createJob()` plus patches applied during the pipeline):

```js
{
  id: 'uuid-v4',              // crypto.randomUUID()
  url: 'https://…',           // may be rewritten by recovery to the better candidate
  name: 'photo.jpg',          // sanitized; extension replaced on conversion
  kind: 'image',              // 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'
                              //   ('html'/'stream' exist transiently from the sniffer, not persisted as targets)
  target: 'original',         // 'original' | 'png' | 'jpeg' | 'webp' | 'wav'
  status: 'fetching',         // see state machine below
  progress: 64,               // 0–100 | null (null = indeterminate bar)
  size: 1234567,              // bytes (input during conversion, output when saved)
  mime: 'image/webp',         // detected/confirmed MIME type | null
  info: { width: 1920, height: 1080 },   // images: { width, height }
                                          // audio: { durationSec, sampleRate, channels }
                                          // null otherwise
  errorCode: 'CORS',          // DownWiseError code | null (UI maps it to errors.<code>)
  downloadId: 42,             // chrome.downloads id | null
  note: 'notes.animatedImage',// optional i18n key ('notes.animatedImage', 'notes.jpegFlatten')
  createdAt: 1710000000000,
  updatedAt: 1710000000500,
  finishedAt: null,           // set on completed/failed/canceled
  context: { tabId: 7, frameId: 0 },   // set at creation; drives in-page recovery targets
}
```

**Status state machine**

| Status | Phase | Meaning |
|:---|:---|:---|
| `queued` | active | accepted, waiting to run |
| `preparing` | active | worker picked it up |
| `fetching` | active | streaming bytes (progress available) |
| `converting` | active | inside a real encoder |
| `saving` | active | encoding done, handing to `chrome.downloads` |
| `downloading` | active | Chrome is writing the file |
| `action_required` | active* | parked until the user grants site access (inline retry button) |
| `completed` | terminal | download finished; `finishedAt` set |
| `failed` | terminal | `errorCode` explains why; retryable |
| `canceled` | terminal | user canceled the browser download; retryable |

`clearFinishedJobs()` removes everything except the active statuses; `DW_REMOVE_JOB` refuses to
remove a job that is still running.

## Conversion pipelines in detail

### Raster image → PNG/JPEG/WebP (service worker)

1. `createImageBitmap(blob, { imageOrientation: 'from-image' })` — Chromium decodes with its own
   codecs: PNG, JPEG, WebP, AVIF, GIF, BMP, ICO, HEIC where the build supports it; EXIF rotation
   is honored.
2. `OffscreenCanvas(width, height)`. For JPEG the canvas is first flooded with white (JPEG has no
   alpha — the UI adds a `notes.jpegFlatten` note when transparency was flattened).
3. `canvas.convertToBlob({ type, quality })` — PNG ignores quality; JPEG/WebP honor the settings
   slider (0.5–1).
4. If the worker decode throws (exotic ICO/HEIC variants), the exact same conversion re-runs in
   the offscreen document, which has the full DOM codec stack.

### SVG → PNG/JPEG/WebP (offscreen document — DOM required)

1. The markup is read as text first: `parseSvgIntrinsicSize()` extracts `width`/`height`/`viewBox`
   so sizeless SVGs keep their aspect ratio.
2. The blob is loaded into an `Image` element and drawn onto a canvas. Small icons are upscaled to
   a width of ≥ 1024 px (so a 24 px icon doesn't export at 24 px); the longer side is capped at
   4096 px.
3. Encoding is identical to the raster path.

### Audio → WAV (offscreen document — Web Audio required)

1. `OfflineAudioContext.decodeAudioData()` accepts MP3, WAV, OGG/Opus, FLAC, AAC/M4A — and the
   audio track of MP4/WebM containers.
2. Channel data (one `Float32Array` per channel) is handed to `wav-encoder.js`, DownWise's own
   minimal RIFF writer: 44-byte header, 16-bit signed PCM, per-sample clamp. It's pure
   JavaScript, which is why it's unit-tested in Node (`tests/wav-encoder.test.js`).

### Why the offscreen document exists at all

Three service-worker gaps force it:

- **No `URL.createObjectURL` in workers.** `chrome.downloads.download()` accepts `blob:` URLs,
  but the SW cannot create them. MV3's answer is `chrome.offscreen` — a hidden DOM document
  DownWise creates on demand (reasons: `DOM_PARSER`, `AUDIO_PLAYBACK`). It creates the blob URL,
  the SW downloads it, and `downloads.onChanged` revokes it after completion. If the offscreen
  API is unavailable (old Chromium builds, some headless environments), `makeBlobUrl()` falls back
  to an inline `data:` URL — heavier for big files, but functional everywhere.
- **No `OfflineAudioContext` / `decodeAudioData` in workers.** Audio decoding therefore *must*
  happen in a DOM context.
- **No `Image` element in workers.** SVG rasterization needs one (raster inputs don't —
  `createImageBitmap` handles them natively, so they convert right in the worker).

## Why certain limitations exist (on purpose)

| Limitation | Reason |
|:---|:---|
| No AVIF/SVG/MP3 **encoding** | Chromium's canvas encodes exactly PNG/JPEG/WebP, and no browser-side MP3 encoder exists. Shipping a renamed file would be lying; shipping a WASM encoder conflicts with the no-build/no-remote-code stance. |
| No video transcoding | Would require bundling ffmpeg — tens of MB, a build toolchain, and a large attack surface. Out of scope by design. |
| No HLS/DASH/MSE | `.m3u8`/`.mpd` are playlists of segments; merging them into a playable file needs remuxing (see above). MSE `blob:` URLs reference in-memory `MediaSource` buffers that cannot be re-fetched at all. Both are detected and rejected with `UNSUPPORTED_STREAM`. |
| 250 MB fetch cap | Every fetched payload is buffered in worker memory (`Uint8Array` chunks assembled into one array). The cap bounds memory usage and prevents tab-independent runaway allocations. |
| 30 MB image / 45 MB audio conversion caps | Converted bytes cross the messaging bridge to the offscreen document **as base64** (+33% size, JSON-serialized). The caps keep peak memory and message payloads sane. |
| 25 MB cap for in-page fallback fetches | `recovery.pageFetch()` ships bytes back base64-encoded from inside the page (`btoa` in chunks); 25 MB keeps that round-trip responsive. Above it the path fails fast with `FILE_TOO_LARGE`. |
| First frame only for animated images | `createImageBitmap` decodes a single frame. A full frame-by-frame re-encode is a (future) feature, not a silent truncation — the UI notes it when it happens. |
| Original downloads don't need site access, conversions do | Originals go through Chrome's own download stack (`chrome.downloads`), which already has the file. Conversions read and decode the bytes in the extension, which requires host permission for CORS-free fetch. |
| Custom i18n instead of `chrome.i18n` | `chrome.i18n` fixes the locale at browser start and cannot switch at runtime. DownWise's dictionaries (`src/i18n/`) switch instantly, and the parity test keeps `fa`/`en` key-identical. |

## Testing strategy

- **45 Node tests** (`node --test`, `bun run test`) cover the pure modules: MIME tables,
  magic-byte sniffing, filename sanitation, the WAV encoder, i18n dictionary parity, and the
  registry's honesty (no phantom formats, `availableOutputs()` correctness).
- Everything touching `chrome.*` is verified by **manual unpacked-install testing**: menu flows,
  HTML-response recovery, permission states (`action_required` → grant → retry), both languages
  and all three themes.
- Debug handle: the service worker exposes `self.DownWise = { handleMenuClick, retryJob, version }`
  for use from `chrome://serviceworker-internals` and automated integration tests. It runs in an
  isolated worker global — nothing is exposed to web pages.
