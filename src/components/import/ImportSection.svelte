<script>
  /**
   * ImportSection.svelte - game-data import (ia.md G3, §5.4), shown in Settings > Advanced only while the
   * "Show game data import" preference is on: the capture disclaimer, then the file drop, paste and file
   * picker. It hands text to lib/importFlow.svelte.js, whose report dialog (mounted in the shell) takes
   * over; a rejected text shows its reason here unless it came from the Data panel's restore box. Focus
   * requests from the tool pages' pointer links (requestImportFocus) land on the heading.
   */
  import Banner from '../ui/Banner.svelte';
  import ImportSource from './ImportSource.svelte';
  import { importFlow, consumeImportFocus, loadImportFile, loadImportText } from '../../lib/importFlow.svelte.js';

  let heading = $state(null);
  const reduce = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  function focusHeading() {
    heading?.scrollIntoView?.({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
    heading?.focus?.({ preventScroll: true });
  }

  $effect(() => {
    // Reads focusSeq so a request made while mounted re-runs this; a request made before mount is pending.
    void importFlow.focusSeq;
    if (heading && importFlow.focusPending && consumeImportFocus()) focusHeading();
  });
</script>

<section class="import" aria-labelledby="settings-import-h" data-testid="import-section">
  <h3 id="settings-import-h" tabindex="-1" bind:this={heading}>Import</h3>
  <Banner variant="warn" lead="Importing game data is possible, but finicky.">
    <span data-testid="import-disclaimer">
      The game has no export button, so its JSON has to be captured from the game's network traffic. That needs another app
      (for example HTTP Catcher on iPhone) or a PC running HTTP Toolkit. Android usually needs root. Backups exported from this
      app always import normally.
    </span>
  </Banner>
  <ImportSource
    onfile={(f) => loadImportFile(f)}
    ontext={(t) => loadImportText(t)}
    error={importFlow.from === 'restore' ? '' : importFlow.error}
  />
</section>

<style>
  .import { display: grid; gap: var(--sp-3); margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: 1px solid var(--line-hairline); }
  h3 { margin: 0; font-size: var(--fs-16); }
</style>
