<script>
  /**
   * ImportPointer.svelte - the short note that replaces an import box on a tool page. Importing lives
   * in Settings > Advanced > Import only, and only while "Show game data import" is on (it renders
   * nothing otherwise); the link opens Settings and asks it to focus that section.
   */
  import { requestImportFocus } from '../../lib/importFlow.svelte.js';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { what = 'a file' } = $props();
</script>

{#if prefs.showImport}
  <p class="pointer" data-testid="import-pointer">
    <a href="#/settings" onclick={requestImportFocus}>Import {what} in Settings → Advanced</a>
  </p>
{/if}

<style>
  .pointer { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
</style>
