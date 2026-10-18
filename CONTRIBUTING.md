# Contributing to DownWise

First off — thank you. Every issue, translation and pull request is appreciated.
This document gets you from `git clone` to a merged PR with as little friction as possible.

> نسخهٔ فارسی این سند: [CONTRIBUTING.fa.md](CONTRIBUTING.fa.md)

## Project philosophy (read this first)

Three ground rules shape every technical decision here:

1. **Honest conversions only.** A feature is offered only when a real encoder exists. Renaming
   `.webm` to `.mp4` is *not* conversion and will never ship.
2. **No build step, vanilla ESM.** The source tree is what Chrome loads. No bundlers, no
   transpilers, no frameworks. Keep new code plain ES modules.
3. **Local-only privacy.** No analytics, no remote code, no data exfiltration — not even
   "anonymized" telemetry. Don't add network calls beyond the file the user asked to download.

## Setting up a development environment

Prerequisites:

- **Node.js 18+** (for the test runner and ESLint)
- **bun** (preferred) or **npm** as the package runner
- **Chrome / Chromium 116+** for manual testing (Edge/Brave work too)

```bash
git clone https://github.com/SamRonin/downwise.git
cd downwise
bun install        # or: npm install
bun run test       # or: npm test        → 45 unit tests must pass
bun run lint       # or: npm run lint    → ESLint must be clean
```

Load the extension into your browser:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `downwise` folder

After editing code, hit the ↻ reload icon on the DownWise card in `chrome://extensions`, then
reload any open pages that use it.

## Running tests

```bash
bun run test
```

The suite is plain `node --test` (45 tests) and covers only the **pure modules** — MIME tables,
magic-byte sniffing, filename sanitation, the WAV encoder, i18n dictionary parity and the
conversion registry's honesty. Files like `src/lib/*.js` and `src/converters/wav-encoder.js` are
deliberately free of Chrome APIs so they stay testable in Node.

Anything touching `chrome.*` (service worker, UI, offscreen document) can't be unit-tested this
way — verify it **manually**:

- Right-click flows: image → convert to WebP; audio → convert to WAV; a link that answers with
  HTML → recovery kicks in.
- Permission states: revoke site access in Options, confirm conversion jobs land in
  `action_required` with an inline grant button.
- Both languages and all three themes, at minimum once each.

## Code style

- **ES modules only** (`import`/`export`); `"type": "module"` is already set.
- **No dependencies at runtime.** Dev dependencies (eslint) live only in `package.json`.
- Formatting is not enforced by a formatter — match the surrounding code (2-space indent,
  trailing commas, double quotes, semicolons).
- ESLint flat config lives in `eslint.config.js`; `no-undef` and `eqeqeq` are errors. Run
  `bun run lint` before committing.
- Every module starts with a short JSDoc header explaining *why* it exists — keep that habit.
- Error handling uses the typed `DownWiseError` with a code from `src/lib/errors.js`; user-facing
  text always goes through the i18n dictionaries, never string literals.

## Commit style: Conventional Commits

```
feat(converters): upscale small SVGs before rasterizing
fix(pipeline): revoke blob URLs after interrupted downloads
docs(readme): correct the 50 MB audio conversion cap
refactor(i18n): extract fallback resolution into getDict
test(sniff): add WEBP/VP8 signature cases
```

Rules of thumb:

- `type(scope): summary` — types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`.
- Scope is the module name (`pipeline`, `fetcher`, `popup`, `options`, `i18n`, `image`, …).
- Summary in English, imperative mood, no trailing period; lowercase after the colon.
- Squash-friendly small commits are preferred over giant mixed ones.

## Pull request process

1. Fork, then create a branch from `main`:
   `git checkout -b feat/my-feature`
2. Make your change; keep PRs focused (one feature or one fix per PR).
3. Verify locally: `bun run test` and `bun run lint` both pass; the extension loads and the
   affected flow works in the browser.
4. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) — tick every checkbox.
5. Push and open the PR against `main`. A maintainer reviews it; expect feedback or changes
   requested rather than silence.

If your change touches the manifest, permissions, or anything privacy-related, call it out in the
PR description explicitly.

## Adding a translation

DownWise ships its own dictionaries because `chrome.i18n` cannot switch language at runtime.

1. Copy `src/i18n/en.js` to `src/i18n/<code>.js`.
2. Translate the **values** only. Keep every key; keep `{placeholders}` intact; keep `meta.dir`
   correct (`rtl` or `ltr`).
3. Register the language in `src/i18n/index.js` (add to `DICTS` and `LANGUAGES`).
4. Add the store-facing strings in `_locales/<code>/messages.json` (`extName`, `extDesc`).
5. Run `bun run test` — the **parity test** fails when a dictionary is missing keys relative to
   `fa.js`/`en.js`, so incomplete translations cannot slip through.
6. For RTL languages, smoke-test popup and options in both themes; layout uses CSS logical
   properties, so surprises should be rare — but they happen.

New languages are also welcome for the docs (`README.fa.md`-style mirrors) — ask first in an
issue so the structure stays consistent.

## Security & secrets

- **Never commit secrets** — API keys, tokens, credentials, signing keys. This repo should have
  none, and PRs containing them will be rejected; if one slips in, treat it as compromised and
  rotate it.
- Security vulnerabilities are **not** reported via public issues. See
  [SECURITY.md](SECURITY.md) for the private reporting process.

## Licensing

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers the project.
