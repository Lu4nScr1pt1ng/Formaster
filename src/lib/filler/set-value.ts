/**
 * React (and most frameworks) override the native `value` setter to track
 * changes, so writing `element.value = x` directly is silently ignored by
 * their reconciliation. Calling the *native* setter first, then dispatching
 * the events, makes the framework observe the change like a real user typed it.
 */
function nativeSetter(prototype: typeof HTMLInputElement.prototype | typeof HTMLTextAreaElement.prototype) {
  return Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
}

function dispatchInputEvents(element: Element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = nativeSetter(prototype);
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  dispatchInputEvents(element);
}

export function setCheckbox(element: HTMLInputElement, checked: boolean): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (checked === element.checked) return;
  if (setter) {
    setter.call(element, checked);
  } else {
    element.checked = checked;
  }
  element.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
  dispatchInputEvents(element);
}

export function setRadioGroup(element: HTMLInputElement, value?: string): void {
  const group = element.name
    ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
    : [element];

  const target = value ? group.find((radio) => radio.value === value) ?? element : element;
  setCheckbox(target, true);
}

export function setSelectValue(element: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  const hasOption = Array.from(element.options).some((option) => option.value === value);
  const resolvedValue = hasOption ? value : (element.options[randomOptionIndex(element)]?.value ?? value);

  if (setter) {
    setter.call(element, resolvedValue);
  } else {
    element.value = resolvedValue;
  }
  dispatchInputEvents(element);
}

function randomOptionIndex(select: HTMLSelectElement): number {
  const selectable = Array.from(select.options).filter((option) => !option.disabled && option.value !== '');
  if (selectable.length === 0) return 0;
  const chosen = selectable[Math.floor(Math.random() * selectable.length)];
  return Array.from(select.options).indexOf(chosen);
}

/** Fallback for custom (non-native) inputs: simulate real focus + keystrokes. */
export async function simulateTyping(element: HTMLElement, value: string): Promise<void> {
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  element.click();

  // Clear whatever's already there first — without this, running the same
  // fill twice (or "Fill this field" a second time) appends onto the old
  // value instead of replacing it, e.g. "BrazilBrazil" instead of "Brazil".
  if ('value' in element) {
    (element as unknown as { value: string }).value = '';
  } else {
    element.textContent = '';
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true }));

  for (const char of value) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    if ('value' in element) {
      (element as unknown as { value: string }).value += char;
    } else {
      element.textContent = (element.textContent ?? '') + char;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}
