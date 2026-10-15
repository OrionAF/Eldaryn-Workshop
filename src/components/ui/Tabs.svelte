<script>
  /**
   * Tabs.svelte - underline tabs (design-system §4.4). WAI-ARIA tablist: roving tabindex, Arrow
   * keys (skipping disabled tabs), Home/End. Each tab's aria-controls is `${prefix}-panel-${id}`
   * so the caller can mark its panel `role="tabpanel" id=...`. A disabled tab with a `reason`
   * cannot be selected and carries the reason as its title.
   *
   * items: [{ id, label, count?, sub?, disabled?, reason? }]
   */
  let { items, value = $bindable(), label = 'Sections', idPrefix = undefined, onchange = () => {} } = $props();
  const uid = $props.id();
  const prefix = $derived(idPrefix ?? uid);

  const enabled = $derived(items.filter((t) => !t.disabled));
  const focusId = $derived(items.some((t) => t.id === value && !t.disabled) ? value : enabled[0]?.id);

  function select(tab) {
    if (tab.disabled) return;
    value = tab.id;
    onchange(tab.id);
  }

  function onKeyDown(event) {
    if (enabled.length === 0) return;
    const i = enabled.findIndex((t) => t.id === focusId);
    let next = null;
    if (event.key === 'ArrowRight') next = enabled[(i + 1) % enabled.length];
    else if (event.key === 'ArrowLeft') next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next);
    [...event.currentTarget.querySelectorAll('[data-tab]')].find((b) => b.dataset.tab === String(next.id))?.focus();
  }
</script>

<div class="tabs" role="tablist" aria-label={label} tabindex="-1" onkeydown={onKeyDown}>
  {#each items as tab (tab.id)}
    <button
      type="button"
      role="tab"
      class="tab"
      data-tab={tab.id}
      id="{prefix}-tab-{tab.id}"
      aria-controls="{prefix}-panel-{tab.id}"
      aria-selected={tab.id === value}
      aria-disabled={tab.disabled ? 'true' : undefined}
      title={tab.disabled ? tab.reason : undefined}
      aria-description={tab.disabled && tab.reason ? tab.reason : undefined}
      tabindex={tab.id === focusId ? 0 : -1}
      onclick={() => select(tab)}
    >
      {tab.label}
      {#if tab.count != null}<span class="num">{tab.count}</span>{/if}
      {#if tab.sub}<span class="sub">{tab.sub}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; gap: var(--sp-1); border-bottom: 1px solid var(--line-hairline); overflow-x: auto; }
  .tab {
    position: relative;
    height: 36px;
    padding: 0 var(--sp-3);
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--text-soft);
    font-family: var(--font-ui);
    font-weight: var(--fw-medium);
    font-size: var(--fs-14);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .tab:hover { color: var(--text-ink); }
  .tab[aria-selected='true'] { color: var(--text-ink); font-weight: var(--fw-bold); }
  .tab[aria-selected='true']::after {
    content: '';
    position: absolute;
    left: var(--sp-2);
    right: var(--sp-2);
    bottom: -1px;
    height: 3px;
    background: var(--brass-400);
  }
  .tab[aria-disabled='true'] { color: var(--text-muted); cursor: not-allowed; }
  .tab[aria-disabled='true']:hover { color: var(--text-muted); }
  .sub { font-size: var(--fs-12); color: var(--text-muted); font-weight: var(--fw-regular); }
  .num { font-family: var(--font-data); font-size: var(--fs-12); color: var(--text-muted); }
  @media (pointer: coarse), (max-width: 700px) {
    .tab { min-height: var(--hit); }
  }
</style>
