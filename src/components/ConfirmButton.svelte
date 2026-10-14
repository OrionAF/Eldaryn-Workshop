<script>
  /**
   * ConfirmButton.svelte - a destructive action that requires a second
   * click to fire ("click Remove, then click Confirm remove"). No typing -
   * unlike SettingsPanel's hard-reset (deliberately a higher, type-to-confirm
   * bar for wiping the whole app's data), this is for narrower, single-item
   * destructive actions (removing one Pet/Mount/Glyph, resetting one build).
   */
  import { onDestroy } from 'svelte';

  /** A confirm that nobody answers reverts after this long (design-system §4.10). */
  const REVERT_MS = 4000;

  let { label, confirmLabel = 'Confirm', prompt = '', onConfirm, disabled = false, class: className = '' } = $props();

  let confirming = $state(false);
  let row = $state(null);
  let timer = null;

  function arm() {
    confirming = true;
    clearTimeout(timer);
    timer = setTimeout(disarm, REVERT_MS);
  }
  function disarm() {
    clearTimeout(timer);
    confirming = false;
  }
  function confirm() {
    disarm();
    onConfirm();
  }

  // Moving to Confirm keeps the keyboard user where the action is (ia.md §5.5).
  $effect(() => {
    if (confirming) row?.querySelector('.confirm-yes')?.focus();
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if !confirming}
  <button type="button" class={className} {disabled} onclick={arm}>{label}</button>
{:else}
  <span class="confirm-row" bind:this={row} role="group" aria-label={label}>
    {#if prompt}<span class="confirm-prompt">{prompt}</span>{/if}
    <button type="button" class="confirm-yes" onclick={confirm}>{confirmLabel}</button>
    <button type="button" onclick={disarm}>Cancel</button>
  </span>
{/if}

<style>
  .confirm-row {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }
  .confirm-prompt {
    color: var(--text-muted);
    font-size: var(--fs-12);
  }
  .confirm-yes {
    border-color: var(--verdict-down);
    color: var(--verdict-down);
  }
</style>
