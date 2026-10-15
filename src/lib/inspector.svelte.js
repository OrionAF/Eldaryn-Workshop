// inspector.svelte.js - the page-to-shell hand-off for the right-hand inspector (ia.md §5.10, design-system §4.21).
//
// A page registers a Svelte snippet describing the selected item or totals; the shell renders
// `inspector.current` into #shell-inspector (src/components/InspectorOutlet.svelte). The snippet keeps the
// registering page's reactive scope, so it updates as the page does. Registration returns a release function
// that clears the slot only if it still holds that snippet, so a page that unmounts after its successor has
// registered cannot wipe the successor's content:
//
//   $effect(() => inspector.set(mySnippet));   // the returned release is the effect cleanup
let current = $state.raw(null);

export const inspector = {
  /** The registered snippet, or null. */
  get current() {
    return current;
  },
  /** Show `snippet` in the inspector. Returns the release for it. */
  set(snippet) {
    current = snippet;
    return () => {
      if (current === snippet) current = null;
    };
  },
  /** Empty the inspector unconditionally. */
  clear() {
    current = null;
  },
};
