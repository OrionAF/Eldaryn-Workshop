<script>
  /**
   * ConfirmAction.svelte - a single-item destructive action with a second press, built on ui/Button
   * (variant danger, `confirming`). Same contract as ConfirmButton.svelte, which still styles itself
   * with the retired global .btn-danger; the tool pages use this one. An unanswered confirm reverts
   * after REVERT_MS (design-system §4.10), and focus moves to the confirming button (ia.md §5.5).
   */
  import { onDestroy } from 'svelte';
  import Button from '../ui/Button.svelte';

  const REVERT_MS = 4000;

  let { label, confirmLabel = 'Confirm', prompt = '', onConfirm, disabled = false, size = 'small' } = $props();

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
  $effect(() => {
    if (confirming) row?.querySelector('button')?.focus();
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if !confirming}
  <Button variant="danger" {size} {disabled} onclick={arm}>{label}</Button>
{:else}
  <span class="confirm-row" bind:this={row} role="group" aria-label={label}>
    {#if prompt}<span class="prompt">{prompt}</span>{/if}
    <Button variant="danger" {size} confirming onclick={confirm}>{confirmLabel}</Button>
    <Button variant="ghost" {size} onclick={disarm}>Cancel</Button>
  </span>
{/if}

<style>
  .confirm-row { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
  .prompt { font-size: var(--fs-12); color: var(--text-soft); }
</style>
