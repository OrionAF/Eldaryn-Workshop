<script>
  /**
   * ConfirmButton.svelte - a destructive action that requires a second
   * click to fire ("click Remove, then click Confirm remove"). No typing -
   * unlike SettingsPanel's hard-reset (deliberately a higher, type-to-confirm
   * bar for wiping the whole app's data), this is for narrower, single-item
   * destructive actions (removing one Pet/Mount/Glyph, resetting one build).
   */
  let { label, confirmLabel = 'Confirm', prompt = '', onConfirm, disabled = false, class: className = '' } = $props();

  let confirming = $state(false);

  function confirm() {
    confirming = false;
    onConfirm();
  }
</script>

{#if !confirming}
  <button type="button" class={className} {disabled} onclick={() => (confirming = true)}>{label}</button>
{:else}
  <span class="confirm-row">
    {#if prompt}<span class="confirm-prompt">{prompt}</span>{/if}
    <button type="button" class="confirm-yes" onclick={confirm}>{confirmLabel}</button>
    <button type="button" onclick={() => (confirming = false)}>Cancel</button>
  </span>
{/if}

<style>
  .confirm-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    flex-wrap: wrap;
  }
  .confirm-prompt {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .confirm-yes {
    border-color: var(--color-danger, #c1594f);
    color: var(--color-danger, #c1594f);
  }
</style>
