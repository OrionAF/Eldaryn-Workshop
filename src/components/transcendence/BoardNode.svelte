<script>
  /**
   * TranscendenceNode.svelte - one node in the Transcendence grid, positioned
   * absolutely by its caller (TranscendenceGrid) via CSS custom properties.
   * Drawn like the in-game board (design-system §4.29): dark round common nodes and rounded-square
   * uncommon nodes carrying the extracted emblem, a gold core, teal "Soon" glyph sockets and a large
   * round Ancient Sigil node.
   *
   * Purely presentational + a click handler - adjacency/unlock validity is
   * decided by the caller (the store rejects an invalid allocation), this component just reflects `unlocked`/`unlockable`
   * state and forwards taps/hovers. `cost` is the Ichor the next allocation would take, shown on unlockable nodes.
   */
  import { KIND_LABEL } from './statLabels.js';
  import { transcendenceImage } from '../../lib/assets/transcendence.js';

  let { node, unlocked = false, unlockable = false, highlighted = false, readOnly = false, cost = null, onSelect = null, onHover = null } = $props();

  const SIDE_ICON = { attack: 'sword', defense: 'shield' };
  const icon = $derived(node.kind === 'socket' ? 'hex' : (SIDE_ICON[node.side] ?? null));
  const emblem = $derived(transcendenceImage(node));
  const inert = $derived(node.kind === 'socket' || node.kind === 'start');
  const showCost = $derived(unlockable && cost != null);
  const checked = $derived(unlocked && (node.kind === 'notable' || node.kind === 'sigil'));
  const stateText = $derived(readOnly ? (unlocked ? ', allocated' : ', not allocated') : showCost ? `, costs ${cost} Ichor` : unlocked ? ', allocated' : '');
</script>

<button
  type="button"
  class="tnode {node.kind}"
  class:unlocked
  class:unlockable
  class:highlighted
  class:inert
  class:read-only={readOnly}
  disabled={inert && !readOnly}
  style="--col: {node.col + 13}; --row: {node.row + 25};"
  aria-label="{KIND_LABEL[node.kind]} {node.name} at {node.col},{node.row}{stateText}"
  onclick={() => onSelect?.(node)}
  onpointerenter={(e) => onHover?.(node, e.clientX, e.clientY)}
  onpointerleave={() => onHover?.(null)}
  onfocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); onHover?.(node, r.right, r.top); }}
  onblur={() => onHover?.(null)}
