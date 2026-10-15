<script>
  /**
   * PresetMenu.svelte - a "Equipped in ▾" / "Ridden in ▾" button that opens a Menu naming every
   * preset (ia.md §4.1: no action on a hidden active preset). `items` is
   * [{id, label, checked, disabled?, meta?}]; picking one calls `onselect(id)` and closes.
   */
  import Button from '../ui/Button.svelte';
  import Menu from '../ui/Menu.svelte';

  let { label, items, onselect = () => {}, disabled = false, reason = '' } = $props();
  let open = $state(false);
  let wrap = $state(null);

  const on = $derived(items.filter((i) => i.checked).map((i) => i.label));

  function close() {
    open = false;
    wrap?.querySelector('button[aria-haspopup]')?.focus();
  }
</script>

<svelte:window onclick={(e) => open && wrap && !wrap.contains(e.target) && (open = false)} />

<span class="preset-menu" bind:this={wrap}>
  <Button size="small" {disabled} {reason} aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
    {label}: {on.length ? on.join(', ') : 'none'} ▾
  </Button>
  {#if open}
    <span class="drop">
      <Menu
        {label}
        items={items.map((i) => ({ ...i, checked: !!i.checked }))}
        onselect={(item) => {
          onselect(item.id);
          close();
        }}
        onclose={close}
      />
    </span>
  {/if}
</span>

<style>
  .preset-menu { position: relative; display: inline-block; }
  .drop { position: absolute; top: calc(100% + var(--sp-1)); left: 0; z-index: var(--z-popover); }
</style>
