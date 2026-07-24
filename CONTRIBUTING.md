# Contributing to Formaster

Thanks for looking at this. The short version: fork the repo, make your change
on a branch, verify it actually works (`npm run test:e2e` — see Testing
below for what it does and doesn't cover), open a pull request that explains
what problem you're solving and why your approach solves it. The rest of
this document is detail on how to do that well in this particular codebase.

## Before you write any code

If you're fixing a bug, open an issue first only if you're not also opening
the PR — if you're sending a fix right away, the PR description can carry all
the context and a separate issue is just overhead. If you're proposing
something bigger (a new generator category, a change to the script schema, a
change to how the picker overlay or the fill sequence behaves), open an issue
first. Some of these have real tradeoffs baked in — the schema in
`src/lib/schema/script.ts` is the on-disk format for every script a user has
already saved, custom generators run in a real sandboxed interpreter rather
than `eval`/`new Function` specifically so this works under a strict CSP, the
picker overlay blocks `mousedown` so native `<select>`/date/color pickers
can't pop open mid-pick — and it's better to find out the maintainers see it
differently before you've written five hundred lines than in review.

For small, obviously-correct fixes (typo in a message, a missing null check,
a selector strategy that doesn't escape a value correctly), just send the PR.

## Setting up

```sh
npm install
npm run dev             # Chrome/Brave/Opera, with HMR, for local development
npm run dev:firefox     # Firefox, with HMR
npm run check            # svelte-check (TypeScript)
npm run test:e2e         # Playwright, against a real built extension — see Testing below
```

To try a production build: `npm run build` (or `build:firefox`), then load
`.output/chrome-mv3` as an unpacked extension (`.output/firefox-mv3/manifest.json`
as a temporary add-on in Firefox). See the README's "Build from source"
section for the exact steps and version requirements.

## Where things live

- `src/entrypoints/` — the four surfaces WXT builds separately:
  `background.ts` (service worker: picker lifecycle, badge, custom-generator
  execution), `content.ts` (injected into every page: runs the picker overlay
  and the actual fill), and the three UI pages — `popup/`, `options/`
  (the script library), `playground/`.
- `src/components/` — the Svelte components shared across those pages, mainly
  `ScriptEditor.svelte` (the script/field editor, used identically by both
  Options and the Playground) and its children (`FieldRow.svelte`,
  `WaitForStepRow.svelte`, `DelayStepRow.svelte`, `GeneratorOptionsEditor.svelte`,
  `SearchableSelect.svelte`, `CodeEditor.svelte`).
- `src/lib/schema/script.ts` — the Zod schema for a script, and the single
  source of truth for its shape. Every other part of the codebase (the
  filler, the editor, import/export, storage) works off types inferred from
  this file. `schemaVersion` exists for future migrations, but nothing
  reads/writes anything but `1` yet.
- `src/lib/generators/` — built-in data generators (`person.ts`,
  `document-br.ts`, `address-br.ts`, `address-us.ts`, `credit-card.ts`,
  `password.ts`, `misc.ts`), the registry that wires them to a
  `BuiltinGeneratorId` (`index.ts`), the per-generator UI-editable options
  table (`option-fields.ts`), and the QuickJS sandbox that runs
  user-authored custom generators (`quickjs-runner.ts`).
- `src/lib/picker/overlay.ts` — the `PickerOverlay` class: the shadow-DOM
  hover/click UI injected into the page during mapping.
- `src/lib/filler/` — `fill-script.ts` walks a script's steps and resolves
  each field's value; `set-value.ts` is where values actually get written
  into the DOM (native property setters plus dispatched events, so
  React/Angular-style controlled inputs pick the change up the same way a
  real keystroke would).
- `src/lib/selector/` — turning a picked DOM element into selector
  candidates, and resolving those candidates back to an element later.
- `src/lib/storage/` — thin wrappers over `browser.storage.local`, one file
  per concern (scripts, an in-progress mapping draft, etc.).

If you're not sure which of these your change belongs in, say so in the PR
description — that's a completely fine thing to be unsure about.

## Testing

`npm run test:e2e` (Playwright, `e2e/`) builds the real extension and drives
it in real Chromium — loading it unpacked, picking real elements on real
pages, running real fills, importing/exporting real files. Nothing in that
suite is mocked: `e2e/fixtures/extension.ts` launches a fresh, isolated
browser profile per test (so tests can't leak state into each other) and
waits on the actual `serviceworker` event and rendered UI state rather than
fixed delays, which is what keeps it fast and non-flaky. `npm run check`
(svelte-check) is the other automated gate; both run in CI on every PR.

- **`e2e/smoke.spec.ts`** — popup/options/playground all load with no
  uncaught errors.
- **`e2e/playground.spec.ts`** — runs the Playground's seeded script and
  checks actual field values, not just "filled" status: builtin generator
  options are honored (password length/charset), custom generators read
  `fields.*` (confirm-password) and their own options (username), and the
  conditional-wait-gated field unlocks and fills correctly.
- **`e2e/picker.spec.ts`** — maps and unmaps elements through the real "Add
  fields from page" flow against `test-fixtures/stripe-style-checkout.html`,
  including the regression check that a newly-picked field actually shows up
  live in the options tab that started the picker (this broke once before —
  see the comment in that file).
- **`e2e/conditional-wait.spec.ts`** — the `waitFor` step against
  `test-fixtures/conditional-address-form.html`, which is built to be
  self-verifying (fixed 350ms lookup delay, no jitter) and includes a
  negative case proving the wait is actually load-bearing.
- **`e2e/import-export.spec.ts`** — a script round-trips import → export →
  re-import byte-for-byte, and invalid JSON is rejected with a visible error
  rather than silently accepted.

What it deliberately doesn't cover: a real browser-action popup bubble isn't
something Playwright can drive at all (only pages it navigates itself), so
popup-specific button wiring is exercised indirectly rather than by clicking
the actual toolbar icon — see the comment at the top of
`playwright.config.ts`. There's also no Firefox project — Playwright doesn't
support loading an unpacked extension into its Firefox build, so anything
behind `wxt.config.ts`'s `browser === 'firefox'` branches, or Firefox-specific
MV3 behavior generally, needs a manual check (`npm run dev:firefox`) if
you're touching it.

Add a `test-fixtures/*.html` page (served by `e2e/fixtures/static-server.ts`
automatically — no wiring needed) when an existing one can't represent the
case you're testing, following the same self-verifying, jitter-free spirit as
the existing two (see `conditional-address-form.html`'s header comment).

If your PR fixes a bug, a test that fails without your fix and passes with
it is worth far more than the same claim in prose — that's what "explain why
this fixes it" should mean whenever it's practical to write one.

## Code style

`npm run check` has to be clean.

This codebase tries to avoid comments that explain *what* the code does (the
code already says that) in favor of comments that explain *why*, when the why
isn't obvious from reading it — a browser quirk, a constraint that would
otherwise look arbitrary, a tradeoff that was deliberately made one way. If
you're adding a comment, ask whether a reader six months from now would be
confused without it. If not, leave it out.

Don't add abstraction for a single call site. Don't add a config knob for
something that could just be a sensible fixed default. If you're fixing a
bug, fix the bug — resist the urge to refactor the surrounding code in the
same PR; it makes the change harder to review and harder to revert if
something's wrong with it. Separate cleanup PRs are welcome on their own.

New Svelte code should use runes (`$state`, `$derived`, `$effect`) — that's
what every existing component already uses, this project has no Svelte 4
legacy to stay consistent with.

## Sending the pull request

The PR template will ask for this, but to save you a round trip: explain what
was broken (or missing) and why your change is the right fix, not just a fix.
"This throws when X" is a good start; "this throws when X because Y assumes
Z, which isn't true when W" is what actually helps a reviewer trust the
change instead of just trusting you. Link an issue if there is one.

Keep PRs scoped to one thing. A bug fix plus an unrelated dependency bump
plus a rename is three PRs, not one — if something breaks later, an isolated
PR tells you immediately what caused it and a bundled one doesn't.

## License

By submitting a change, you're agreeing it can be distributed under this
project's MIT license (see [LICENSE](LICENSE)). If you're porting in code
from somewhere else — another extension, a Stack Overflow answer, a gist —
say so in the PR and make sure its license is actually compatible.
