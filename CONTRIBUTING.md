# Contributing to Formaster

Thanks for looking at this. The short version: fork the repo, make your change
on a branch, verify it actually works (see Testing below — there's no
automated suite to lean on here), open a pull request that explains what
problem you're solving and why your approach solves it. The rest of this
document is detail on how to do that well in this particular codebase.

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
npm run check            # svelte-check (TypeScript) — this is the only automated check there is
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

There is no automated test suite — `npm run check` only type-checks. That
makes manual verification the actual bar for a change here, not an
afterthought before it.

- **The Playground** (`Open playground` in the script library, or
  `/playground.html` in the built extension) is the fastest way to check
  anything touching generators, the fill logic, or conditional waits — it
  bundles every field type plus a disabled-until-filled field, against a
  seeded example script, with nothing external to set up.
- **`test-fixtures/*.html`** are static pages purpose-built for cases a
  simple form doesn't exercise: a card-number/expiry/CVC group with live
  input formatting, and a fully custom (non-`<select>`) combobox — open one
  with a local static server (or `file://`, if your browser profile allows
  extensions to read `file://` pages) and map/run a script against it.
- **Picker changes** need a real load-unpacked extension and a real page —
  the shadow-DOM overlay, hover highlighting, and the mousedown-blocking
  guard around native pickers can't be meaningfully checked any other way.
- **Cross-browser changes**: if you're touching anything in
  `src/lib/generators/quickjs-runner.ts`, the CSP in `wxt.config.ts`, or
  content-script/background messaging, verify in both a Chromium browser and
  Firefox — MV3 behavior between them isn't identical everywhere.

If your PR fixes a bug, say in the description exactly what you did to
reproduce it before your fix and confirm it's gone after — that's what
"explain why this fixes it" means without an automated test to point at.

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
