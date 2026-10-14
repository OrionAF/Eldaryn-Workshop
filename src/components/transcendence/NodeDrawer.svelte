<script>
  /**
   * TranscendenceDrawer.svelte - mobile-only bottom sheet, the tap
   * equivalent of the desktop hover tooltip + click-to-toggle. Tapping a
   * node opens this instead of toggling it directly - the actual allocate/
   * remove action lives on the button here, so a stray tap never silently
   * spends/refunds a node. Tapping the backdrop closes it without acting.
   */
  import { statLabel, formatNodeStat, KIND_LABEL } from './statLabels.js';

  let { node, unlocked = false, disabled = false, cost = null, onAllocate = null, onClose = null } = $props();
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="drawer" role="dialog" aria-label="{KIND_LABEL[node.kind]} details">
  <div class="drawer-title">{KIND_LABEL[node.kind]}{node.kind === 'minor' ? '' : `: ${node.name}`}</div>
  {#each node.stats as s (s.stat)}
    <div class="drawer-stat">{statLabel(s.stat)}: {formatNodeStat(s.stat, s.value)}</div>
  {/each}
  {#if node.effect}
    <div class="drawer-stat effect">{node.effect}</div>
  {/if}
  {#if node.kind === 'socket'}
    <div class="drawer-stat">Coming soon</div>
  {/if}
  {#if cost != null && !unlocked}
    <div class="drawer-cost">Cost: {cost} Ichor</div>
  {/if}
  {#if node.kind !== 'socket' && node.kind !== 'start'}
    <button type="button" class="allocate-button" {disabled} onclick={onAllocate}>
      {unlocked ? 'Remove' : 'Allocate'}
    </button>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 50;
  }
  .drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 51;
    background: var(--color-panel);
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius-field) var(--radius-field) 0 0;
    padding: var(--space-4);
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  }
  .drawer-title {
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .drawer-stat {
    font-size: 0.9rem;
    margin-bottom: 0.15rem;
  }
  .effect {
    color: var(--color-muted);
    font-size: 0.8rem;
  }
  .drawer-cost {
    font-size: 0.85rem;
    color: var(--color-muted);
    margin: 0.3rem 0 0.6rem;
  }
  .allocate-button {
    width: 100%;
    margin-top: var(--space-3);
    background: var(--color-gold);
    border-color: var(--color-gold);
    color: var(--color-bg);
    font-weight: 600;
  }
</style>
