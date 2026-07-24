<script lang="ts">
  const inputClass =
    'w-full rounded-lg border border-hair bg-canvas px-2.5 py-1.5 text-sm text-ink-1 outline-none transition focus:border-accent-500 disabled:cursor-not-allowed disabled:opacity-40';

  let emailValue = $state('');
  const referralDisabled = $derived(emailValue.trim() === '');

  let promoValue = $state('');

  // "React/Angular-style" custom combobox: deliberately NOT a native <select>,
  // and deliberately NOT reactively re-rendered from Svelte state (that would
  // fight the DOM writes Formaster's picker/filler make directly on the
  // element, the same way a framework's own virtual-DOM diffing would). The
  // div's textContent is the only source of truth, exactly like a real input.
  let comboEl: HTMLDivElement | undefined;
  let comboOpen = $state(false);
  let comboFilter = $state('');
  const COUNTRIES = ['Argentina', 'Brazil', 'Canada', 'Portugal', 'United States'];
  const comboMatches = $derived(COUNTRIES.filter((c) => c.toLowerCase().includes(comboFilter.toLowerCase())));

  function handleComboInput(event: Event): void {
    comboFilter = (event.currentTarget as HTMLDivElement).textContent ?? '';
    comboOpen = true;
  }

  function selectCountry(country: string): void {
    if (comboEl) comboEl.textContent = country;
    comboFilter = '';
    comboOpen = false;
  }
</script>

