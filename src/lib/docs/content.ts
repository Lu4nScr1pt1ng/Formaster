/**
 * All documentation content, as structured data rather than markdown. This
 * is rendered by a handful of small block components (`DocBlock.svelte` and
 * friends) with no runtime markdown parsing or syntax highlighting — the
 * docs page is meant to open instantly, so the content itself is just plain
 * objects the search index and the renderer both read directly.
 */

export type InlineText = string;

export type DocBlock =
  | { type: 'p'; text: InlineText }
  | { type: 'h3'; id: string; text: string }
  | { type: 'list'; items: InlineText[]; ordered?: boolean }
  | { type: 'code'; code: string; lang?: 'json' | 'js' | 'text' }
  | { type: 'table'; headers: string[]; rows: InlineText[][] }
  | { type: 'callout'; kind: 'tip' | 'warning'; text: InlineText };

export interface DocSection {
  id: string;
  title: string;
  category: string;
  blocks: DocBlock[];
}

export const DOC_CATEGORIES = [
  'Getting started',
  'Mapping fields',
  'Sequencing',
  'Generators',
  'Referencing other fields',
  'JSON reference',
  'Worked example',
  'Troubleshooting',
] as const;

function p(text: InlineText): DocBlock {
  return { type: 'p', text };
}
function h3(id: string, text: string): DocBlock {
  return { type: 'h3', id, text };
}
function list(items: InlineText[], ordered = false): DocBlock {
  return { type: 'list', items, ordered };
}
function code(code: string, lang: 'json' | 'js' | 'text' = 'text'): DocBlock {
  return { type: 'code', code, lang };
}
function table(headers: string[], rows: InlineText[][]): DocBlock {
  return { type: 'table', headers, rows };
}
function tip(text: InlineText): DocBlock {
  return { type: 'callout', kind: 'tip', text };
}
function warning(text: InlineText): DocBlock {
  return { type: 'callout', kind: 'warning', text };
}

