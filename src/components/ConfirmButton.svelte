<script>
  /**
   * ConfirmButton.svelte - the one two-press confirm for a single-item destructive action ("click
   * Remove, then click Confirm remove"), built on ui/Button (design-system §4.10). No typing: the
   * type-to-confirm bar is reserved for wiping the whole app's data (settings/DangerZone).
   *
   * The second button reads "Confirm <verb>", the verb being the label's first word, so every confirm
   * in the app is worded the same way; pass `confirmLabel` only when that would read wrong.
   */
  import { onDestroy } from 'svelte';
  import Button from './ui/Button.svelte';

  /** A confirm that nobody answers reverts after this long (design-system §4.10). */
  const REVERT_MS = 4000;

  let { label, confirmLabel = null, prompt = '', onConfirm, disabled = false, reason = '', variant = 'danger', size = 'default' } = $props();

  const yesLabel = $derived(confirmLabel ?? `Confirm ${String(label).trim().split(/\s+/)[0].toLowerCase()}`);

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
    if (confirming) row?.querySelector('[data-confirm-yes]')?.focus();
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if !confirming}
  <Button {variant} {size} {disabled} {reason} onclick={arm}>{label}</Button>
{:else}
  <span class="confirm-row" bind:this={row} role="group" aria-label={label}>
    {#if prompt}<span class="confirm-prompt">{prompt}</span>{/if}
    <Button variant="danger" {size} confirming data-confirm-yes onclick={confirm}>{yesLabel}</Button>
    <Button variant="ghost" {size} onclick={disarm}>Cancel</Button>
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
    color: var(--text-soft);
    font-size: var(--fs-12);
  }
</style>
