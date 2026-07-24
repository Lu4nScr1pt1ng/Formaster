# Formaster

Automatic form filling with mocked data. Map any input on any page with a
visual picker, generate realistic fake data (CPF, CNPJ, addresses, phone
numbers, passwords, credit cards, dates, and more — Brazil or US locale where
it applies), and save the mapping as a per-site script — editable by hand,
exportable, importable, and extensible with your own JavaScript data
generators.

Built with [WXT](https://wxt.dev) + Svelte 5 + TypeScript + Zod + Tailwind v4.
Targets Chrome, Brave, and Opera (Chromium/MV3) and Firefox (MV3).

## How it works

- **Popup** — shows every script matching the current site (a page can have
  several) and runs them, with real per-field success/error feedback. From
  here you can also start the field picker, create an empty script scoped to
  the current page without picking anything, or open the script library.
- **Field picker** (content script) — a Shadow DOM overlay for hovering and
  clicking inputs on the live page, works with native inputs and custom
  framework components (React/Angular-style widgets included). Picked
  elements stay marked with a green outline and a ✕ button; clicking a
  mapped element again (or its ✕) unmaps it, so nothing can be picked twice.
  Native pickers (`<select>`, date/color inputs) are prevented from popping
  open mid-pick. Click "Finish" (or `Esc`) when done. From a script already
  open in the editor, "Add fields from page" re-enters the picker on the live
  page, pre-marks fields it already has, and appends/removes fields on that
  same script.
- **Options** — the script library, with search by name or URL:
  - Each script is an ordered sequence of **fields**, **delays**, and
    **conditional waits** (block until an element becomes enabled/visible/
    checked/exists), reorderable together.
  - Fields can be picked from a live page, written by hand (selector and all),
    or duplicated from an existing one.
  - Every selector candidate (id, name, CSS, XPath, …) can be individually
    enabled/disabled or added by hand — useful when a site's id looks
    plausible but is actually regenerated on every load.
  - Generators per field: built-in (CPF, CNPJ, RG, passport, phone, postal
    code/CEP/ZIP, city/state/neighborhood/street, dates, password, credit
    card, integer/decimal/boolean/lorem, UUID, …), a fixed value, or custom
    JavaScript with live preview. Most built-ins expose their own options
    right next to the generator picker (mask on/off, min/max, character
    classes, BR vs US locale, credit card brand, etc.).
  - Custom generators can declare their own options schema too, so any field
    using that generator gets matching controls (checkbox/number/select) —
    the same mechanism as the built-ins, just author-defined.
  - The whole script is also editable as raw JSON side-by-side with the visual
    form, kept in sync live in both directions.
  - Scripts and fields can be duplicated; import accepts a file or pasted
    JSON, validated before it's accepted.
- **Playground** (opened from the script library) — a bundled demo page
  covering every field type, a field disabled until another is filled, and
  two non-native "custom" widgets, wired to a ready-to-run example script.
  Lets you test mapping, generators, and conditional waits without needing a
  real site, and tweak/run scripts against a local form.
- **Custom generators** run inside a QuickJS WASM VM (`src/lib/generators/quickjs-runner.ts`),
  a real interpreted sandbox with no access to the page, the extension, or
  any browser API. Generator code is the *body* of a function receiving
  `helpers` (the built-in generators), `options` (this field's configured
  values, per its own options schema), and `fields` (every value already
  filled earlier in that run, so one field can build on another — e.g. a
  "confirm password" field reading `fields.password`). This works
  identically on every MV3 browser (Chrome, Brave, Opera, Firefox) with no
  per-browser special-casing — WebAssembly compilation is covered by the
  `wasm-unsafe-eval` CSP directive, unlike `eval`/`new Function`, which
  Chrome always blocks and modern Firefox blocks outside a sandboxed page it
  doesn't even support.

The whole UI (popup, options, playground) is responsive down to a ~300px-wide
viewport — narrow sidebars collapse into drawers, toolbars wrap instead of
overflowing, and side-by-side panels stack.

## Build from source

**Requirements:**
- Any OS (Linux, macOS, or Windows) — nothing platform-specific in the build.
- [Node.js](https://nodejs.org/) `^20.19.0` or `>=22.12.0` (required by Vite,
  which WXT uses internally). npm comes bundled with Node; no separate
  install needed. Check your version with `node --version`.

**Steps**, from the repository root, in order:

```sh
npm install              # installs exact dependency versions from package-lock.json
npm run build:firefox    # produces .output/firefox-mv3 — the exact code submitted to AMO
```

`npm run build:firefox` is the single build script (defined in
`package.json`) that runs every step: Svelte/TypeScript compilation via
Vite, and Tailwind CSS generation. No other manual steps are needed.

Other available scripts:

```sh
npm run dev             # Chrome/Brave/Opera, with HMR, for local development
npm run dev:firefox     # Firefox, with HMR, for local development
npm run build            # .output/chrome-mv3 — load unpacked in Chrome/Brave/Opera
npm run check            # svelte-check (TypeScript)
```

### Load in Chrome / Brave / Opera

1. `npm run build`
2. Open `chrome://extensions` (or the Brave/Opera equivalent), enable
   "Developer mode".
3. "Load unpacked" → select `.output/chrome-mv3`.
4. After rebuilding, click the extension's reload icon on that page — a
   rebuild doesn't hot-reload an already-loaded unpacked extension.

### Load in Firefox

1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`.
3. "Load Temporary Add-on" → select `.output/firefox-mv3/manifest.json`.
   (Temporary add-ons are removed when Firefox closes — reload after
   restarting, and after every rebuild.)

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) +
[Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).
