<script>
  /**
   * Chip.svelte - the selection-pill primitive used throughout the redesign
   * (gear-loadout picker, talent-set picker, pet/relic picker in the preset
   * editor, drop-check slot picker). Selected state defaults to gold; pass
   * `color` to override (e.g. a relic's tier color).
   */
  let { label, selected = false, color = null, onClick, disabled = false, size = 'default' } = $props();
</script>

<button
  type="button"
  class="chip"
  class:selected
  class:small={size === 'small'}
  style={selected && color ? `--chip-color: ${color}` : ''}
  {disabled}
  onclick={onClick}
>
  {label}
</button>

<style>
  .chip {
    border-radius: var(--radius-chip);
    border: 1px solid var(--color-border-strong);
    background: var(--color-field);
    color: var(--color-muted);
    font-size: 0.8rem;
    padding: 0.35rem 0.7rem;
    white-space: nowrap;
  }
  .chip.small {
    border-radius: var(--radius-pill);
    font-size: 10.5px;
    padding: 3px 9px;
  }
  .chip.selected {
    border-color: var(--chip-color, var(--color-gold));
    color: var(--chip-color, var(--color-gold-light));
    background: var(--chip-color-tint, var(--color-gold-tint));
  }
  .chip:hover:not(:disabled) {
    border-color: var(--chip-color, var(--color-gold));
  }
</style>