export const DOC_SECTIONS: DocSection[] = [
  // ── Getting started ──────────────────────────────────────────────────
  {
    id: 'overview',
    title: 'What a script is',
    category: 'Getting started',
    blocks: [
      p(
        'A **script** is a named, per-site definition of how to fill a form: which elements to fill, in what order, and where each value comes from. A script has three parts:',
      ),
      list([
        '**`urlPatterns`** — one or more match patterns deciding which pages this script shows up on (see [Script shape](#json-script)).',
        '**`steps`** — an ordered list of **fields** to fill, **delays** to wait out, and **conditional waits** to block on (see [Steps run in order](#steps-order)).',
        '**`customGenerators`** — your own JavaScript data generators, referenced by id from any field (see [Custom JavaScript generators](#custom-generators)).',
      ]),
      p(
        'Nothing here is global — a login form and a checkout form on the same domain can be two separate scripts, or one, depending on how broad you make the URL pattern. Everything is stored locally (`browser.storage.local`); nothing is ever sent anywhere.',
      ),
    ],
  },
  {
    id: 'two-ways',
    title: 'Two ways to build a script',
    category: 'Getting started',
    blocks: [
      p('You can build a script two ways, and freely mix them on the same script:'),
      list([
        '**Visually** — open the field picker on the live page, click the inputs you want, then configure a generator for each one in the script editor. This is the normal path and the rest of this guide assumes it for the mapping steps.',
        '**As JSON** — the script editor has a live JSON side panel that edits the exact same data, in both directions: change a field in the form and the JSON updates; edit the JSON and the form updates. Import/export also work on this same shape. A handful of things (`radioValue`, `skip` — see [Field step shape](#json-field-step)) currently only have a JSON control, no dedicated UI widget yet.',
      ]),
      tip(
        'If you want to write a script by hand from scratch (e.g. to generate one programmatically, or restore one from a backup), see [JSON reference](#json-script) for the full annotated shape and a complete example.',
      ),
    ],
  },

  // ── Mapping fields ───────────────────────────────────────────────────
  {
    id: 'field-picker',
    title: 'The field picker',
    category: 'Mapping fields',
    blocks: [
      p(
        'The picker is a Shadow DOM overlay injected into the live page. Hovering highlights whatever element is under the cursor with an orange box and a small label guessing its type and (if one was detected) its generator. Clicking it:',
      ),
      list([
        'Records a **selector cascade** for the element (see [Selector candidates](#selectors)) — several ways to find it again, most reliable first.',
        'Detects its **element type** from the tag/`type` attribute (text, checkbox, select, …).',
        'Infers a **label** — from an associated `<label for>`, an `aria-label`, a `placeholder`, or an enclosing `<label>`, in that order.',
        'Best-effort detects a **suggested generator** from the field\'s `id`/`name`/`placeholder`/`aria-label`/label text and `autocomplete` attribute (e.g. a field named "cpf" suggests the CPF generator; `autocomplete="email"` suggests Email).',
      ]),
      p(
        'A picked element gets a persistent green outline and a small ✕ button; clicking it again (or the ✕) unmaps it — so an element can never end up mapped twice. Native pickers (`<select>`, date/color inputs) are prevented from popping open mid-click, since that would get in the way of just marking the element. Click **Finish** (or `Esc`) when done.',
      ),
      p(
        'Re-opening a script and choosing "Add fields from page" re-enters the picker on the live page with every field it already has pre-marked, so you can add more without starting over or accidentally re-mapping the same input twice.',
      ),
    ],
  },
  {
    id: 'selectors',
    title: 'Selector candidates',
    category: 'Mapping fields',
    blocks: [
      p(
        'Every field stores a **list** of selector candidates, not just one. At fill time, Formaster tries them **in order** and uses the first one that resolves to exactly one element on the page — this is what keeps a mapping alive across a page redesign that only changes some of an element\'s attributes.',
      ),
      table(
        ['Strategy', 'Matches against', 'Notes'],
        [
          ['`id`', '`#value` (via `CSS.escape`)', 'Skipped at generation time if the id looks auto-generated (see below).'],
          ['`name`', '`[name="value"]`', 'Stable for most native form fields.'],
          ['`data-testid`', '`[data-testid]`, `[data-test-id]`, or `[data-test]`', 'Checks all three common attribute spellings.'],
          ['`aria-label`', '`[aria-label="value"]`', 'Good when a framework component has no id/name.'],
          ['`css`', 'Any CSS selector, via `querySelector`', 'Auto-generated as a path of tag names + `:nth-of-type`, up to 6 ancestors, anchored at the nearest stable id if there is one.'],
          ['`xpath`', 'Any XPath, via `document.evaluate` (first match)', 'Auto-generated as an absolute path of sibling-indexed tag names.'],
        ],
      ),
      p(
        'When you pick a field, Formaster auto-generates a candidate for every strategy that applies (skipping `id` if the id looks unstable, and `name`/`data-testid`/`aria-label` if the element doesn\'t have that attribute), always ending with `css` and `xpath` as guaranteed fallbacks — so there\'s always at least one candidate.',
      ),
      h3('id-stability-heuristic', 'The id-stability heuristic'),
      p(
        'An id like `field-x7f3a9c` or React\'s `:r3:` is recognized as auto-generated (it changes every reload) and is **not** offered as a candidate at all — using it would map the field today and silently break it tomorrow. The heuristic: a short alphabetic prefix followed by 6+ hex digits, or React\'s `:r...:` pattern.',
      ),
    ],
  },
  {
    id: 'selector-editing',
    title: 'Editing selectors by hand',
    category: 'Mapping fields',
    blocks: [
      p(
        'Expand a field (the `</>` button) to see and edit its full selector list. Each candidate can be:',
      ),
      list([
        '**Toggled on/off** — a disabled candidate is skipped entirely at fill time (shown struck through), without deleting it. Useful when a candidate *looks* plausible but you know it\'s regenerated on every load.',
        '**Edited in place** — change the value of any candidate, including the auto-generated `css`/`xpath` ones.',
        '**Added by hand** — pick a strategy and type a value; it\'s appended to the end of the list.',
        '**Removed** — except the last remaining one; a field always needs at least one candidate.',
      ]),
      warning(
        'There is no way to **reorder** candidates — only enable/disable. New ones you type in are always appended at the end, after the auto-generated `css`/`xpath` fallbacks. If you want a hand-written candidate to actually be tried, either disable the ones above it, or expect it to only kick in when everything before it fails to resolve.',
      ),
      p(
        'Wait steps (see [Conditional wait steps](#wait-step)) have the exact same selector list and editing UI, since they also need to locate an element on the page.',
      ),
    ],
  },
  {
    id: 'element-types',
    title: 'Element types and how values are applied',
    category: 'Mapping fields',
    blocks: [
      p(
        'A field\'s **element type** decides how the generated value is written into the page, not just how it\'s displayed in the editor. The picker detects it automatically from the tag/`type` attribute; you can also change it by hand (e.g. force a `text` field to be treated as `custom`).',
      ),
      table(
        ['Element type', 'How the value is applied'],
        [
          ['`checkbox`', 'Checked state is set to the value\'s truthiness (only dispatches events if it actually changes).'],
          ['`radio`', 'Finds the radio in the same `name` group whose `value` attribute matches `options.radioValue` (or, if unset, the generated value itself), and checks that one.'],
          ['`select`', 'Sets the matching `<option value>` if one exists; otherwise picks a random enabled, non-empty option — so a fixed/generated value that doesn\'t exist on this particular page never leaves the field unset.'],
          ['`custom`', 'For anything that isn\'t a native input/select/textarea (a React/Vue-style widget). Simulates a real focus, click, and per-character keydown/input/keyup/change, since these components usually ignore a value set directly.'],
          ['everything else (`text`, `number`, `email`, `date`, `textarea`, …)', 'Calls the native property setter for `value` (bypassing frameworks that override it) and dispatches `input`/`change` — this is what makes React/Angular-style controlled inputs actually observe the change, the same way a plain assignment would not.'],
        ],
      ),
      tip(
        'If a field on a custom widget doesn\'t seem to update no matter what you try, set its element type to `custom` — that switches to the character-by-character simulated-typing path instead of a single value assignment.',
      ),
    ],
  },

  // ── Sequencing ────────────────────────────────────────────────────────
  {
    id: 'steps-order',
    title: 'Steps run in order',
    category: 'Sequencing',
    blocks: [
      p(
        'A script\'s `steps` array is a single ordered sequence of three kinds of entries, reorderable together with the same up/down controls: **fields**, **delays**, and **conditional waits**. Running a script walks this list top to bottom, one step at a time, and does not move on to the next step until the current one finishes.',
      ),
      p(
        'This matters most for two things: a delay or wait can go **anywhere**, including before the very first field (e.g. to wait for a page to finish rendering before touching anything), and later fields can read the values of earlier ones (see [Referencing other fields](#fields-object)) — which only works in one direction, top to bottom.',
      ),
    ],
  },
  {
    id: 'delay-step',
    title: 'Delay steps',
    category: 'Sequencing',
    blocks: [
      p(
        'A delay step is a fixed pause: it always waits its full `delayMs` before moving on, no matter what\'s happening on the page. Use it for a plain "give the page a moment" pause where you don\'t have (or don\'t need) something concrete to watch for.',
      ),
      p('Add one from the script editor\'s "Add wait" menu; drag it anywhere in the step list with the up/down arrows.'),
    ],
  },
  {
    id: 'wait-step',
    title: 'Conditional wait steps',
    category: 'Sequencing',
    blocks: [
      p(
        'A conditional wait (`waitFor`) blocks the fill sequence until an element matching its own [selector cascade](#selectors) satisfies a condition — or until `timeoutMs` elapses, in which case it just gives up and moves on to the next step anyway. It never aborts the rest of the script.',
      ),
      table(
        ['Condition', 'True when…'],
        [
          ['`enabled`', 'the element exists and its `disabled` property is falsy'],
          ['`visible`', 'the element exists, isn\'t `display:none`/`visibility:hidden`/`opacity:0`, and has a non-zero bounding box'],
          ['`exists`', 'the element simply resolves at all (any selector in the list matches)'],
          ['`checked`', 'the element exists and its `checked` property is true'],
        ],
      ),
      p(
        'It polls every `pollIntervalMs` (default 150ms) up to `timeoutMs` (default 5000ms). A typical use: a "neighborhood" `<select>` that stays disabled until a postal-code lookup on an earlier field resolves — a wait step with `condition: "enabled"` placed right before that field\'s step lets the fill sequence pause exactly as long as needed instead of guessing a fixed delay.',
      ),
    ],
  },
  {
    id: 'delay-vs-wait',
    title: 'Delay vs. conditional wait',
    category: 'Sequencing',
    blocks: [
      p('Rule of thumb:'),
      list([
        'Use a **delay** when you just need "a moment" and there\'s nothing specific to check — e.g. right after the script starts, before the first field.',
        'Use a **conditional wait** whenever there\'s an actual element/state you\'re waiting on — it resolves as soon as the condition is true instead of always waiting the worst case, and it\'s far less flaky than tuning a fixed delay to "long enough" for a lookup that might sometimes be slower.',
      ]),
    ],
  },

  // ── Generators ────────────────────────────────────────────────────────
  {
    id: 'fixed-generator',
    title: 'Fixed values',
    category: 'Generators',
    blocks: [
      p(
        'The simplest generator kind: every run produces the exact same string, number, or boolean you typed. Good for fields that must have one specific value — a plan tier, a checkbox that must always be off, a test coupon code.',
      ),
    ],
  },
  {
    id: 'builtin-generators',
    title: 'Built-in generators',
    category: 'Generators',
    blocks: [
      p(
        'Built-in generators produce realistic-looking fake data. Most expose their own options right next to the generator picker — a `locale` choice (Brazil/US) where an address/document format differs, a `masked` toggle for punctuation, min/max ranges, character classes, and so on.',
      ),
      table(
        ['ID', 'Label', 'Options'],
        [
          ['`cpf`', 'CPF', '`masked` (boolean, default `true`) — adds `.`/`-` punctuation. Always passes the real Receita Federal mod-11 check-digit algorithm and never returns an all-same-digit sequence (those are known-invalid placeholders).'],
          ['`cnpj`', 'CNPJ', '`masked` (boolean, default `true`).'],
          ['`rg`', 'RG', '`masked` (boolean, default `true`). No single national format exists; mimics the common SSP-SP style.'],
          ['`passport`', 'Passport', 'None. Brazilian format: 2 letters + 6 digits.'],
          ['`phoneBr`', 'Phone', '`locale` (`br`/`us`, default `br`), `masked` (boolean, default `true`).'],
          ['`cep`', 'Postal code', '`locale` (`br`/`us`), `masked` (boolean). Produces a Brazilian CEP or a US ZIP depending on `locale` — the id stayed `cep` for backward compatibility even though it now covers both.'],
          ['`fullName`', 'Full name', '`locale`, `gender` (`male`/`female`, default random — see [Correlated generators](#shared-identity)).'],
          ['`firstName`', 'First name', 'Same as `fullName`.'],
          ['`lastName`', 'Last name', 'Same as `fullName`.'],
          ['`email`', 'Email', '`locale`, `gender`. Built from the same identity\'s first/last name plus a random number, at one of a handful of RFC-2606 reserved or generic placeholder domains (`example.com`, `test.dev`, …) — never a real inbox.'],
          ['`birthdate`', 'Birthdate', '`minAge`/`maxAge` (number, default 18/65), `format` (`iso` = `YYYY-MM-DD`, or `br` = `DD/MM/YYYY`).'],
          ['`addressStreet`', 'Street', '`locale`.'],
          ['`addressNumber`', 'Address number', 'None.'],
          ['`addressComplement`', 'Address complement', '`locale`.'],
          ['`addressCity`', 'City', '`locale`.'],
          ['`addressState`', 'State', '`locale`.'],
          ['`addressNeighborhood`', 'Neighborhood', '`locale`.'],
          ['`fullAddress`', 'Full address', '`locale`. One formatted line combining street, number, complement, neighborhood (BR only), city, state, and postal code.'],
          ['`company`', 'Company', 'None.'],
          ['`uuid`', 'UUID', 'None. `crypto.randomUUID()`.'],
          ['`password`', 'Password', '`length` (default 12), `uppercase`/`lowercase`/`numbers`/`symbols` (each a boolean, all default `true`) — every enabled class is guaranteed at least one character.'],
          ['`integer`', 'Integer', '`min`/`max` (default 0/1000).'],
          ['`decimal`', 'Decimal', '`min`/`max` (default 0/1000), `precision` (decimal places, default 2).'],
          ['`boolean`', 'Boolean', '`trueProbability` (0–1, default 0.5).'],
          ['`lorem`', 'Lorem text', '`words` (default 8) — capitalized, period-terminated.'],
          ['`creditCardNumber`', 'Credit card number', '`brand` (`visa`/`mastercard`/`amex`/`discover`, default random), `formatted` (boolean, spaces every 4 digits). Passes the Luhn checksum.'],
          ['`creditCardExpiry`', 'Credit card expiry', '`format` (`MM/YY` or `MM/YYYY`), `minYearsFromNow`/`maxYearsFromNow` (default 1/4).'],
          ['`creditCardCvc`', 'Credit card CVC', '`brand` — 4 digits for Amex, 3 for everything else.'],
        ],
      ),
    ],
  },
  {
    id: 'shared-identity',
    title: 'Correlated generators (shared identity, address, card)',
    category: 'Generators',
    blocks: [
      p(
        'A handful of generators deliberately **agree with each other within one run** instead of each picking an unrelated random value — otherwise a form could end up with a first name, last name, and email that obviously belong to three different people. This happens automatically, per script run:',
      ),
      list([
        '**Name/email quartet** — `fullName`, `firstName`, `lastName`, and `email` (per locale) share one generated person the first time any of them runs. An explicit `gender` option on any of them always wins and re-pins the shared identity, even overriding one already picked with the other gender.',
        '**Address quartet** — `cep`/`addressCity`/`addressState`/`addressNeighborhood`/`fullAddress` (Brazil and US tracked separately) share one city record — so the postal code\'s region, the city, and the state always correspond to a real combination, not three independent guesses.',
        '**Credit card pair** — `creditCardNumber` and `creditCardCvc` share one brand, so you never get e.g. a Visa number with a 4-digit Amex-style CVC. `creditCardExpiry` isn\'t part of this — an expiry date has nothing to do with the brand.',
      ]),
      p(
        'This sharing resets on every run — click **Run** again and you get a fresh, but still internally consistent, identity/address/card.',
      ),
    ],
  },
  {
    id: 'custom-generators',
    title: 'Custom JavaScript generators',
    category: 'Generators',
    blocks: [
      p(
        'When a built-in generator and a fixed value aren\'t enough, write your own. A custom generator is the **body** of a function — you don\'t write `function(...) { ... }` yourself, just the statements, ending in a `return`:',
      ),
      code('return helpers.cpf();', 'js'),
      p('Three things are already in scope, with no import needed:'),
      list([
        '**`helpers`** — every built-in generator, callable directly, e.g. `helpers.cpf()`, `helpers.integer({ min: 1, max: 10 })`, `helpers.fullName({ locale: "us" })`. Same ids and options as the [built-in generators table](#builtin-generators).',
        '**`options`** — this specific field\'s configured values, matching whatever `optionsSchema` you declared for this generator (see [Generator options](#generator-options)). A key with no matching schema entry, or no `optionsSchema` declared at all, means `options` is just `{}`.',
        '**`fields`** — every value already filled earlier in this same script run, keyed by that field\'s label, camelCased (see [Referencing other fields](#fields-object)).',
      ]),
      code('return fields.firstName + "." + fields.lastName + "@example.com";', 'js'),
      p('The function must `return` a string, number, or boolean — returning anything else (an object, `undefined`, a Promise) throws an error that shows up right in the field\'s preview.'),
      p('New fields default to this generator when you add one:'),
      code('return "value";', 'js'),
      p(
        'Custom generators run inside a real sandboxed JavaScript interpreter (QuickJS, compiled to WebAssembly) — not `eval`/`new Function`. There\'s no access to the page, the extension\'s storage, `fetch`, or any browser API; see [Custom generator sandbox limits](#sandbox-limits) for exactly what that means in practice.',
      ),
      p('A generator you create is scoped to the script it was created in — assign it to as many fields on that script as you like from the "Custom script" generator kind dropdown, which also lets you jump straight to its code with the pencil icon.'),
    ],
  },
  {
    id: 'generator-options',
    title: 'Generator options',
    category: 'Generators',
    blocks: [
      p(
        'Built-in generators come with a fixed, hard-coded set of options (the table in [Built-in generators](#builtin-generators)). Custom generators can declare their **own** options the exact same way, via `optionsSchema` — a JSON list of knobs, each rendered as a matching control (checkbox, number, or dropdown) right next to any field using that generator.',
      ),
      code(
        `[
  { "key": "prefix", "type": "select", "label": "Style", "default": "user",
    "choices": [
      { "value": "user", "label": "user_" },
      { "value": "guest", "label": "guest_" }
    ] },
  { "key": "digits", "type": "number", "label": "Digits", "default": 4, "min": 1, "max": 10 }
]`,
        'json',
      ),
      p('Read the values back in your generator\'s code off `options.<key>`:'),
      code(
        `const prefix = options.prefix || "user";
const digits = Math.max(1, options.digits || 4);
const n = String(Math.floor(Math.random() * Math.pow(10, digits))).padStart(digits, "0");
return prefix + "_" + n;`,
        'js',
      ),
      table(
        ['Type', 'Extra fields', 'Renders as'],
        [
          ['`boolean`', '`default` (boolean)', 'Checkbox'],
          ['`number`', '`default` (number), optional `min`/`max`/`step`', 'Number input'],
          ['`select`', '`default` (string), `choices` (array of `{ value, label }`)', 'Dropdown'],
        ],
      ),
      p(
        'Every option needs a unique, non-empty `key` and a `label` (shown as the control\'s tooltip/aria-label). This is edited as raw JSON in the generator\'s "Options schema" panel in the script editor — invalid JSON shows an inline error and isn\'t saved until it\'s fixed.',
      ),
    ],
  },
  {
    id: 'preview',
    title: 'Previewing a value',
    category: 'Generators',
    blocks: [
      p(
        '"Preview value" on any field runs its generator right there in the editor, without touching the live page. To make the preview behave like a real run, it first resolves **every field above this one** in the step list — so a generator reading `fields.email` previews the same thing it would during an actual fill, and correlated builtins (see [Correlated generators](#shared-identity)) preview the same shared identity/address/card as the fields already previewed above them.',
      ),
      p(
        'A broken earlier field (bad selector, throwing generator) doesn\'t block previewing a later one — it\'s just absent from `fields` for that preview, same as it would be absent at real fill time.',
      ),
    ],
  },

  // ── Referencing other fields ────────────────────────────────────────
  {
    id: 'fields-object',
    title: 'The `fields` object',
    category: 'Referencing other fields',
    blocks: [
      p(
        'Inside a custom generator, `fields` holds the value of every field already filled **earlier in the same script run** — this is what lets a "Confirm password" field read the real password, or a referral code build itself from the email address:',
      ),
      code('return fields.password; // e.g. a "Confirm password" field', 'js'),
      code('return "REF-" + String(fields.email).split("@")[0].toUpperCase();', 'js'),
    ],
  },
  {
    id: 'fields-key-rule',
    title: 'How field keys are derived',
    category: 'Referencing other fields',
    blocks: [
      p(
        'A field\'s key in `fields` is its **label, camelCased**: split on anything that isn\'t a letter or digit, lowercase the first word, capitalize the first letter of every word after that, and join with no separators.',
      ),
      table(
        ['Field label', 'Key in `fields`'],
        [
          ['"Senha"', '`fields.senha`'],
          ['"Confirmar Senha"', '`fields.confirmarSenha`'],
          ['"E-mail"', '`fields.eMail`'],
          ['"First name"', '`fields.firstName`'],
        ],
      ),
      p(
        'If a field has no label at all, its key falls back to its element type instead (e.g. an unlabeled `email` input becomes `fields.email`), and if even that\'s empty, to the field\'s internal id — which is a random UUID, so in practice **always give a field a label** if you plan to reference it from another generator.',
      ),
      warning(
        'Two fields with the same (or same-camelCased) label produce the same key — whichever ran most recently simply overwrites the earlier one in `fields`. Keep labels distinct for any field you intend to reference.',
      ),
    ],
  },
  {
    id: 'fields-ordering',
    title: 'Ordering and availability rules',
    category: 'Referencing other fields',
    blocks: [
      list([
        'Only fields **above** the current one in the `steps` list are available — `fields` is built up top to bottom as the run progresses, so a generator can never see a field that comes later, no matter how the page itself is laid out.',
        'A field whose `options.skip` is `true` never runs, so it never populates `fields` either.',
        'A field that fails — its selector doesn\'t resolve, or its own generator throws — also doesn\'t populate `fields`. Reading a key that was never set just gives you JavaScript\'s `undefined`, not an error, so guard with something like `fields.company || "N/A"` if an earlier field might legitimately be missing.',
      ]),
      tip(
        'If a generator needs to read another field, drag that field above it in the step list first — reordering fields is just the up/down arrows on each row, same as reordering delays and waits.',
      ),
    ],
  },

  // ── JSON reference ───────────────────────────────────────────────────
  {
    id: 'json-script',
    title: 'Script shape',
    category: 'JSON reference',
    blocks: [
      p('The top-level shape validated by `formScriptSchema` (Zod) in `src/lib/schema/script.ts`:'),
      code(
        `{
  "schemaVersion": 1,
  "id": "…",
  "name": "Signup form",
  "description": "optional",
  "urlPatterns": ["*://example.com/signup*"],
  "steps": [ /* field | delay | waitFor, see below */ ],
  "customGenerators": [ /* see Custom generator shape */ ],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}`,
        'json',
      ),
      p(
        '`urlPatterns` uses the WebExtension match-pattern syntax (`scheme://host/path`, `*` wildcards, `<all_urls>`), plus one Formaster-specific extension: an optional trailing `#fragment`, matched against the URL\'s hash — for targeting one route of a hash-based single-page app (e.g. `*://host/app*#/checkout*`) without matching every other route under the same path.',
      ),
      warning(
        'Every field must have at least one selector, and every selector\'s `value` must be a **non-empty** string. Loading a script with a blank selector value doesn\'t just fail that one field — the whole script fails schema validation and is silently dropped from the list on next load. If you\'re hand-editing JSON, never leave a selector value blank; use an obvious placeholder like `#change-me` instead.',
      ),
    ],
  },
  {
    id: 'json-selector',
    title: 'Selector candidate shape',
    category: 'JSON reference',
    blocks: [
      code(
        `{ "strategy": "id" | "name" | "data-testid" | "aria-label" | "css" | "xpath", "value": "…", "enabled": true }`,
        'json',
      ),
      p('`enabled` defaults to `true` and can be omitted; set it to `false` to keep a candidate around without it being tried.'),
    ],
  },
  {
    id: 'json-field-step',
    title: 'Field step shape',
    category: 'JSON reference',
    blocks: [
      code(
        `{
  "type": "field",
  "field": {
    "id": "…",
    "label": "Password",
    "selectors": [ /* one or more selector candidates */ ],
    "elementType": "password",
    "generator": { "kind": "builtin", "id": "password", "options": { "length": 14 } },
    "options": { "radioValue": "pro", "skip": false }
  }
}`,
        'json',
      ),
      p('`generator` is one of three shapes, discriminated by `kind`:'),
      table(
        ['`kind`', 'Shape'],
        [
          ['`"builtin"`', '`{ kind: "builtin", id: <BuiltinGeneratorId>, options?: {...} }` — see [Built-in generators](#builtin-generators).'],
          ['`"fixed"`', '`{ kind: "fixed", value: string | number | boolean }`.'],
          ['`"custom"`', '`{ kind: "custom", generatorId: "<a customGenerators[].id>", options?: {...} }`.'],
        ],
      ),
      p(
        '`field.options` is optional, and both of its keys currently have **no dedicated UI control** — set them from the JSON side panel (or a hand-written import file):',
      ),
      list([
        '`radioValue` — for `elementType: "radio"` fields, which `value` attribute in the radio group to check. If omitted, the generated/fixed value itself is used, so most radio fields don\'t need this at all.',
        '`skip` — when `true`, the fill sequence passes over this field entirely (it\'s also excluded from `fields`, see [Ordering and availability rules](#fields-ordering)) without removing it from the script.',
      ]),
    ],
  },
  {
    id: 'json-delay-wait',
    title: 'Delay and wait step shapes',
    category: 'JSON reference',
    blocks: [
      code(`{ "type": "delay", "id": "…", "delayMs": 500 }`, 'json'),
      code(
        `{
  "type": "waitFor",
  "id": "…",
  "selectors": [ /* same shape as a field's */ ],
  "condition": "enabled" | "visible" | "exists" | "checked",
  "timeoutMs": 5000,
  "pollIntervalMs": 150
}`,
        'json',
      ),
    ],
  },
  {
    id: 'json-custom-generator',
    title: 'Custom generator shape',
    category: 'JSON reference',
    blocks: [
      code(
        `{
  "id": "…",
  "name": "Confirm password",
  "code": "return fields.password;",
  "optionsSchema": [ /* see Generator options */ ]
}`,
        'json',
      ),
      p('`code` is the raw function **body** (see [Custom JavaScript generators](#custom-generators)) — not a full `function` declaration.'),
    ],
  },
  {
    id: 'json-example',
    title: 'Full example',
    category: 'JSON reference',
    blocks: [
      p('A minimal but complete two-field script: name, then an email built from it, with a short delay first.'),
      code(
        `{
  "schemaVersion": 1,
  "id": "b6b6f2f0-0000-4000-8000-000000000001",
  "name": "Minimal example",
  "urlPatterns": ["*://example.com/signup*"],
  "steps": [
    { "type": "delay", "id": "d1", "delayMs": 300 },
    {
      "type": "field",
      "field": {
        "id": "f1",
        "label": "First name",
        "selectors": [{ "strategy": "id", "value": "first-name", "enabled": true }],
        "elementType": "text",
        "generator": { "kind": "builtin", "id": "firstName" }
      }
    },
    {
      "type": "field",
      "field": {
        "id": "f2",
        "label": "Email",
        "selectors": [{ "strategy": "id", "value": "email", "enabled": true }],
        "elementType": "email",
        "generator": { "kind": "custom", "generatorId": "g1" }
      }
    }
  ],
  "customGenerators": [
    { "id": "g1", "name": "Email from first name", "code": "return fields.firstName.toLowerCase() + \\"@example.com\\";", "optionsSchema": [] }
  ],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}`,
        'json',
      ),
      tip('Paste JSON like this straight into the script editor\'s JSON panel, or import it as a file from the script library.'),
    ],
  },

  // ── Worked example ────────────────────────────────────────────────────
  {
    id: 'walkthrough',
    title: 'Building a signup script end-to-end',
    category: 'Worked example',
    blocks: [
      p('Putting every piece together, in the order you\'d actually do it:'),
      list(
        [
          'Open the picker on the signup page and click First name, Last name, Email, Password, Confirm password, and a "Referral code" field that starts out disabled.',
          'Set First name → built-in `firstName`, Last name → `lastName`, Email → `email` (these three will share one identity automatically — see [Correlated generators](#shared-identity)).',
          'Set Password → built-in `password` with whatever length/character-class options the target site requires.',
          'Set Confirm password → **Custom script**, and write `return fields.senha;` (or `fields.password`, matching whatever you labeled the password field — see [How field keys are derived](#fields-key-rule)).',
          'The referral code field only enables after email lookup finishes on this particular site — add a **conditional wait** step right before it, targeting the same selector, condition `enabled`, and drop the timeout to whatever\'s reasonable for that lookup.',
          'Set Referral code → **Custom script**: `return "REF-" + String(fields.email).split("@")[0].toUpperCase();`.',
          'Reorder if needed with the up/down arrows — the wait step must sit immediately above the referral code field, and email must be above both the referral code and confirm-password fields for their generators to see it.',
          'Hit **Preview value** on the referral code field to confirm it reads a real email before ever running it against the live page.',
          'Save, then **Run** from the popup on that page.',
        ],
        true,
      ),
      p('This exact pattern (identity fields, a wait-gated field, a field referencing an earlier one) is also what the bundled Playground\'s example script demonstrates — open it from the script library if you\'d rather tinker with a live, running version than read about one.'),
    ],
  },

  // ── Troubleshooting ───────────────────────────────────────────────────
  {
    id: 'gotchas',
    title: 'Common mistakes and gotchas',
    category: 'Troubleshooting',
    blocks: [
      list([
        '**A field vanished, along with the whole script.** Almost always an empty selector value slipped in through the JSON panel or an import file — `formScriptSchema` requires every selector `value` to be non-empty, and a script that fails validation is dropped entirely on next load. See the warning in [Script shape](#json-script).',
        '**My hand-added selector never gets used.** Candidates are tried in list order and can only be enabled/disabled, never reordered — disable the ones above it. See [Editing selectors by hand](#selector-editing).',
        '**A `<select>` field gets filled with the wrong option.** If the generated/fixed value doesn\'t match any real `<option value>` on the page, Formaster picks a random enabled option instead of leaving it unset — check the actual option values on the page and use a `fixed` generator with one of them, or a `custom` generator that returns one.',
        '**A custom generator can\'t see an earlier field\'s value.** Either the referencing field is above the one it needs (reorder them), or the label-to-key camelCasing doesn\'t match what you typed — check [How field keys are derived](#fields-key-rule), or just read `fields` in the code (`return JSON.stringify(fields);`) and preview it to see the exact keys available.',
        '**`options` is always `{}` in my custom generator.** You need to declare `optionsSchema` for that generator first (see [Generator options](#generator-options)) — without it, there\'s nothing for a field to configure, so `options` stays empty.',
        '**A radio field checks the wrong option.** Set `field.options.radioValue` to the exact `value` attribute of the option you want checked — there\'s no UI control for this yet, only the JSON panel. See [Field step shape](#json-field-step).',
      ]),
    ],
  },
  {
    id: 'sandbox-limits',
    title: 'Custom generator sandbox limits',
    category: 'Troubleshooting',
    blocks: [
      p(
        'Custom generator code runs inside QuickJS — a real interpreted JavaScript engine compiled to WebAssembly — not `eval`/`new Function`. That gives it genuine isolation, at the cost of a few hard limits:',
      ),
      list([
        'No access to the page, the DOM, `fetch`/`XMLHttpRequest`, `browser.*` APIs, cookies, or storage of any kind. The only inputs are `helpers`, `options`, and `fields`.',
        'A **3-second** execution timeout — code that runs long (an accidental infinite loop, a huge computation) is forcibly interrupted and the field is reported as an error rather than hanging the fill.',
        'The return value must be a plain `string`, `number`, or `boolean`. Returning an object, array, `undefined`, or a `Promise` throws — generators are synchronous, single-value producers by design.',
        'No shared state between fields beyond what\'s explicitly passed in: two custom generators can\'t communicate except through `fields` (one reading a value an earlier one already produced).',
      ]),
      p(
        'This works identically across every supported browser (Chrome, Brave, Opera, Firefox) with no per-browser special-casing, because WebAssembly compilation is covered by the standard `wasm-unsafe-eval` CSP directive — unlike `eval`, which Chrome always blocks for extensions and modern Firefox blocks outside a sandboxed page it doesn\'t even support.',
      ),
    ],
  },
];
