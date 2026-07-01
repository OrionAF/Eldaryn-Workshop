import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // style: false - components only use plain CSS (no SCSS/LESS/PostCSS), and
  // routing style tags through Vite's CSS pipeline breaks under Vitest due to
  // a vite@6.4.3 (top-level) / vite@5.4.21 (vitest's nested vite-node) version
  // mismatch. Svelte's own compiler still scopes plain CSS without this step.
  preprocess: vitePreprocess({ style: false }),
};