>
  {#if emblem}
    <img class="emblem" src={emblem} alt="" draggable="false" />
  {:else if icon === 'sword'}
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
  {:else if icon === 'hex'}
    <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
      <path d="M12 3.5 19.4 7.75v8.5L12 20.5l-7.4-4.25v-8.5L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
    </svg>
  {/if}
  {#if node.kind === 'socket'}<span class="soon" aria-hidden="true">Soon</span>{/if}
  {#if showCost}<span class="cost num" aria-hidden="true">{cost}</span>{/if}
  {#if checked}
    <span class="check" aria-hidden="true">
      <svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </span>
  {/if}
</button>

<style>
  .tnode {
    position: absolute;
    /* left/top mark the grid point's center, not a corner - translate(-50%,
       -50%) keeps every shape centered on it regardless of that shape's own
       box size, so bigger kinds (notable/sigil) don't drift toward the
       bottom-right of their cell. */
    left: calc(var(--col) * var(--cell-size, 32px));
    top: calc(var(--row) * var(--cell-size, 32px));
    transform: translate(-50%, -50%);
    width: var(--node-size, 24px);
    height: var(--node-size, 24px);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tc-node);
    border: 1.5px solid var(--tc-node-ring);
    border-radius: 50%;
    color: var(--text-muted);
    cursor: not-allowed;
    transition: none;
  }

  /* Kinds */
  .tnode.notable {
    border-radius: var(--r-2);
    width: calc(var(--node-size, 24px) * 1.25);
    height: calc(var(--node-size, 24px) * 1.25);
  }
  .tnode.socket {
    border-radius: var(--r-2);
    width: calc(var(--node-size, 24px) * 1.15);
    height: calc(var(--node-size, 24px) * 1.15);
    border-color: var(--tc-socket);
    background: var(--tc-socket-tint);
    color: var(--tc-socket);
  }
  .tnode.start {
    width: calc(var(--node-size, 24px) * 1.5);
    height: calc(var(--node-size, 24px) * 1.5);
    border: 0;
    background: var(--tc-core);
    color: var(--tc-on-core);
    box-shadow: 0 0 12px var(--tc-core);
  }
  .tnode.sigil {
    width: calc(var(--node-size, 24px) * 1.7);
    height: calc(var(--node-size, 24px) * 1.7);
    border: 2px solid var(--tc-sigil);
    color: var(--tc-sigil);
  }
  .tnode.inert { cursor: default; }

  /* Reachable: a dashed ring and the Ichor cost; allocated: a solid ring with a glow (the game's
     two states differ in line style and the cost badge, not in colour alone). */
  .tnode.unlockable {
    cursor: pointer;
    border-style: dashed;
    border-color: var(--tc-reachable-ring);
    color: var(--text-ink);
  }
  .tnode.unlockable:hover { border-color: var(--tc-allocated); }

  .tnode.unlocked {
    cursor: pointer;
    border: 2px solid var(--tc-allocated);
    /* Opaque, so the links drawn underneath never show through the node. */
    background: linear-gradient(var(--tc-allocated-tint), var(--tc-allocated-tint)) var(--tc-node);
    box-shadow: var(--tc-allocated-glow);
    color: var(--text-ink);
  }
  .tnode.unlocked:hover { background: var(--tc-node); }
  .tnode.start.unlocked { background: var(--tc-core); border: 0; box-shadow: 0 0 12px var(--tc-core); }
  .tnode.read-only { cursor: help; }

  /* Node-filter match ring - an outline (not the border) so it layers on
     top of the unlockable/unlocked border without replacing it. */
  .tnode.highlighted {
    outline: 2px solid var(--brass-200);
    outline-offset: 2px;
  }

  .icon {
    width: 55%;
    height: 55%;
  }
  .emblem {
    width: 88%;
    height: 88%;
    object-fit: contain;
    pointer-events: none;
  }

  /* Badges sit on the node's edge in node-size units, so they scale with the board. */
  .cost, .soon {
    position: absolute;
    left: 50%;
    bottom: calc(var(--node-size, 24px) * -0.28);
    transform: translateX(-50%);
    padding: 0 calc(var(--node-size, 24px) * 0.12);
    border-radius: var(--r-pill);
    font-size: calc(var(--node-size, 24px) * 0.32);
    line-height: 1.3;
    white-space: nowrap;
    pointer-events: none;
  }
  .cost {
    display: flex;
    align-items: center;
    gap: calc(var(--node-size, 24px) * 0.08);
    background: var(--tc-board);
    color: var(--text-soft);
  }
  .cost::before {
    content: '';
    width: calc(var(--node-size, 24px) * 0.16);
    height: calc(var(--node-size, 24px) * 0.16);
    border-radius: 50%;
    background: var(--tc-allocated);
  }
  .soon {
    background: var(--tc-board);
    border: 1px solid var(--tc-socket);
    color: var(--tc-socket);
    text-transform: uppercase;
    letter-spacing: var(--track-label);
    font-size: calc(var(--node-size, 24px) * 0.26);
  }
  .check {
    position: absolute;
    top: calc(var(--node-size, 24px) * -0.2);
    right: calc(var(--node-size, 24px) * -0.2);
    width: calc(var(--node-size, 24px) * 0.42);
    height: calc(var(--node-size, 24px) * 0.42);
    display: flex;
    border-radius: 50%;
    background: var(--tc-board);
    border: 1px solid var(--text-ink);
    color: var(--text-ink);
    pointer-events: none;
  }
  .check svg { width: 100%; height: 100%; }
</style>
