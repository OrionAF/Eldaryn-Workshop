<script>
  /**
   * Drawer.svelte - right-side non-modal inspector (design-system §4.21). The page behind stays
   * readable and interactive. On open, focus moves into the drawer; on close (Escape or the close
   * button) it returns to whatever held it before. Unique heading id per instance.
   */
  let { open = $bindable(false), title, meta, onclose = () => {}, children, footer } = $props();
  const id = $props.id();

  let el = $state(null);
  let opener = null;

  $effect(() => {
    if (open && el) {
      opener = document.activeElement;
      el.focus();
    } else if (!open && opener) {
      if (opener.isConnected) opener.focus?.();
      opener = null;
    }
  });

  function close() {
    open = false;
    onclose();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }
</script>

{#if open}
  <aside class="drawer" bind:this={el} tabindex="-1" aria-labelledby="{id}-title" onkeydown={onKeyDown}>
    <header class="drawer-head">
      <div class="titles">
        <h2 id="{id}-title">{title}</h2>
        {@render meta?.()}
      </div>
      <button type="button" class="close" aria-label="Close" onclick={close}>×</button>
    </header>
    <div class="drawer-body">{@render children?.()}</div>
    {#if footer}<footer class="drawer-foot">{@render footer()}</footer>{/if}
  </aside>
{/if}

<style>
  .drawer {
    position: fixed;
    top: var(--topbar-h);
    right: 0;
    bottom: 0;
    width: var(--drawer-w);
    max-width: 100vw;
    z-index: var(--z-drawer);
    background: var(--surface-2);
    border-left: 1px solid var(--frame-character);
    box-shadow: var(--elev-3);
    display: flex;
    flex-direction: column;
  }
  .drawer:focus-visible { outline: none; }
  .drawer-head {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--plate);
    border-bottom: 1px solid var(--frame-character);
  }
  .titles { flex: 1; min-width: 0; }
  h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-20); line-height: var(--lh-tight); color: var(--text-ink); }
  .close {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-1);
    color: var(--text-soft);
    font-size: var(--fs-20);
    line-height: 1;
    width: 32px;
    height: 32px;
    cursor: pointer;
  }
  .close:hover { color: var(--text-ink); border-color: var(--line-control); }
  .drawer-body { flex: 1; overflow-y: auto; padding: var(--sp-4); display: grid; gap: var(--sp-4); align-content: start; }
  .drawer-foot {
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--line-hairline);
    display: flex;
    gap: var(--sp-2);
    align-items: center;
  }
  @media (max-width: 1100px) {
    .drawer { width: var(--drawer-w-compact); }
  }
  @media (max-width: 700px) {
    .drawer { top: 0; width: 100vw; }
    .close { width: var(--hit); height: var(--hit); }
  }
</style>
