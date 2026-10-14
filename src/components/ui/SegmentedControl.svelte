<script>
  /**
   * SegmentedControl.svelte - 2-4 mutually exclusive options that change a view immediately
   * (design-system §4.5). A role=group of button[aria-pressed]; Left/Right move the selection.
   *
   * options: [{ value, label, sub?, disabled? }]; `sub` is the mono sub-label (Effort's N range).
   */
  let { options, value = $bindable(), label = '', onchange = () => {} } = $props();

  function pick(opt) {
    if (opt.disabled || opt.value === value) return;
    value = opt.value;
    onchange(opt.value);
  }

  function onKeyDown(event) {
    const live = options.filter((o) => !o.disabled);
    const i = live.findIndex((o) => o.value === value);
    let next = null;
    if (event.key === 'ArrowRight') next = live[Math.min(live.length - 1, i + 1)];
    else if (event.key === 'ArrowLeft') next = live[Math.max(0, i - 1)];
    if (!next) return;
    event.preventDefault();
    pick(next);
    [...event.currentTarget.querySelectorAll('[data-value]')].find((b) => b.dataset.value === String(next.value))?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="seg" role="group" aria-label={label || undefined} tabindex="-1" onkeydown={onKeyDown}>
  {#each options as opt (opt.value)}
    <button
      type="button"
      data-value={opt.value}
      aria-pressed={opt.value === value}
      disabled={opt.disabled}
      onclick={() => pick(opt)}
    >
      {opt.label}{#if opt.sub}<span class="num">{opt.sub}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    background: var(--surface-2);
    padding: 2px;
    gap: 2px;
  }
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
    height: calc(var(--control-h) - 6px);
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: var(--r-1);
    background: transparent;
    cursor: pointer;
    color: var(--text-soft);
    font-family: var(--font-ui);
    font-weight: var(--fw-medium);
    font-size: var(--fs-14);
  }
  button:hover { color: var(--text-ink); background: var(--surface-3); }
  button:active { background: var(--surface-4); }
  button[aria-pressed='true'] { background: var(--surface-4); color: var(--text-ink); font-weight: var(--fw-bold); }
  button[aria-pressed='true']::after {
    content: '';
    position: absolute;
    left: var(--sp-2);
    right: var(--sp-2);
    bottom: 0;
    height: 3px;
    background: var(--brass-400);
  }
  button:disabled { color: var(--text-disabled); cursor: not-allowed; background: transparent; }
  .num { font-family: var(--font-data); font-size: var(--fs-12); color: var(--text-muted); }
  @media (pointer: coarse), (max-width: 700px) {
    button { min-height: calc(var(--hit) - 6px); }
  }
</style>
