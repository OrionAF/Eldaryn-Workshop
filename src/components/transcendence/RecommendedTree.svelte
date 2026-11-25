<script>
  /**
   * RecommendedTree.svelte - a result row's Transcendence tree, read only: a small preview that opens a wide
   * dialog with the full board. `board` is the row's captured {boardKey, name, allocatedNodeIds}
   * (build/describe.js describeBoard), never the character's current tree, so a saved run still shows what
   * it evaluated. Against `baseline`'s tree (same board only), nodes the row adds carry the highlight ring
   * and nodes it drops are drawn in the removed colour (design-system §4.29).
   */
  import { transcendenceBoard } from '../../lib/game/transcendence.js';
  import BoardGrid from './BoardGrid.svelte';
  import Modal from '../Modal.svelte';
  import Button from '../ui/Button.svelte';
  import { statLabel, formatNodeStat, KIND_LABEL } from './statLabels.js';

  let { board, baseline = null } = $props();

  const def = $derived(transcendenceBoard(board.boardKey));
  const ids = $derived(board.allocatedNodeIds);
  const base = $derived(baseline?.boardKey === board.boardKey ? new Set(baseline.allocatedNodeIds) : null);
  const added = $derived(base ? ids.filter((id) => !base.has(id)) : []);
  const removedSet = $derived(new Set(base ? [...base].filter((id) => !ids.includes(id)) : []));
  const removed = $derived(removedSet.size);
  const addedSet = $derived(new Set(added));
  const diffText = $derived(!base ? '' : added.length || removed ? `${added.length} added, ${removed} removed vs current` : 'Same as current');

  let open = $state(false);
  let hovered = $state(null);
  const onHover = (node, x, y) => (hovered = node ? { node, x, y } : null);
  const show = () => {
    hovered = null;
    open = true;
  };
</script>

{#if def}
  <section class="tree" data-testid="recommended-tree">
    <div class="head">
      <span class="title">Transcendence: {board.name}</span>
      <span class="meta num">{ids.length} nodes{diffText ? ` · ${diffText}` : ''}</span>
    </div>
    {#if !open}
      <BoardGrid boardKey={board.boardKey} nodes={def.nodes} allocatedIds={ids} highlightIds={addedSet} removedIds={removedSet} readOnly compact onActivate={show} {onHover} />
    {/if}
    <Button variant="ghost" size="small" onclick={show}>Open full tree</Button>
  </section>

  <Modal bind:open wide title="Transcendence: {board.name}" onclose={() => (hovered = null)}>
    {#snippet children()}
      {#if diffText}<p class="meta num">{ids.length} nodes · {diffText}</p>{/if}
      {#if added.length || removed}
        <p class="legend" data-testid="tree-legend">
          {#if added.length}<span class="key"><span class="swatch added" aria-hidden="true"></span>Added</span>{/if}
          {#if removed}<span class="key"><span class="swatch removed" aria-hidden="true"></span>Removed</span>{/if}
        </p>
      {/if}
      {#if open}
        <BoardGrid boardKey={board.boardKey} nodes={def.nodes} allocatedIds={ids} highlightIds={addedSet} removedIds={removedSet} readOnly {onHover} />
      {/if}
      {#if hovered && open}{@render tip()}{/if}
    {/snippet}
  </Modal>
  {#if hovered && !open}{@render tip()}{/if}
{/if}

{#snippet tip()}
  <div class="tooltip" role="tooltip" style="left: {hovered.x + 14}px; top: {hovered.y + 14}px;">
    <div class="tooltip-title">{KIND_LABEL[hovered.node.kind]}{hovered.node.kind === 'minor' ? '' : `: ${hovered.node.name}`}</div>
    {#each hovered.node.stats as s (s.stat)}
      <div class="tooltip-stat">{statLabel(s.stat)}: {formatNodeStat(s.stat, s.value)}</div>
    {/each}
    <div class="tooltip-cost">{ids.includes(hovered.node.id) ? (addedSet.has(hovered.node.id) ? 'Added by this build' : 'Allocated') : removedSet.has(hovered.node.id) ? 'Removed by this build' : 'Not allocated'}</div>
  </div>
{/snippet}

<style>
  .tree { display: grid; gap: var(--sp-2); margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line-rule); }
  .tree :global(.btn) { justify-self: start; }
  .head { display: grid; gap: calc(var(--sp-1) * 0.5); }
  .title { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .meta { margin: 0 0 var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); }
  .legend { display: flex; gap: var(--sp-4); margin: 0 0 var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); }
  .key { display: inline-flex; align-items: center; gap: var(--sp-2); }
  .swatch { width: 0.75rem; height: 0.75rem; border-radius: 50%; box-sizing: border-box; }
  .swatch.added { border: 2px solid var(--tc-allocated); outline: 2px solid var(--brass-200); outline-offset: 1px; }
  .swatch.removed { border: 2px dashed var(--tc-removed); background: var(--tc-removed-tint); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .tooltip {
    position: fixed;
    z-index: var(--z-tooltip);
    background: var(--surface-4);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
    padding: var(--sp-2) var(--sp-3);
    pointer-events: none;
    box-shadow: var(--elev-2);
    max-width: 15rem;
    font-size: var(--fs-12);
  }
  .tooltip-title { font-family: var(--font-display); font-size: var(--fs-13); color: var(--brass-200); margin-bottom: var(--sp-1); }
  .tooltip-stat { color: var(--text-ink); }
  .tooltip-cost { color: var(--text-muted); margin-top: var(--sp-1); }
</style>
