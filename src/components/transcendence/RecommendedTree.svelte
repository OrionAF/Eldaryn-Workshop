<script>
  /**
   * RecommendedTree.svelte - a result row's Transcendence tree, read only: a small preview that opens a wide
   * dialog with the full board. `board` is the row's captured {boardKey, name, allocatedNodeIds}
   * (build/describe.js describeBoard), never the character's current tree, so a saved run still shows what
   * it evaluated. Nodes the row adds to `baseline`'s tree (same board only) carry the highlight ring.
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
  const removed = $derived(base ? [...base].filter((id) => !ids.includes(id)).length : 0);
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
      <BoardGrid boardKey={board.boardKey} nodes={def.nodes} allocatedIds={ids} highlightIds={addedSet} readOnly compact onActivate={show} {onHover} />
    {/if}
    <Button variant="ghost" size="small" onclick={show}>Open full tree</Button>
  </section>

  <Modal bind:open wide title="Transcendence: {board.name}" onclose={() => (hovered = null)}>
    {#snippet children()}
      {#if diffText}<p class="meta num">{ids.length} nodes · {diffText}{added.length ? '. Added nodes are ringed.' : ''}</p>{/if}
      {#if open}
        <BoardGrid boardKey={board.boardKey} nodes={def.nodes} allocatedIds={ids} highlightIds={addedSet} readOnly {onHover} />
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
    <div class="tooltip-cost">{ids.includes(hovered.node.id) ? (addedSet.has(hovered.node.id) ? 'Added by this build' : 'Allocated') : 'Not allocated'}</div>
  </div>
{/snippet}

<style>
  .tree { display: grid; gap: var(--sp-2); margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line-rule); }
  .tree :global(.btn) { justify-self: start; }
  .head { display: grid; gap: calc(var(--sp-1) * 0.5); }
  .title { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .meta { margin: 0 0 var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); }
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
