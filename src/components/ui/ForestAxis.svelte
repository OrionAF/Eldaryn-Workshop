<script>
  /**
   * ForestAxis.svelte - the ONE labelled axis of a CI table (design-system §4.15). Every CIForest
   * row in the same table gets the same `domain` (from forestDomain), so marks share one scale.
   * Decorative for assistive tech: each row carries its own sentence.
   */
  import { forestPos, forestTicks } from '../../lib/ui/forestScale.js';

  let { domain, title = '', format = (x) => String(x) } = $props();
  const ticks = $derived(forestTicks(domain));
</script>

<div class="axis" aria-hidden="true">
  {#if title}<span class="cap">{title}</span>{/if}
  {#each ticks as t (t)}
    <span class="t" class:zero={t === 0} style="left: {forestPos(t, domain)}%">{format(t)}</span>
  {/each}
</div>

<style>
  .axis { position: relative; height: 36px; }
  .t {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    font-family: var(--font-data);
    font-size: var(--fs-11);
    color: var(--text-muted);
  }
  .t::before { content: ''; position: absolute; left: 50%; bottom: 15px; height: 5px; width: 1px; background: var(--line-control); }
  .zero { color: var(--text-ink); font-weight: var(--fw-bold); }
  .zero::before { height: 8px; background: var(--text-soft); }
  .cap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: 0.06em;
    color: var(--text-soft);
    white-space: nowrap;
  }
</style>
