<script>
  /**
   * TranscendenceDrawer.svelte - mobile-only bottom sheet, the tap
   * equivalent of the desktop hover tooltip + click-to-toggle. Tapping a
   * node opens this instead of toggling it directly - the actual allocate/
   * remove action lives on the button here, so a stray tap never silently
   * spends/refunds a node. Tapping the backdrop closes it without acting.
   */
  import { statLabel, formatNodeStat, KIND_LABEL } from './statLabels.js';
  import Button from '../ui/Button.svelte';

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
    <div class="allocate">
      <Button variant={unlocked ? 'ghost' : 'primary'} size="block" {disabled} onclick={onAllocate}>{unlocked ? 'Remove' : 'Allocate'}</Button>
    </div>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--surface-scrim); z-index: var(--z-modal); }
  .drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: calc(var(--z-modal) + 1);
    background: var(--surface-2);
    border-top: 1px solid var(--line-rule);
    border-radius: var(--r-3) var(--r-3) 0 0;
    box-shadow: var(--elev-3);
    padding: var(--sp-4);
    padding-bottom: calc(var(--sp-4) + env(safe-area-inset-bottom, 0px));
  }
  .drawer-title { font-family: var(--font-display); font-size: var(--fs-16); margin-bottom: var(--sp-2); color: var(--text-ink); }
  .drawer-stat { font-size: var(--fs-14); margin-bottom: var(--sp-1); color: var(--text-soft); }
  .effect { color: var(--text-muted); font-size: var(--fs-12); }
  .drawer-cost { font-size: var(--fs-13); color: var(--text-muted); margin: var(--sp-2) 0; font-family: var(--font-data); }
  .allocate { margin-top: var(--sp-3); }
</style>
