/**
 * inspector.svelte.js - the shell's inspector region (ia.md §2). A page hands it a snippet with
 * `inspector.set(snippet)` and removes it with `inspector.clear()`; App.svelte renders the snippet
 * into `#shell-inspector`. One snippet at a time; the last `set` wins.
 */
let current = $state(null);

export const inspector = {
  get snippet() {
    return current;
  },
  set(snippet) {
    current = snippet ?? null;
  },
  clear() {
    current = null;
  },
};
