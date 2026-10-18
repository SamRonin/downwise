# Security Policy

## Supported versions

DownWise is a single-line Chrome extension; users are expected to run the latest release.

| Version | Supported |
|:---|:---|
| 1.0.x | ✅ Security fixes land here |
| < 1.0 | ❌ Not released — no support |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report privately through one of these channels (in order of preference):

1. **GitHub Security Advisory** — on the repository page, use
   *Security → Report a vulnerability* (`https://github.com/SamRonin/downwise/security/advisories/new`).
2. **Email** — [SamRonin@users.noreply.github.com](mailto:SamRonin@users.noreply.github.com).
   Please include `[DownWise Security]` in the subject line so it cannot get lost.

Include whatever helps reproduction: extension version, Chrome version, OS, the affected
URL/page type (no credentials please), and your assessment of impact.

**Response time:** we aim to acknowledge reports within **72 hours** and to publish a fix or a
mitigation plan after a reasonable grace period for users to update.

## Scope

DownWise is an **extension only** product:

- There is **no server**, no backend, no accounts, and no network service operated by this
  project. Anything outside the extension code in this repository (e.g., the websites users
  download from, GitHub's infrastructure, or Chrome itself) is out of scope.
- In scope: the service worker, converters, offscreen document, UI pages (popup / options /
  grant), messaging protocol, storage usage, and the permission model as shipped in
  `manifest.json`.

## Security design (and why we think it holds up)

- **No remote code.** All JavaScript ships in the package; CSP forbids remote sources. No
  eval / `new Function` (ESLint enforces `no-eval`, `no-implied-eval`, `no-new-func`).
- **Minimal permissions.** Required permissions are only what the feature set needs
  (`contextMenus`, `downloads`, `storage`, `scripting`, `activeTab`, `notifications`).
  Site access (`*://*/*`) is **optional** and never requested at install time.
- **User-gesture injection.** `chrome.scripting` only runs inside the tab the user actually
  clicked in, and only with `activeTab`'s temporary grant or previously granted optional access.
- **Payload validation.** Every fetched response is checked against its claimed type (headers)
  and its actual bytes (magic-number sniffing) before it is processed or saved.
- **Local-only persistence.** Settings live in `chrome.storage.sync` (a handful of booleans and
  numbers — no browsing data); job history stays in `chrome.storage.local` on the device and is
  user-clearable. Nothing is ever transmitted to project-operated endpoints — there are none.
- **No secrets policy.** The repository must contain no API keys, tokens or credentials.
  Anything accidentally committed is treated as compromised and rotated immediately — and this
  applies to all environments, without exception.

## Known design boundaries (not vulnerabilities, but know them)

- Downloaded and converted payloads are buffered in worker memory; the 250 MB fetch cap and the
  30/50 MB conversion caps exist to bound that.
- The recovery helper executes small self-contained functions inside pages the user clicked in;
  it only reads DOM attributes related to the media being downloaded and never exfiltrates
  anything.
- Conversion quality/behavior depends on Chromium's codecs; exotic files may fail to decode —
  failures are surfaced as typed errors rather than corrupt output.
