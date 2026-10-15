<script>
  /**
   * ImportPointer.svelte - the short note that replaces an import box on a tool page. Importing lives
   * in Settings > Data > Import only; the link opens it and asks Settings to focus that section.
   */
  import { requestImportFocus } from '../../lib/importFlow.svelte.js';

  let { what = 'a file' } = $props();
</script>

<p class="pointer" data-testid="import-pointer">
  <a href="#/settings" onclick={requestImportFocus}>Import {what} in Settings → Import</a>
</p>

<style>
  .pointer { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
</style>
