<script>
  /**
   * PasteSheetDialog.svelte - F33: paste the in-game stat lines in one go. The text is read by
   * build/sheetText.js (number rules: sheet.js parseSheetInput); the preview lists what will be written
   * and every line that will not. Apply merges the read values over `values` and hands them to `onapply`;
   * rows the paste does not mention keep their value.
   */
  import { parseSheetText } from '../../lib/build/sheetText.js';
  import Modal from '../Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import { statText } from './statText.js';

  /** @type {{open?: boolean, keys: string[], values: Object<string, number>, playerClass?: string|null, onapply?: (values: Object<string, number>) => void}} */
  let { open = $bindable(false), keys, values, playerClass = null, onapply = () => {} } = $props();

  let text = $state('');
  const parsed = $derived(parseSheetText(text, keys, playerClass));
  const REASON = { unknown: 'Not recognised', other: 'Not on this sheet', invalid: 'Number not read' };

  $effect(() => {
    if (!open) text = '';
  });

  function apply() {
    onapply({ ...values, ...parsed.values });
    open = false;
  }
</script>

<Modal bind:open title="Paste in-game stats">
  {#snippet children()}
    <p class="lead">
      Paste one stat per line, a name then a number ("Attack 48.124", "Crit Chance: 6.2%"). Rows you leave out keep their number.
    </p>
    <Textarea label="Stat lines" rows={8} placeholder={'Attack 48.124\nHealth 1.234.567\nCrit Chance 6.2%'} bind:value={text} />
    {#if text.trim()}
      <ul class="preview" data-testid="paste-preview" aria-label="What will be written">
        {#each parsed.rows as r (r.key)}
          <li><span>{r.label}</span> <span class="num">{statText(r.key, r.value)}</span></li>
        {/each}
        {#each parsed.unmatched as u, i (i)}
          <li class="skip">{REASON[u.reason]}: <span class="line">{u.line}</span></li>
        {/each}
      </ul>
      <p class="count" data-testid="paste-count">
        {parsed.rows.length} {parsed.rows.length === 1 ? 'stat' : 'stats'} read{parsed.unmatched.length ? `, ${parsed.unmatched.length} skipped` : ''}.
      </p>
    {/if}
  {/snippet}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button variant="primary" data-testid="paste-apply" disabled={parsed.rows.length === 0} onclick={apply}>Apply</Button>
  {/snippet}
</Modal>

<style>
  .lead { margin: 0 0 var(--sp-3); font-size: var(--fs-13); color: var(--text-soft); }
  .preview {
    list-style: none; margin: var(--sp-3) 0 0; padding: 0; max-height: 40vh; overflow-y: auto;
    font-size: var(--fs-13);
  }
  .preview li {
    display: flex; justify-content: space-between; gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line-hairline);
  }
  .preview li.skip { justify-content: flex-start; color: var(--text-muted); }
  .line { overflow-wrap: anywhere; }
  .count { margin: var(--sp-2) 0 0; font-size: var(--fs-12); color: var(--text-muted); }
</style>
