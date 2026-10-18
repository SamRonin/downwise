# Pull Request

Thank you for contributing to DownWise! Please keep PRs focused — one feature or one fix each —
and complete this checklist before requesting review.

## What does this PR change?

<!-- feature / fix / docs / refactor / test / chore — and in one sentence: why? -->

## Type of change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior — explain below)
- [ ] 📝 Documentation only
- [ ] 🧹 Refactor / chore (no behavior change)

## Self-checklist

- [ ] `bun run test` passes (45 tests) — or `npm test`
- [ ] `bun run lint` is clean — or `npm run lint`
- [ ] The extension loads unpacked in Chrome 116+ and the affected flow was verified manually
- [ ] User-facing strings go through `src/i18n/` dictionaries (no hardcoded text) and both
      `fa.js` and `en.js` were updated — the parity test covers this
- [ ] New conversion targets are registered in `src/converters/registry.js` only if a **real
      encoder** exists (no renames-as-conversion)
- [ ] No new required permissions; `manifest.json` untouched, or changes are explained below
- [ ] No secrets, tokens, or credentials committed — ever
- [ ] Docs (README / docs/*) updated when behavior, limits, or UX changed

## Notes for reviewers

<!-- Screenshots/GIFs for UI changes; test URLs; edge cases you're unsure about. -->
