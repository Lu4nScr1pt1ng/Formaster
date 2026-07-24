## What's broken or missing, and why this fixes it

<!--
Not just "what changed" -- a reviewer can read the diff for that. Explain the problem you hit
and why this is the right fix for it, not just a fix. If there's an issue for this, link it
(e.g. "Fixes #123"); if not, a couple of sentences of context is fine.
-->

## Testing

<!--
There's no automated test suite here (see CONTRIBUTING.md) -- manual verification is the bar.
Tell us what you actually did: mapped which field(s) on which page, what generator/options you
set, and what you saw before vs. after your change. The Playground and test-fixtures/ are the
fastest way to check most of this without needing a real site.
-->

- [ ] I verified this manually (describe how above) — before and after, not just after
- [ ] `npm run check` passes locally
- [ ] If this touches the picker, content-script/background messaging, the QuickJS sandbox, or
      the manifest CSP, I checked it in both a Chromium browser and Firefox

## Scope check

- [ ] This PR does one thing (no unrelated refactors, renames, or dependency bumps bundled in)
