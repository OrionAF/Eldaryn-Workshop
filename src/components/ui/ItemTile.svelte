<script>
  /**
   * ItemTile.svelte - a gear/relic/glyph tile (design-system §4.23). A button on `--surface-3`
   * with a 4 px rarity edge that survives selection; the name uses `--r-up` (the on-raised
   * rarity text). Rarity is also in the accessible name as text. `empty` renders the dashed
   * "add" tile. `rarity` is a tier name from format.js RARITY_ORDER.
   */
  import { RARITY_ORDER } from '../../lib/format.js';

  let {
    name = '',
    rarity = null,
    meta,
    art = null,
    selected = false,
    disabled = false,
    empty = false,
    emptyLabel = 'Add an item',
    onclick = () => {},
  } = $props();

  const tier = $derived(RARITY_ORDER.includes(rarity) ? rarity.toLowerCase() : null);
  const vars = $derived(
    tier
      ? `--r-up: var(--rarity-${tier}-fg-on-raised); --r-edge: var(--rarity-${tier}-fg-on-raised); --r-fg: var(--rarity-${tier}-fg-on-raised)`
      : '',
  );
</script>

<button
  type="button"
  class="tile"
  class:is-empty={empty}
  style={vars}
  aria-pressed={empty ? undefined : selected}
  aria-disabled={disabled ? 'true' : undefined}
  onclick={(e) => !disabled && onclick(e)}
>
  <span class="art" aria-hidden="true">{#if art}<img src={art} alt="" />{:else if empty}+{/if}</span>
  <span class="body">
    <span class="name">{name}{#if tier && !empty}<span class="visually-hidden"> ({rarity})</span>{/if}</span>
    <span class="meta">{#if empty}{emptyLabel}{:else}{@render meta?.()}{/if}</span>
  </span>
  {#if tier && !empty}<span class="gem" aria-hidden="true"></span>{/if}
</button>

<style>
  .tile {
    position: relative;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: center;
    min-height: 64px;
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface-3);
    color: inherit;
    text-align: left;
    font-family: var(--font-ui);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
    cursor: pointer;
    box-shadow: inset 4px 0 0 var(--r-edge, var(--line-rule)), inset 0 0 18px color-mix(in srgb, var(--r-edge, transparent) 8%, transparent);
    transition: background-color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out);
  }
  .art {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-1);
    background: var(--surface-1);
    color: var(--text-muted);
    border: 1px solid var(--r-edge, var(--line-rule));
  }
  .art img { width: 34px; height: 34px; object-fit: contain; }
  .body { display: grid; min-width: 0; }
  .name {
    font-weight: var(--fw-bold);
    font-size: var(--fs-14);
    color: var(--r-up, var(--text-ink));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.25;
  }
  .meta { font-size: var(--fs-12); color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile:hover { background: var(--surface-4); border-color: var(--line-control-hover); }
  .tile:active { background: var(--surface-3); }
  .tile[aria-pressed='true'] {
    background: var(--surface-4);
    border-color: var(--ember-500);
    box-shadow: inset 4px 0 0 var(--r-edge, var(--line-rule)), 0 0 0 1px var(--ember-500), inset 0 0 18px color-mix(in srgb, var(--r-edge, transparent) 8%, transparent);
  }
  .tile[aria-disabled='true'] { opacity: 0.6; cursor: not-allowed; }
  .gem { position: absolute; top: 8px; right: 8px; width: 7px; height: 7px; transform: rotate(45deg); background: var(--r-edge); }
  .tile.is-empty { box-shadow: none; border-style: dashed; background: transparent; }
  .tile.is-empty .art { border-style: dashed; border-color: var(--line-control); }
  .tile.is-empty .name { color: var(--text-soft); font-weight: var(--fw-medium); }
</style>
