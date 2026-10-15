// Test helpers for forms built from ui/Select and ui/NumberField: find a control by its visible label,
// and set it the way a user does (select: change; number field: type, then leave the field).
import { flushSync } from 'svelte';

/** The control whose <label> text is `label` (optionally followed by " (range)"), else the one with that aria-label, or null. */
export function field(root, label) {
  const hit = [...root.querySelectorAll('label')].find((l) => l.textContent.trim() === label || l.textContent.trim().startsWith(`${label} (`));
  if (hit?.htmlFor) return root.querySelector(`[id="${hit.htmlFor}"]`);
  return root.querySelector(`[aria-label="${label}"]`);
}

/** Set a select (change) or a NumberField text input (input then blur). */
export function setField(el, value) {
  el.value = value;
  if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
  else {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
  }
  flushSync();
}
