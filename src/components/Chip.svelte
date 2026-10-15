<script>
  /**
   * Chip.svelte - the selection pill (design-system §4.9). A toggle chip (button, aria-pressed)
   * with a check tick, or a static label chip (`static`). Selected is brass; pass `color` to
   * override the accent (a relic's tier colour). `count` is the optional mono count.
   *
   * `disabled` with a `reason` is the "not owned" state: it stays focusable (aria-disabled), is
   * dashed, and the reason is the title and visible-to-assistive-tech text. Without a reason a
   * disabled chip is natively disabled.
   */
  let {
    label,
    selected = false,
    color = null,
    onClick = () => {},
    disabled = false,
    reason = '',
    count = null,
    static: isStatic = false,
    size = 'default',
  } = $props();

  const soft = $derived(disabled && !!reason);
</script>

{#if isStatic}
  <span class="chip static" class:small={size === 'small'} class:compact={size === 'compact'}>{label}{#if count != null}<span class="num">{count}</span>{/if}</span>
{:else}
  <button
    type="button"
    class="chip"
    class:selected
    class:small={size === 'small'}
    class:compact={size === 'compact'}
    style={selected && color ? `--chip-color: ${color}` : ''}
    aria-pressed={selected}
    disabled={disabled && !reason}
    aria-disabled={soft ? 'true' : undefined}
    title={soft ? reason : undefined}
    onclick={() => !disabled && onClick()}
  >
    <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg></span>{label}{#if count != null}<span class="num">{count}</span>{/if}
    {#if soft}<span class="visually-hidden"> ({reason})</span>{/if}
  </button>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    background: transparent;
    color: var(--text-soft);
    font-family: var(--font-ui);
    font-size: var(--fs-13);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
  }
  .chip.small { height: 24px; font-size: var(--fs-12); padding: 0 var(--sp-2) 0 6px; }
  .chip.compact { height: 24px; font-size: var(--fs-12); }
  .chip:hover:not(:disabled):not([aria-disabled='true']) {
    color: var(--text-ink);
    border-color: var(--chip-color, var(--line-control-hover));
    background: var(--surface-3);
  }
  .tick {
    width: 12px;
    height: 12px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-control);
    border-radius: 2px;
    color: transparent;
  }
  .tick svg { width: 9px; height: 9px; }
  .chip.selected {
    color: var(--text-ink);
    border-color: var(--chip-color, var(--brass-500));
    background: var(--brass-tint);
  }
  .chip.selected .tick { background: var(--chip-color, var(--brass-400)); border-color: var(--chip-color, var(--brass-400)); color: var(--on-brass); }
  .num { font-family: var(--font-data); color: var(--text-muted); font-size: var(--fs-12); }
  .chip.static { cursor: default; padding-left: var(--sp-3); }
  .chip:disabled,
  .chip[aria-disabled='true'] {
    color: var(--text-disabled);
    border-color: var(--line-rule);
    border-style: dashed;
    background: transparent;
    cursor: not-allowed;
  }
  @media (pointer: coarse), (max-width: 700px) {
    .chip { min-height: var(--hit); }
  }
</style>
