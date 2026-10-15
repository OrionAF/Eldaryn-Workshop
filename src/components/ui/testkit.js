// Shared helpers for the primitive tests: mount into the document, build static snippets, fire keys.
import { mount, unmount, flushSync, createRawSnippet } from 'svelte';

export function setup(Component, props = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Component, { target, props });
  flushSync();
  return {
    target,
    q: (sel) => target.querySelector(sel),
    qa: (sel) => [...target.querySelectorAll(sel)],
    done() {
      unmount(app);
      target.remove();
    },
  };
}

/** A snippet that renders fixed HTML (wrapped in one span: raw snippets need a single root). */
export const html = (markup) => createRawSnippet(() => ({ render: () => `<span>${markup}</span>` }));

export function key(el, k, init = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  flushSync();
}

export function click(el) {
  el.click();
  flushSync();
}

export function type(input, text) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
