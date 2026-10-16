<script>
  /**
   * ImportSource.svelte - where a JSON comes from: a file (button or drag), or pasted text. Used by the
   * import dialog and the Welcome page, so both read the same kinds the same way (lib/importFlow.svelte.js).
   * It only hands the text on; nothing is parsed here.
   */
  import DropZone from '../ui/DropZone.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import Button from '../ui/Button.svelte';

  let { onfile, ontext, error = '', label = 'Drop a file here, or click to choose', primary = false } = $props();
  let text = $state('');
</script>

<div class="source">
  <DropZone {onfile} {label} hint="Game profile, Rankings profile, backup, loot bag or fight log" {error} />
  <details class="paste" open={!primary}>
    <summary>Or paste the text</summary>
    <Textarea label="Pasted text" rows={5} placeholder={'{ ... }'} bind:value={text} />
    <div class="row"><Button variant="secondary" disabled={!text.trim()} onclick={() => ontext(text)}>Read pasted text</Button></div>
  </details>
  <p class="kinds">
    Accepted: your <b>game profile</b> (becomes a character, or updates one), an Eldaryn <b>backup</b>, a
    <b>Rankings profile</b> (another player, saved as an opponent), a <b>loot bag</b> (new drops for Drop Check) and an arena <b>fight log</b> (for the replay check).
  </p>
</div>

<style>
  .source { display: grid; gap: var(--sp-3); }
  .paste { display: grid; gap: var(--sp-2); }
  summary { cursor: pointer; font-size: var(--fs-13); color: var(--text-soft); margin-bottom: var(--sp-2); }
  .row { margin-top: var(--sp-2); }
  .kinds { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
  .kinds b { color: var(--text-soft); }
</style>
