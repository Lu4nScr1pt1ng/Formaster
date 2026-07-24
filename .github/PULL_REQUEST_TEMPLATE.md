## What's broken or missing, and why this fixes it

<!--
Not just "what changed" -- a reviewer can read the diff for that. Explain the problem you hit
and why this is the right fix for it, not just a fix. If there's an issue for this, link it
(e.g. "Fixes #123"); if not, a couple of sentences of context is fine.
-->

## Testing

<!--
See CONTRIBUTING.md's Testing section for what `npm run test:e2e` does and doesn't cover.
If you added/changed behavior it doesn't reach (a real toolbar popup, anything Firefox-specific),
say what you did to check it manually instead.
-->

- [ ] `npm run check` && `npm run test:e2e` pass locally
- [ ] If this fixes a bug, I added a test that fails without the fix and passes with it — or
      explained below why that wasn't practical
- [ ] If this touches anything Firefox-specific (`wxt.config.ts`'s `browser === 'firefox'`
      branches), I checked it manually with `npm run dev:firefox` — the e2e suite is Chromium-only

## Scope check

- [ ] This PR does one thing (no unrelated refactors, renames, or dependency bumps bundled in)
