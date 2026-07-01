<script>
  /**
   * SelectionStatusRow.svelte - shows the selected slot and the Compare/Edit
   * mode toggle (see CONTEXT.md "Mode: Compare vs. Edit").
   */
  let { selectedSlot, mode, onModeChange } = $props();
</script>

<div class="selection-status-row">
  <span class="slot-status">Slot selected: <strong>{selectedSlot}</strong></span>
  <span class="mode-toggle" role="group" aria-label="Mode">
    Mode:
    <button type="button" class:active={mode === 'compare'} onclick={() => onModeChange('compare')}>
      Compare
    </button>
    <button type="button" class:active={mode === 'edit'} onclick={() => onModeChange('edit')}>
      Edit
    </button>
  </span>
</div>

<style>
  .selection-status-row {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin: 0.75rem 0;
  }
  .mode-toggle button {
    border: 1px solid var(--color-border, #444);
    background: none;
    color: inherit;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }
  .mode-toggle button.active {
    border-color: var(--color-accent, #7aa2f7);
    font-weight: 600;
  }
</style>
