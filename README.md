# Formaster

Automatic form filling with mocked data. Map any input on any page with a
visual picker, generate realistic fake data (CPF, CNPJ, addresses, phone
numbers, dates, and more), and save the mapping as a per-site script —
editable by hand, exportable, importable, and extensible with your own
JavaScript data generators.

Built with [WXT](https://wxt.dev) + Svelte 5 + TypeScript + Zod + Tailwind v4.
Targets Chrome, Brave, and Opera (Chromium/MV3) and Firefox (MV3).

## How it works

- **Popup** — shows every script matching the current site (a page can have
  several) and runs them, with real per-field success/error feedback. Also
  starts the field picker and links to the script library.
- **Field picker** (content script) — a Shadow DOM overlay for hovering and
  clicking inputs on the live page, works with native inputs and custom
  framework components. Click "Finish" (or `Esc`) when done. From a script
  already open in the editor, "Add fields from page" re-enters the picker on
  the live page and appends the new fields to that same script.
- **Options** — the script library, with search by name or URL:
  - Each script is an ordered sequence of **fields** and **waits**, reorderable
    together (a delay can go anywhere, including first).
  - Fields can be picked from a live page, written by hand (selector and all),
    or duplicated from an existing one.
  - Every selector candidate (id, name, CSS, XPath, …) can be individually
    enabled/disabled or added by hand — useful when a site's id looks
    plausible but is actually regenerated on every load.
  - Generators per field: built-in (CPF, CNPJ, phone, address, dates, …),
    a fixed value, or custom JavaScript with live preview.
  - The whole script is also editable as raw JSON side-by-side with the visual
    form, kept in sync live in both directions.
  - Scripts and fields can be duplicated; import accepts a file or pasted
    JSON, validated before it's accepted.
- **Custom generators** run inside a QuickJS WASM VM (`src/lib/generators/quickjs-runner.ts`),
  a real interpreted sandbox with no access to the page, the extension, or
  any browser API. Generator code receives `helpers` (the built-in
  generators), `options`, and `fields` (every value already filled earlier in
  that run, so one field can build on another). This works identically on
  every MV3 browser (Chrome, Brave, Opera, Firefox) with no per-browser
  special-casing — WebAssembly compilation is covered by the
  `wasm-unsafe-eval` CSP directive, unlike `eval`/`new Function`, which
  Chrome always blocks and modern Firefox blocks outside a sandboxed page it
  doesn't even support.

## Develop

```sh
npm install
npm run dev            # Chrome/Brave/Opera, with HMR
npm run dev:firefox    # Firefox, with HMR
```

## Build

```sh
npm run build           # .output/chrome-mv3 — load unpacked in Chrome/Brave/Opera
npm run build:firefox   # .output/firefox-mv3 — load temporarily in Firefox
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
