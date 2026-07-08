<script>
  /**
   * TranscendenceNode.svelte - one node in the Transcendence grid, positioned
   * absolutely by its caller (TranscendenceGrid) via CSS custom properties.
   * Shape encodes rarity (circle/square/hexagon/large hexagon), a small
   * inline SVG icon encodes category (sword/shield/scroll) - the first icon
   * assets in the app (everywhere else uses plain Unicode glyphs).
   *
   * Purely presentational + a click handler - adjacency/unlock validity is
   * decided by the caller (rosterStore.setTranscendenceNode already rejects
   * an invalid unlock), this component just reflects `unlocked`/`unlockable`
   * state and forwards taps/hovers.
   */
  let { node, unlocked = false, unlockable = false, highlighted = false, onSelect = null, onHover = null } = $props();

  const CATEGORY_ICON = { offense: 'sword', defense: 'shield', glyph: 'scroll' };
  const icon = $derived(CATEGORY_ICON[node.category] ?? null);
</script>

<button
  type="button"
  class="tnode {node.type}"
  class:unlocked
  class:unlockable
  class:highlighted
  class:inert={node.type === 'glyph'}
  disabled={node.type === 'glyph'}
  style="--col: {node.position.split(':')[0]}; --row: {node.position.split(':')[1]};"
  aria-label="{node.type} node at {node.position}"
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
    background: var(--color-field);
    border: 1.5px solid var(--color-border-strong);
    color: var(--color-muted);
    cursor: not-allowed;
    transition: none;
  }
  .tnode:hover {
    border-color: var(--color-border-strong);
  }

  /* Rarity shapes */
  .tnode.common {
    border-radius: 50%;
  }
  .tnode.uncommon {
    border-radius: 3px;
    width: calc(var(--node-size, 24px) * 1.2);
    height: calc(var(--node-size, 24px) * 1.2);
  }
  /* A flat-top regular hexagon needs a ~1 : 0.866 width:height box for this
     vertex set - a square box (1:1) stretches it tall on the sides, which
     is what "uneven/wonky" sides looks like. */
  .tnode.glyph {
    width: var(--node-size, 24px);
    height: calc(var(--node-size, 24px) * 0.866);
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
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

  /* Distinct colors for "can select" vs "already selected", not just a
     background fill on the same hue - moss-green for available, the
     existing copper accent (used for selection/active state elsewhere in
     the app) for already-unlocked. */
  .tnode.unlockable {
    cursor: pointer;
    border-color: var(--color-upgrade);
    color: var(--color-upgrade);
  }
  .tnode.unlockable:hover {
    background: var(--color-upgrade-soft);
  }

  .tnode.unlocked {
    cursor: pointer;
    background: rgba(217, 169, 75, 0.18);
    border-color: var(--color-gold);
    color: var(--color-gold-light);
  }
  .tnode.unlocked:hover {
    background: var(--color-gold);
    color: var(--color-bg);
  }

  /* Node-filter match ring - an outline (not the border) so it layers on
     top of the unlockable/unlocked border colors without replacing them.
     Only common/uncommon nodes carry stats, so the clip-path shapes (glyph/
     sigil), which would clip an outline, never receive this class. */
  .tnode.highlighted {
    outline: 2px solid var(--nav-transcendence-light);
    outline-offset: 2px;
  }

  .icon {
    width: 55%;
    height: 55%;
  }
</style>
