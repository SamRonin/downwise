# DownWise Privacy Policy

_Last updated: 2026-10-18 · applies to DownWise 1.0.x_

**The short version: DownWise collects nothing, sends nothing, and phones home nowhere.**
Everything you do with it stays inside your browser.

## What DownWise does

DownWise is a Chrome extension that downloads files you explicitly choose (via a right-click
menu) and — when you ask for it — converts images and audio between formats using encoders built
into your browser or shipped inside the extension.

## Data we collect

**None.** There is:

- no account system, no sign-up, no sign-in;
- no analytics, no telemetry, no crash reporting, no "anonymous usage statistics";
- no advertising, no trackers, no fingerprinting;
- no server, API, or backend operated by this project — there is literally nothing to send data to.

## Data transmission

DownWise makes network requests **only** to the URL of the file you asked to download — exactly
like your browser does when you open that file. It never:

- sends your URLs, downloads, history, settings, or file contents anywhere;
- connects to any third-party service;
- loads any remote code, scripts, styles, fonts, or configuration at runtime. Everything is
  packaged with the extension and the manifest's CSP forbids remote sources.

## Data stored on your machine

| What | Where | Contents | Removable |
|:---|:---|:---|:---|
| Settings | `chrome.storage.sync` | four values: language, theme, quality, notifications on/off | Options → change them; they're just preferences |
| Job history | `chrome.storage.local` | last 60 download/conversion entries: filename, URL, size, status, timestamp | Popup → **Clear**, or Options → History → **Clear history** |

Sync storage holds only those four preference values — never URLs, never file data. Job history
is local-only and never synced.

Converted files are handed straight to Chrome's download manager; DownWise keeps no copy of any
file you download or convert.

## Permissions rationale

| Permission | Purpose |
|:---|:---|
| `contextMenus` | Adds the right-click "DownWise — Smart Download" menu. |
| `downloads` | Saves files and tracks progress; powers "Show in folder". |
| `storage` | Persists the settings and local job history described above. |
| `scripting` | Runs a small helper inside the tab you clicked in to recover the real file URL when a site answers with an HTML page, and to fetch `blob:` URLs from that page. |
| `activeTab` | Grants the above temporary, per-click access to the tab you're interacting with — never a blanket pass over all tabs. |
| `notifications` | Optional "download complete / failed" toasts. Disable in Options → Download. |
| Site access `*://*/*` *(optional)* | **Not requested at install.** Needed only for format conversion, because the extension must read the file's bytes itself. Grant or revoke it in one click from the popup or Options → Permissions. |

## What happens on the sites you use it on

When you trigger a download, the extension fetches that file from its origin. To the site, this
looks like a normal request from your browser (cookies included, as if you had opened the file
yourself). DownWise never scrapes pages you didn't act on, and the recovery helper only reads
attributes of media elements related to the file you clicked.

## Children's privacy

DownWise is a general-purpose file downloader. It collects no data from anyone of any age, so
there is nothing to special-case.

## Changes to this policy

If the permission model or data handling ever changes, this file will be updated **before** the
version that changes it ships, and the changelog will note it.

## Contact

Questions about privacy or security? See [SECURITY.md](../SECURITY.md) for the reporting
channels, or open a discussion in the repository:
<https://github.com/SamRonin/downwise>
