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
  import { canAllocateNode } from '../../lib/transcendence.js';
  import BoardNode from './BoardNode.svelte';
  import Button from '../ui/Button.svelte';

  let { boardKey, nodes, allocatedIds = [], highlightStats = null, onSelect = null, onHover = null } = $props();

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
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.5;

  const allocatedSet = $derived(new Set(allocatedIds));
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

  function centerOnStart() {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    // The core sits at the bottom-centre of the board; start with it near the bottom of the viewport.
    panX = rect.width / 2 - 13 * CELL_SIZE * zoom;
    panY = rect.height - 25 * CELL_SIZE * zoom - CELL_SIZE * 2;
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
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = viewportEl.getBoundingClientRect();
    // Zoom toward the cursor: keep the point under the cursor fixed in screen space.
    zoomTo(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  function zoomBy(factor) {
    const rect = viewportEl.getBoundingClientRect();
    zoomTo(zoom * factor, rect.width / 2, rect.height / 2);
  }
  function resetView() {
    zoom = 1;
    centerOnStart();
  }

  // Node clicks/pans both fire on pointerup; suppress the click that follows
  // a drag so dragging past a node doesn't also toggle it.
  function handleSelect(node) {
    if (moved) return;
    onSelect?.(node);
  }

  // Center on mount only. Without the `centered` guard, this effect would
  // re-run on every zoom change too - it reads `zoom` (via centerOnStart),
  // so Svelte tracks that as a dependency, and every wheel/pinch zoom would
  // snap the view back to the start position instead of zooming in place.
  let centered = false;
  $effect(() => {
    if (viewportEl && !centered) {
      centered = true;
      centerOnStart();
    }
  });
</script>

<div class="board-wrap">
<div
  class="viewport"
  role="application"
  aria-label="Transcendence board - draggable and zoomable"
  bind:this={viewportEl}
  onpointerdown={onViewportPointerDown}
  onpointermove={onViewportPointerMove}
  onpointerup={onViewportPointerUp}
  onpointercancel={onViewportPointerUp}
  onwheel={onWheel}
>
  <div
    class="canvas"
    style="--cell-size: {CELL_SIZE}px; --node-size: {NODE_SIZE}px; transform: translate({panX}px, {panY}px) scale({zoom}); width: {(GRID_COLS + 1) * CELL_SIZE}px; height: {(GRID_ROWS + 1) * CELL_SIZE}px;"
  >
    {#each nodes as node (node.id)}
      <BoardNode
        {node}
        unlocked={allocatedSet.has(node.id)}
        unlockable={canAllocateNode(boardKey, allocatedIds, node.id)}
        highlighted={!!highlightStats?.size && node.stats.some((s) => highlightStats.has(s.stat))}
        onSelect={handleSelect}
        {onHover}
      />
    {/each}
  </div>
</div>
<div class="tools" role="group" aria-label="Board view">
  <Button variant="ghost" size="small" aria-label="Zoom in" onclick={() => zoomBy(1.25)}>+</Button>
  <Button variant="ghost" size="small" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.25)}>−</Button>
  <Button variant="ghost" size="small" aria-label="Reset view" onclick={resetView}>⟲</Button>
</div>
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
    background: var(--surface-0);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    touch-action: none;
    cursor: grab;
  }
  .viewport:active {
    cursor: grabbing;
  }
  .canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }
</style>
