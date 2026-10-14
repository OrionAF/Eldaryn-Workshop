<script>
  /**
   * Menu.svelte - popover list (design-system §4.33). Rendered by the caller while open; on mount it
   * moves focus to the checked (else first) item. Arrow keys rove, Home/End jump, a letter key
   * jumps to the next item starting with it (typeahead), Escape calls `onclose`, Enter/Space/click
   * call `onselect(item)`. Items with `checked` defined are menuitemcheckbox; `separator: true`
   * draws a rule.
   *
   * items: [{ id, label, meta?, checked?, disabled?, separator? }]
   */
  let { items, label = 'Menu', onselect = () => {}, onclose = () => {} } = $props();

  let el = $state(null);

  function buttons() {
    return el ? [...el.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])')] : [];
  }

  $effect(() => {
    if (!el) return;
    const all = buttons();
    (all.find((b) => b.getAttribute('aria-checked') === 'true') ?? all[0])?.focus();
  });

  function onKeyDown(event) {
    const all = buttons();
    const i = all.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = all[(i + 1) % all.length];
    else if (event.key === 'ArrowUp') next = all[(i - 1 + all.length) % all.length];
    else if (event.key === 'Home') next = all[0];
    else if (event.key === 'End') next = all[all.length - 1];
    else if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const ch = event.key.toLowerCase();
      const ordered = [...all.slice(i + 1), ...all.slice(0, i + 1)];
      next = ordered.find((b) => b.textContent.trim().toLowerCase().startsWith(ch));
    }
    if (!next) return;
    event.preventDefault();
    next.focus();
  }
</script>

<div class="menu" role="menu" aria-label={label} tabindex="-1" bind:this={el} onkeydown={onKeyDown}>
  {#each items as item (item.id)}
    {#if item.separator}
      <div class="menu-sep" role="separator"></div>
    {:else}
      <button
        type="button"
        class="menu-item"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked === undefined ? undefined : item.checked}
        aria-disabled={item.disabled ? 'true' : undefined}
        tabindex="-1"
        onclick={() => !item.disabled && onselect(item)}
      >
        <span class="mk" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        <span>{item.label}</span>
        {#if item.meta}<span class="meta">{item.meta}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    min-width: 220px;
    padding: var(--sp-1);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-3);
    box-shadow: var(--elev-2);
    z-index: var(--z-popover);
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: var(--row-h);
    padding: 0 var(--sp-2);
    border-radius: var(--r-1);
    color: var(--text-soft);
    font-family: var(--font-ui);
    font-size: var(--fs-14);
    cursor: pointer;
    width: 100%;
    background: none;
    border: 0;
    text-align: left;
  }
  .menu-item:hover,
  .menu-item:focus-visible { background: var(--surface-4); color: var(--text-ink); }
  .menu-item[aria-disabled='true'] { color: var(--text-muted); cursor: not-allowed; }
  .mk { width: 16px; color: var(--brass-400); }
  .meta { margin-left: auto; font-size: var(--fs-12); color: var(--text-muted); }
  .menu-sep { height: 1px; margin: var(--sp-1) 0; background: var(--line-rule); }
  @media (pointer: coarse), (max-width: 700px) {
    .menu-item { min-height: var(--hit); }
  }
</style>
