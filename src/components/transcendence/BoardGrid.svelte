<script>
  /**
   * BoardGrid.svelte - the pan/zoom canvas. Real DOM elements
   * (TranscendenceNode buttons) absolutely positioned by column:row inside
   * one wrapper div panned/zoomed via `transform: translate() scale()` - not
   * SVG/Canvas, matching the rest of the app's 100% DOM approach and keeping
   * hover/click as plain DOM events.
   *
   * Pan: pointerdown/pointermove/pointerup drag (unified mouse/touch/pen via
   * the Pointer Events API - single-finger touch-drag already works from
   * this alone). Zoom: mouse wheel on desktop, or two-finger pinch on
   * touch - tracked via a Map of active pointers; a second pointer joining
   * switches from single-finger pan to pinch-zoom (toward the midpoint
   * between the two touches) until either finger lifts.
   */
  import { canAllocateNode, allocCost, boardGraph } from '../../lib/transcendence.js';
  import { TRANSCENDENCE_TIERS } from '../../lib/game/transcendence.js';
  import BoardNode from './BoardNode.svelte';
  import { fitView } from './boardView.js';
  import Button from '../ui/Button.svelte';

  let { boardKey, nodes, allocatedIds = [], highlightStats = null, highlightIds = null, readOnly = false, compact = false, onActivate = null, onSelect = null, onHover = null } = $props();

  // Same 700px breakpoint as the rest of the mobile nav contract - nodes are
  // the only interaction on this screen, so they need a real touch target
  // (44px is out of reach without nodes overlapping their neighbors, but
  // this is a meaningful step up from the 24px desktop size).
  let isMobile = $state(false);
  $effect(() => {
    if (typeof window.matchMedia !== 'function') return; // not available in the test environment
    const mq = window.matchMedia('(max-width: 700px)');
    isMobile = mq.matches;
    const onChange = (e) => (isMobile = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  const CELL_SIZE = $derived(isMobile ? 40 : 32);
  const NODE_SIZE = $derived(isMobile ? 32 : 24);
  const MIN_ZOOM = $derived(compact ? 0.1 : 0.25);
  const MAX_ZOOM = 2.5;

  const allocatedSet = $derived(new Set(allocatedIds));
  // Board space shifts by +13 cols / +25 rows into canvas cells (node CSS does the same).
  const cx = (col) => (col + 13) * CELL_SIZE;
  const cy = (row) => (row + 25) * CELL_SIZE;
  // Links drawn between adjacent allocated nodes, the core counting as owned (Game/transcendence.md §2).
  const edges = $derived.by(() => {
    const g = boardGraph(boardKey);
    if (!g) return [];
    const owned = (id) => id === g.coreId || allocatedSet.has(id);
    const out = [];
    for (const [id, near] of g.neighbors) {
      if (!owned(id)) continue;
      for (const other of near) if (id < other && owned(other)) out.push([g.byId.get(id), g.byId.get(other)]);
    }
    return out;
  });
  // Tier row bands as the game draws them: a tinted band per tier, labelled at its top edge.
  const bands = $derived(TRANSCENDENCE_TIERS.map((t) => ({ ...t, top: cy(t.rowTo) - CELL_SIZE * 0.6, bottom: cy(t.rowFrom) + CELL_SIZE * 0.5 })));
  const costOf = (node, unlockable) => (unlockable ? allocCost(boardKey, allocatedIds, node.id) : null);
  // Board space is col -13..13, row -25..0; node CSS shifts it to 0..26 / 0..25 (core at the bottom).
  const GRID_COLS = 27;
  const GRID_ROWS = 26;

  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);

  let viewportEl;
  let dragging = false;
  let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let moved = false;

  // Active pointers by id, for pinch detection - a plain Map (not $state),
  // it only drives imperative pan/zoom math, never read in the template.
  const activePointers = new Map();
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  // Fit the whole board, centred, below the floating controls (boardView.js).
  function centerOnStart() {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (rect.width === 0) return;
    ({ zoom, panX, panY } = fitView(rect.width, rect.height, CELL_SIZE, NODE_SIZE, MIN_ZOOM));
  }

  function pointerDistance() {
    const [a, b] = [...activePointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerMidpoint(rect) {
    const [a, b] = [...activePointers.values()];
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  }

  function zoomTo(nextZoom, cx, cy) {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    panX = cx - ((cx - panX) / zoom) * clamped;
    panY = cy - ((cy - panY) / zoom) * clamped;
    zoom = clamped;
  }

  function onViewportPointerDown(e) {
    touched = true;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      dragging = false; // a second finger joining ends single-finger pan
      pinchStartDistance = pointerDistance();
      pinchStartZoom = zoom;
      // A 2-finger gesture is unambiguous - capture both immediately so a
      // fast pinch that leaves the viewport bounds keeps tracking.
      for (const id of activePointers.keys()) viewportEl.setPointerCapture(id);
    } else if (activePointers.size === 1) {
      dragging = true;
      moved = false;
      dragStart = { x: e.clientX, y: e.clientY, panX, panY };
      // Deliberately NOT capturing the pointer here yet (see pointermove) -
      // capturing on pointerdown redirects the native "click" event
      // (fired on release with no movement) away from the actual node
      // button and onto the viewport, silently breaking click-to-unlock
      // for a plain tap/click.
    }
  }

  function onViewportPointerMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const rect = viewportEl.getBoundingClientRect();
      const distance = pointerDistance();
      const { x: cx, y: cy } = pointerMidpoint(rect);
      zoomTo(pinchStartZoom * (distance / pinchStartDistance), cx, cy);
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      moved = true;
      // Now it's a confirmed drag, not a click - capture so it keeps
      // tracking even if the pointer leaves the viewport bounds.
      viewportEl.setPointerCapture(e.pointerId);
    }
    panX = dragStart.panX + dx;
    panY = dragStart.panY + dy;
  }

  function onViewportPointerUp(e) {
    activePointers.delete(e.pointerId);
    if (viewportEl.hasPointerCapture?.(e.pointerId)) {
      viewportEl.releasePointerCapture(e.pointerId);
    }
    dragging = false; // lifting either finger ends the current gesture; a remaining single finger starts a fresh pan on its next move
  }

  function onWheel(e) {
    e.preventDefault();
    touched = true;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = viewportEl.getBoundingClientRect();
    // Zoom toward the cursor: keep the point under the cursor fixed in screen space.
    zoomTo(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  function zoomBy(factor) {
    touched = true;
    const rect = viewportEl.getBoundingClientRect();
    zoomTo(zoom * factor, rect.width / 2, rect.height / 2);
  }
  function resetView() {
    touched = false;
    centerOnStart();
  }

  // Node clicks/pans both fire on pointerup; suppress the click that follows
  // a drag so dragging past a node doesn't also toggle it.
  function handleSelect(node) {
    if (moved) return;
    onSelect?.(node);
  }

  // Fit on mount and again whenever the viewport is resized or first laid out, until the user
  // pans or zooms; after that the view is theirs (Reset view returns to the fit).
  let touched = false;
  $effect(() => {
    if (!viewportEl) return;
    centerOnStart();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => !touched && centerOnStart());
    ro.observe(viewportEl);
    return () => ro.disconnect();
  });
</script>

<div class="board-wrap">
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (pointer pan/zoom; a compact preview's keyboard path is its caller's own button) -->
<div
  class="viewport"
  class:compact
  role="application"
  aria-label={readOnly ? 'Recommended Transcendence tree - read only' : 'Transcendence board - draggable and zoomable'}
  bind:this={viewportEl}
  onpointerdown={onViewportPointerDown}
  onpointermove={onViewportPointerMove}
  onpointerup={onViewportPointerUp}
  onpointercancel={onViewportPointerUp}
  onwheel={onWheel}
  onclick={() => { if (!moved) onActivate?.(); }}
>
  <div
    class="canvas"
    style="--cell-size: {CELL_SIZE}px; --node-size: {NODE_SIZE}px; transform: translate({panX}px, {panY}px) scale({zoom}); width: {(GRID_COLS + 1) * CELL_SIZE}px; height: {(GRID_ROWS + 1) * CELL_SIZE}px;"
  >
    {#each bands as b (b.tier)}
      <div class="band" style="--tier: {b.color}; top: {b.top}px; height: {b.bottom - b.top}px;" aria-hidden="true"></div>
    {/each}
    <svg class="edges" width={(GRID_COLS + 1) * CELL_SIZE} height={(GRID_ROWS + 1) * CELL_SIZE} aria-hidden="true">
      {#each edges as [a, z] (a.id + z.id)}
        <line x1={cx(a.col)} y1={cy(a.row)} x2={cx(z.col)} y2={cy(z.row)} />
      {/each}
    </svg>
    {#each nodes as node (node.id)}
      {@const unlockable = !readOnly && canAllocateNode(boardKey, allocatedIds, node.id)}
      <BoardNode
        {node}
        unlocked={allocatedSet.has(node.id)}
        {unlockable}
        cost={costOf(node, unlockable)}
        {readOnly}
        highlighted={!!highlightIds?.has(node.id) || (!!highlightStats?.size && node.stats.some((s) => highlightStats.has(s.stat)))}
        onSelect={handleSelect}
        {onHover}
      />
    {/each}
  </div>
  {#if !compact}
    <!-- Labels stay at the viewport's left edge at any pan or zoom, as in the game; only their height follows the board. -->
    {#each bands as b (b.tier)}
      <span class="band-label" style="--tier: {b.color}; top: {panY + b.top * zoom}px;" aria-hidden="true">Tier {b.tier} <small>{b.name}</small></span>
    {/each}
  {/if}
</div>
{#if !compact}<div class="tools" role="group" aria-label="Board view">
  <Button variant="ghost" size="small" aria-label="Zoom in" onclick={() => zoomBy(1.25)}>+</Button>
  <Button variant="ghost" size="small" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.25)}>−</Button>
  <Button variant="ghost" size="small" aria-label="Reset view" onclick={resetView}>⟲</Button>
</div>
{/if}
</div>

<style>
  .board-wrap { position: relative; min-width: 0; }
  .tools { position: absolute; top: var(--sp-2); right: var(--sp-2); display: flex; gap: var(--sp-1); background: var(--surface-1); border-radius: var(--r-1); }
  .viewport {
    position: relative;
    width: 100%;
    height: 65vh;
    min-height: 20rem;
    overflow: hidden;
    background: var(--tc-board);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    touch-action: none;
    cursor: grab;
  }
  .viewport:active {
    cursor: grabbing;
  }
  .viewport.compact { height: 18rem; min-height: 0; cursor: zoom-in; }
  .canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }
  /* Bands run far past the board's sides so they fill the viewport at any pan, like the game's. */
  .band {
    position: absolute;
    left: -200vw;
    right: -200vw;
    border-top: 1px solid color-mix(in srgb, var(--tier) 45%, transparent);
    background: linear-gradient(to bottom, color-mix(in srgb, var(--tier) 22%, transparent), transparent 75%);
    pointer-events: none;
  }
  .band-label {
    position: absolute;
    left: var(--sp-2);
    padding-top: var(--sp-1);
    color: var(--tier);
    font-size: var(--fs-11);
    font-weight: var(--fw-medium);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    white-space: nowrap;
    pointer-events: none;
  }
  .band-label small {
    font-size: 0.7em;
    opacity: 0.6;
  }
  .edges {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
  }
  .edges line {
    stroke: var(--tc-allocated);
    stroke-width: calc(var(--cell-size) * 0.1);
    stroke-linecap: round;
    filter: drop-shadow(0 0 3px var(--tc-allocated));
  }
</style>
