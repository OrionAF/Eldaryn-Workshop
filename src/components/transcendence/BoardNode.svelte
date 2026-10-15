<script>
  /**
   * TranscendenceNode.svelte - one node in the Transcendence grid, positioned
   * absolutely by its caller (TranscendenceGrid) via CSS custom properties.
   * Shape encodes rarity (circle/square/hexagon/large hexagon), a small
   * inline SVG icon encodes category (sword/shield/scroll) - the first icon
   * assets in the app (everywhere else uses plain Unicode glyphs).
   *
   * Purely presentational + a click handler - adjacency/unlock validity is
   * decided by the caller (the store rejects an invalid allocation), this component just reflects `unlocked`/`unlockable`
   * state and forwards taps/hovers.
   */
  import { KIND_LABEL } from './statLabels.js';

  let { node, unlocked = false, unlockable = false, highlighted = false, onSelect = null, onHover = null } = $props();

  const SIDE_ICON = { attack: 'sword', defense: 'shield' };
  const icon = $derived(node.kind === 'socket' ? 'scroll' : (SIDE_ICON[node.side] ?? null));
  const inert = $derived(node.kind === 'socket' || node.kind === 'start');
</script>

<button
  type="button"
  class="tnode {node.kind}"
  class:unlocked
  class:unlockable
  class:highlighted
  class:inert
  disabled={inert}
  style="--col: {node.col + 13}; --row: {node.row + 25};"
  aria-label="{KIND_LABEL[node.kind]} {node.name} at {node.col},{node.row}"
  onclick={() => onSelect?.(node)}
  onpointerenter={(e) => onHover?.(node, e.clientX, e.clientY)}
  onpointerleave={() => onHover?.(null)}
>
  {#if icon === 'sword'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <!-- blade -->
      <path d="M19.5 3 9.5 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <!-- crossguard -->
      <path d="M6.5 10 12 15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <!-- grip -->
      <path d="M9.5 13 5.5 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <!-- pommel -->
      <circle cx="4.5" cy="18.5" r="1.3" fill="currentColor" />
    </svg>
  {:else if icon === 'shield'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <path
        d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6L12 2.5Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  {:else if icon === 'scroll'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <path
        d="M6 4.5h9a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 0 20 19.5M6 4.5A2.5 2.5 0 0 0 3.5 7v10A2.5 2.5 0 0 0 6 19.5h11.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M7.5 8.5h6M7.5 11.5h6M7.5 14.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    </svg>
  {/if}
</button>

<style>
  .tnode {
    position: absolute;
    /* left/top mark the grid point's center, not a corner - translate(-50%,
       -50%) keeps every shape centered on it regardless of that shape's own
       box size, so rarities with a bigger box (uncommon/sigil) don't drift
       toward the bottom-right of their cell. */
    left: calc(var(--col) * var(--cell-size, 32px));
    top: calc(var(--row) * var(--cell-size, 32px));
    transform: translate(-50%, -50%);
    width: var(--node-size, 24px);
    height: var(--node-size, 24px);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-3);
    border: 1.5px solid var(--line-control);
    color: var(--text-muted);
    cursor: not-allowed;
    transition: none;
  }
  .tnode:hover {
    border-color: var(--line-control);
  }

  /* Rarity shapes */
  .tnode.minor {
    border-radius: 50%;
  }
  .tnode.notable {
    border-radius: var(--r-2);
    width: calc(var(--node-size, 24px) * 1.2);
    height: calc(var(--node-size, 24px) * 1.2);
  }
  /* A flat-top regular hexagon needs a ~1 : 0.866 width:height box for this
     vertex set - a square box (1:1) stretches it tall on the sides, which
     is what "uneven/wonky" sides looks like. */
  .tnode.socket {
    width: var(--node-size, 24px);
    height: calc(var(--node-size, 24px) * 0.866);
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  }
  .tnode.start {
    border-radius: 50%;
    border-color: var(--brass-400);
    color: var(--brass-200);
    background: var(--brass-tint);
  }
  .tnode.sigil {
    width: calc(var(--node-size, 24px) * 1.4);
    height: calc(var(--node-size, 24px) * 1.4 * 0.866);
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  }

  .tnode.inert {
    cursor: default;
    opacity: 0.35;
    border-style: dashed;
  }

  /* "Can select" and "already selected" differ in hue and fill, not only in fill: the up colour for
     available, brass for allocated (design-system §4.29). */
  .tnode.unlockable {
    cursor: pointer;
    border-color: var(--verdict-up);
    color: var(--verdict-up);
  }
  .tnode.unlockable:hover {
    background: var(--verdict-up-tint);
  }

  .tnode.unlocked {
    cursor: pointer;
    background: var(--brass-400);
    border-color: var(--brass-200);
    color: var(--on-brass);
  }
  .tnode.unlocked:hover {
    background: var(--brass-200);
  }

  /* Node-filter match ring - an outline (not the border) so it layers on
     top of the unlockable/unlocked border colors without replacing them.
     Only common/uncommon nodes carry stats, so the clip-path shapes (glyph/
     sigil), which would clip an outline, never receive this class. */
  .tnode.highlighted {
    outline: 2px solid var(--brass-200);
    outline-offset: 2px;
  }

  .icon {
    width: 55%;
    height: 55%;
  }
</style>
