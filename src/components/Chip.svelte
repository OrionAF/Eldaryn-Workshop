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
  class:compact={size === 'compact'}
  style={selected && color ? `--chip-color: ${color}` : ''}
  {disabled}
  onclick={onClick}
>
  {label}
</button>

<style>
  .chip {
    border-radius: var(--radius-chip);
    border: 1px solid #3a3468;
    background: none;
    color: #8d86b8;
    font-size: 12px;
    padding: 6px 13px;
    white-space: nowrap;
  }
  .chip.small {
    border-radius: var(--radius-pill);
    font-size: 10.5px;
    padding: 3px 9px;
  }
  .chip.compact {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid var(--color-border);
    color: var(--color-dim);
  }
  /* Drop Check's slot-filter row (the only "small" usage) sits in a
     horizontal-scroll strip on mobile - trading a little extra width for a
     real touch target is free there. */
  @media (max-width: 700px) {
    .chip.small {
      padding: 13px 11px;
    }
  }
  .chip.selected {
    font-weight: 600;
    border-color: var(--chip-color, var(--color-gold));
    color: var(--chip-color, var(--color-gold-light));
    background: var(--chip-color-tint, var(--color-gold-tint));
  }
  .chip.compact.selected {
    border-color: var(--chip-color, var(--color-gold));
    background: rgba(217, 169, 75, 0.08);
    color: var(--chip-color, var(--color-gold));
  }
  .chip:hover:not(:disabled) {
    border-color: var(--chip-color, var(--color-gold));
  }
</style>
