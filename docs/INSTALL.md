# Installing DownWise

DownWise is a Chrome extension (Manifest V3). This guide covers both install methods and every
troubleshooting case we know of.

> راهنمای فارسی: [INSTALL.fa.md](INSTALL.fa.md)

## Requirements

- **Chrome / Chromium 116 or newer** — including Edge, Brave, Opera, Vivaldi and other
  Chromium-based browsers of that generation. (116 is the first version with the complete
  `chrome.offscreen` + `chrome.runtime.getContexts` APIs that DownWise uses for SVG
  rasterization, audio conversion and blob-URL creation.)
- Roughly 5 MB of disk (fonts and icons are the bulk of it).
- No admin rights needed; no build step.

## Option 1 — Chrome Web Store

_Coming soon._ This section will be updated with the store link once the listing is live.

## Option 2 — Manual install (unpacked)

1. **Get the source**
   ```bash
   git clone https://github.com/SamRonin/downwise.git
   ```
   …or download the ZIP of the latest release from the repository and unzip it.
2. **Open the extensions page** — type `chrome://extensions` in the address bar.
3. **Enable Developer mode** — the toggle in the top-right corner.
4. **Load unpacked** — click the button and select the `downwise` folder (the one containing
   `manifest.json`).
5. **Pin it** — click the puzzle-piece icon in the toolbar and pin **DownWise** so the popup and
   its badge are always visible.
6. **Try it** — right-click any image and choose *“DownWise — Smart Download”* →
   *Download original file*, or *Download as PNG/JPEG/WebP*.

> Updating a manual install: pull the latest source (`git pull`), then press the ↻ reload icon on
> the DownWise card in `chrome://extensions`. Your settings and history are kept.

## First steps after install

- **Switch language** — Persian is the default. Use the Fa/EN button in the popup header or
  Options → Language. The change is instant and applies to the context menu too.
- **Pick a theme** — dark / light / auto, one click in the popup header or Options → Appearance.
- **Site access (optional)** — *original* downloads work out of the box. **Format conversion**
  needs site access because the extension must read the file's bytes itself. When you trigger a
  conversion without it, the job pauses with *“Access needed”* and a one-click grant button — or
  grant it proactively from the popup chip or Options → Permissions. You can revoke it anytime.

## Troubleshooting

### The context menu doesn't appear

1. Open `chrome://extensions` and press the ↻ **reload** icon on the DownWise card — menus are
   rebuilt when the service worker wakes up.
2. If that doesn't help, **remove** and **Load unpacked** again (a stale menu registry is rare
   but happens after browser updates).
3. The menu only appears on images, videos, audio elements and links — not on plain text or
   empty page areas.
4. Some pages (the Chrome Web Store itself, `chrome://` pages, the New Tab page) don't allow
   extension context menus.

### Conversion fails with “Access needed” / permission prompt

- Direct and original downloads never need site access. **Conversions do** — the extension's own
  fetch must be able to read the file's bytes (CORS bypass requires host permission).
- Click **“Enable access”** in the popup (the permission chip or the button inside the failed
  job) or go to Options → Permissions → *Enable access*. The browser will show a one-time
  confirmation; accept it and retry the job.
- You can revoke this access at any time in Options → Permissions → *Revoke access*.

### “A web page was returned instead of the file”

The site is protecting its media (hotlink protection, login wall, CDN rewrite). DownWise refuses
to save the wrong bytes and tries to recover the real file from the page automatically. If it
still fails: the file usually requires login — open the media in a tab (so you're authenticated),
then right-click it there and try again.

### “HLS/DASH streams and MSE videos are not supported”

The link points at a *playlist* (`.m3u8` / `.mpd`) or an in-memory stream rather than a media
file. Segments cannot be merged into a playable file without a remuxing tool, which DownWise
deliberately does not include. Download the original MP4/WebM if the site offers one.

### Corporate networks / managed browsers

- If `chrome://extensions` shows *“Extensions… disabled by your administrator”* or developer mode
  is blocked, your organization's policy prevents unpacked extensions. Ask your IT department —
  there is nothing the extension can do about policy.
- Some corporate proxies block non-browser requests; the service worker's fetch may fail while
  normal browsing works. Original downloads may still succeed (they go through Chrome's download
  stack) while conversions fail — this is the proxy, not a bug.
- In networks with SSL inspection, extension fetches follow the system trust store, so results
  match what your browser already trusts.

### Conversions of very large files stop

There are deliberate caps to keep memory usage sane: **250 MB** per fetched file, **30 MB** for
image conversion and **45 MB** for audio conversion. Files above the conversion caps can still be
downloaded as originals. Animated GIFs convert only their first frame — that's stated in the job
row when it happens.

### Still stuck?

Check the service worker console: `chrome://extensions` → DownWise → *service worker* link. Copy
any red messages into a [bug report](https://github.com/SamRonin/downwise/issues/new?template=bug_report.yml)
— it makes diagnosis dramatically faster.