<div class="mx-auto max-w-2xl space-y-6 p-3 sm:p-6">
  <div>
    <h1 class="text-sm font-semibold text-ink-1">Playground form</h1>
    <p class="mt-1 text-xs text-ink-3">
      A throwaway form with every field type Formaster understands — including a field disabled until another is
      filled, and two widgets built the way React/Angular apps often build them (not plain native controls). Nothing
      here is submitted anywhere; it only exists to map and fill.
    </p>
  </div>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Identity</legend>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        First name
        <input id="pg-first-name" type="text" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Last name
        <input id="pg-last-name" type="text" class={`mt-1 ${inputClass}`} />
      </label>
    </div>

    <label class="block text-xs font-medium text-ink-2">
      Email
      <input id="pg-email" type="email" class={`mt-1 ${inputClass}`} bind:value={emailValue} />
    </label>

    <label class="block text-xs font-medium text-ink-2">
      Referral code
      <input id="pg-referral-code" type="text" class={`mt-1 ${inputClass}`} disabled={referralDisabled} />
      <span class="mt-1 block text-[11px] font-normal text-ink-3">
        {referralDisabled ? 'Disabled until Email has a value — try the waitFor step.' : 'Unlocked.'}
      </span>
    </label>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        Phone
        <input id="pg-phone" type="tel" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Age
        <input id="pg-age" type="number" class={`mt-1 ${inputClass}`} />
      </label>
    </div>

    <label class="block text-xs font-medium text-ink-2">
      Birthdate
      <input id="pg-birthdate" type="date" class={`mt-1 ${inputClass}`} />
    </label>
  </fieldset>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Security</legend>
    <p class="text-[11px] text-ink-3">Shown as plain text here (not masked) so the fill is visible without inspecting the page.</p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        Password
        <input id="pg-password" type="text" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Confirm password
        <input id="pg-confirm-password" type="text" class={`mt-1 ${inputClass}`} />
      </label>
    </div>
  </fieldset>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Dates &amp; misc</legend>
    <label class="block text-xs font-medium text-ink-2">
      Website
      <input id="pg-website" type="url" class={`mt-1 ${inputClass}`} />
    </label>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        Appointment
        <input id="pg-appointment" type="datetime-local" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Start month
        <input id="pg-start-month" type="month" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Vacation week
        <input id="pg-vacation-week" type="week" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Meeting time
        <input id="pg-meeting-time" type="time" class={`mt-1 ${inputClass}`} />
      </label>
    </div>
  </fieldset>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Preferences</legend>

    <label class="flex items-center gap-2 text-xs font-medium text-ink-2">
      <input id="pg-newsletter" type="checkbox" class="h-3.5 w-3.5 accent-accent-500" />
      Subscribe to the newsletter
    </label>

    <div>
      <span class="block text-xs font-medium text-ink-2">Plan</span>
      <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <label class="flex items-center gap-1.5">
          <input id="pg-plan-basic" type="radio" name="pg-plan" value="basic" class="accent-accent-500" />
          Basic
        </label>
        <label class="flex items-center gap-1.5">
          <input id="pg-plan-pro" type="radio" name="pg-plan" value="pro" class="accent-accent-500" />
          Pro
        </label>
        <label class="flex items-center gap-1.5">
          <input id="pg-plan-enterprise" type="radio" name="pg-plan" value="enterprise" class="accent-accent-500" />
          Enterprise
        </label>
      </div>
    </div>

    <label class="block text-xs font-medium text-ink-2">
      Account type
      <select id="pg-account-type" class={`mt-1 ${inputClass}`}>
        <option value="personal">Personal</option>
        <option value="business">Business</option>
      </select>
    </label>

    <label class="block text-xs font-medium text-ink-2">
      Bio
      <textarea id="pg-bio" rows="3" class={`mt-1 ${inputClass}`}></textarea>
    </label>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        Satisfaction (0-10)
        <input id="pg-satisfaction" type="range" min="0" max="10" class="mt-2 w-full accent-accent-500" />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        Favorite color
        <input id="pg-favorite-color" type="color" class="mt-1 h-8 w-full rounded-lg border border-hair bg-canvas" />
      </label>
    </div>
  </fieldset>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Payment</legend>
    <label class="block text-xs font-medium text-ink-2">
      Card number
      <input id="pg-card-number" type="text" class={`mt-1 ${inputClass}`} />
    </label>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block text-xs font-medium text-ink-2">
        Expiry
        <input id="pg-card-expiry" type="text" placeholder="MM/YY" class={`mt-1 ${inputClass}`} />
      </label>
      <label class="block text-xs font-medium text-ink-2">
        CVC
        <input id="pg-card-cvc" type="text" class={`mt-1 ${inputClass}`} />
      </label>
    </div>
  </fieldset>

  <fieldset class="space-y-4 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
      Custom widgets (React/Angular-style)
    </legend>

    <div>
      <span class="block text-xs font-medium text-ink-2">Country</span>
      <p class="mb-1 text-[11px] text-ink-3">
        A hand-built combobox, not a native &lt;select&gt; — this is how most component libraries actually implement
        one. Formaster maps it as a "custom" field and types into it.
      </p>
      <div class="relative">
        <div
          bind:this={comboEl}
          id="pg-country"
          role="combobox"
          tabindex="0"
          aria-expanded={comboOpen}
          aria-haspopup="listbox"
          aria-controls="pg-country-listbox"
          data-placeholder="Type or click a country…"
          class={`${inputClass} empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)]`}
          oninput={handleComboInput}
          onfocus={() => (comboOpen = true)}
          onblur={() => setTimeout(() => (comboOpen = false), 150)}
        ></div>
        <ul
          id="pg-country-listbox"
          role="listbox"
          class={`absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-hair bg-surface-hover shadow-lg ${
            comboOpen && comboMatches.length > 0 ? '' : 'hidden'
          }`}
        >
          {#each comboMatches as country (country)}
            <li role="option" aria-selected="false">
              <button
                type="button"
                class="w-full px-2.5 py-1.5 text-left text-sm text-ink-1 hover:bg-accent-500/15"
                onmousedown={(event) => {
                  event.preventDefault();
                  selectCountry(country);
                }}
              >
                {country}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div>
      <label class="block text-xs font-medium text-ink-2" for="pg-promo-code">Promo code</label>
      <p class="mb-1 text-[11px] text-ink-3">
        A plain input, but its displayed value below is driven entirely by real DOM events — like a framework's
        controlled component. A naive script that sets <code class="font-mono">.value</code> directly without dispatching
        events wouldn't show up here; Formaster's fill does.
      </p>
      <input id="pg-promo-code" type="text" class={inputClass} bind:value={promoValue} />
      <p class="mt-1 text-[11px] text-ink-3">Framework state: <code class="font-mono text-ink-2">{promoValue || '—'}</code></p>
    </div>
  </fieldset>

  <fieldset class="space-y-3 rounded-xl bg-surface p-3 sm:p-4">
    <legend class="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Custom generator options</legend>
    <label class="block text-xs font-medium text-ink-2">
      Username
      <input id="pg-username" type="text" class={`mt-1 ${inputClass}`} />
      <span class="mt-1 block text-[11px] font-normal text-ink-3">
        Its generator ("Username" in Custom generators, left side) defines its own <code class="font-mono">options.prefix</code>
        /<code class="font-mono">options.digits</code> — this field is set to <code class="font-mono">guest</code> / 6 digits.
      </span>
    </label>
  </fieldset>
</div>
