<script>
  /**
   * DangerZone.svelte - G6 "Reset all data" (ia.md §5.3, design-system §4.38). The rule is unchanged: the
   * exact word RESET, case-sensitive, Enter confirms, and a wrong text keeps the button off. Reset wipes
   * the roster, the v1 backup key and the removed settings key (storage.js clearAllData), the one place
   * the v1 key is ever deleted; importing or migrating never touches it. "Export first" downloads the
   * roster before the wipe.
   */
  import Button from '../ui/Button.svelte';
  import { clearAllData } from '../../lib/storage.js';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';

  const RESET_WORD = 'RESET';
  let text = $state('');

  const matches = $derived(text === RESET_WORD);
  const wrong = $derived(text !== '' && !matches);

  function doReset() {
    if (!matches) return;
    clearAllData();
    location.reload();
  }
</script>

<section class="danger" role="group" aria-label="Danger Zone">
  <h2>Danger zone</h2>
  <p class="lead">Reset all data permanently deletes, on this device, with no undo:</p>
  <ul>
    <li>every character, with its presets, gear, stones, talents, pets, mounts, glyphs, sigils, relics and sheets</li>
    <li>saved opponents and run history</li>
    <li>the version 1 backup copy of your data and the legacy settings key</li>
  </ul>
  <p class="lead">Preferences and the remembered page on this device are kept.</p>
  <div class="row">
    <Button variant="ghost" disabled={rosterStore.roster.characters.length === 0} onclick={() => rosterStore.exportDownload()}>Export first</Button>
  </div>
  <div class="confirm">
    <label for="reset-text">Type RESET to confirm</label>
    <input
      id="reset-text"
      type="text"
      placeholder={RESET_WORD}
      autocomplete="off"
      bind:value={text}
      aria-invalid={wrong ? 'true' : undefined}
      aria-describedby={wrong ? 'reset-err' : undefined}
      onkeydown={(e) => e.key === 'Enter' && doReset()}
    />
    {#if wrong}<span id="reset-err" class="err" role="alert">Type RESET exactly, in capitals</span>{/if}
    <Button variant="danger" disabled={!matches} onclick={doReset}>Reset all data</Button>
  </div>
</section>

<style>
  .danger {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--surface-2);
    border: 1px solid var(--line-rule);
    border-top: 3px solid var(--verdict-down);
    border-radius: var(--r-2);
  }
  h2 { margin: 0; font-size: var(--fs-16); color: var(--verdict-down); }
  .lead { margin: 0; font-size: var(--fs-13); }
  ul { margin: 0; padding-left: var(--sp-4); font-size: var(--fs-13); color: var(--text-soft); display: grid; gap: 2px; }
  .row { display: flex; gap: var(--sp-2); }
  .confirm { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
  label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  input {
    min-height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-family: var(--font-data);
  }
  input[aria-invalid='true'] { border-color: var(--verdict-down); }
  .err { font-size: var(--fs-12); color: var(--verdict-down); }
</style>
