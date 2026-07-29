<script>
  /**
   * TranscendenceScreen.svelte - character-scoped, shared across every
   * preset (like Awakening) - one unlocked-node set per character. Ichor
   * cost is shown as info (running total + the hovered/selected node's own
   * cost), never gated against an owned balance - unlocking is gated purely
   * on adjacency. Grid/Node/Drawer logic is unchanged from the pre-redesign
   * TranscendenceTab.svelte - only this wrapper's styling/copy changed.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { formatPct } from '../lib/format.js';
  import { TRANSCENDENCE_TREES } from '../lib/transcendenceData.js';
  import { effectiveUnlockedSet, totalIchorSpent, costForCount, costForSigil, slotsForNode, canUnlock } from '../lib/transcendence.js';
  import TranscendenceGrid from './TranscendenceGrid.svelte';
  import TranscendenceDrawer from './TranscendenceDrawer.svelte';

  const character = $derived(rosterStore.current);
  const tree = $derived(TRANSCENDENCE_TREES[character.class]);
  const unlockedPositions = $derived(character.transcendence?.unlockedPositions ?? []);
  const unlockedSet = $derived(effectiveUnlockedSet(unlockedPositions));
  const ichorSpent = $derived(tree ? totalIchorSpent(unlockedPositions, tree) : 0);

  // Node Filter - stat keys the user wants highlighted on the grid. Session-
  // only UI state (not persisted). A node matches when ANY of its stats is
  // selected, so uncommon (2-stat) nodes light up if either stat matches.
  let filterStats = $state([]);
  const filterSet = $derived(new Set(filterStats));
  // Stat options offered = stats that actually appear in this class's tree,
  // in STAT_FIELDS order so the chip row matches stat ordering elsewhere.
  const filterOptions = $derived.by(() => {
    if (!tree) return [];
    const present = new Set(tree.nodes.flatMap((n) => n.stats.map((s) => s.statKey)));
    return STAT_FIELDS.filter((f) => present.has(f.key));
  });

  function toggleFilterStat(key) {
    filterStats = filterStats.includes(key) ? filterStats.filter((k) => k !== key) : [...filterStats, key];
  }

  let hovered = $state(null); // { node, x, y } - desktop hover tooltip
  let drawerNode = $state(null); // mobile tap target - the drawer's own button does the actual toggle

  let isMobile = $state(false);
  $effect(() => {
    if (typeof window.matchMedia !== 'function') return; // not available in the test environment
    // Same 700px breakpoint as Sidebar.svelte/App.svelte's mobile nav
    // contract - this decides drawer-vs-hover, so it must agree with the
    // rest of the app on what "mobile" means.
    const mq = window.matchMedia('(max-width: 700px)');
    isMobile = mq.matches;
    const onChange = (e) => (isMobile = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }

  function rarityLabel(type) {
    return { common: 'Common', uncommon: 'Uncommon', glyph: 'Glyph Socket', sigil: 'Ancient Sigil' }[type] ?? type;
  }

  /** The tiered/flat Ichor cost this specific node would cost if unlocked next, for display only. */
  function nodeCost(node) {
    if (node.type === 'sigil') return costForSigil();
    if (node.type === 'glyph') return null;
    const slotsFilled = unlockedPositions.reduce((sum, p) => {
      const n = tree.nodes.find((tn) => tn.position === p);
      if (!n || (n.type !== 'common' && n.type !== 'uncommon')) return sum;
      return sum + slotsForNode(n.type === 'uncommon');
    }, 0);
    return costForCount(slotsFilled + 1, node.type === 'uncommon');
  }

  function toggleNode(node) {
    if (node.type === 'glyph') return;
    const isUnlocked = unlockedSet.has(node.position);
    rosterStore.setTranscendenceNode(node.position, !isUnlocked);
  }

  function onHover(node, x, y) {
    if (isMobile) return; // no real hover on touch - the drawer covers this instead
    hovered = node ? { node, x, y } : null;
  }

  function onSelect(node) {
    if (node.type === 'glyph') return;
    if (isMobile) {
      drawerNode = node; // open the drawer - the drawer's own button does the actual toggle
    } else {
      toggleNode(node);
    }
  }

  function onDrawerAllocate() {
    if (drawerNode) toggleNode(drawerNode);
  }

  function closeDrawer() {
    drawerNode = null;
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character (⇄ Change character) before opening Transcendence.</p>
{:else if !tree}
  <p class="empty-hint">The Transcendence tree for {character.class} has not been added yet.</p>
{:else}
  <div class="header-row">
    <h2>Transcendence</h2>
    <p class="hint">character-wide — one build, shared by all presets</p>
  </div>
  <div class="header-bar">
    <span class="readout">Nodes placed: <strong>{unlockedSet.size}</strong></span>
    <span class="readout">Ichor spent: <strong>{ichorSpent}</strong></span>
  </div>

  <div class="node-filter">
    <span class="micro-label">Node Filter</span>
    <div class="filter-chips">
      {#each filterOptions as opt (opt.key)}
        <button
          type="button"
          class="filter-chip"
          class:active={filterSet.has(opt.key)}
          aria-pressed={filterSet.has(opt.key)}
          onclick={() => toggleFilterStat(opt.key)}
        >
          {opt.label}
        </button>
      {/each}
      {#if filterStats.length > 0}
        <button type="button" class="filter-clear" onclick={() => (filterStats = [])}>Clear</button>
      {/if}
    </div>
  </div>

  <TranscendenceGrid {tree} {unlockedPositions} highlightStats={filterSet} {onSelect} {onHover} />

  {#if hovered && !isMobile}
    <div class="tooltip" style="left: {hovered.x + 14}px; top: {hovered.y + 14}px;">
      <div class="tooltip-title">{rarityLabel(hovered.node.type)}</div>
      {#if hovered.node.stats.length > 0}
        {#each hovered.node.stats as s (s.statKey)}
          <div class="tooltip-stat">{statLabel(s.statKey)}: +{formatPct(s.value)}%</div>
        {/each}
      {:else if hovered.node.type === 'sigil'}
        <div class="tooltip-stat">Special effect (not yet implemented)</div>
      {:else}
        <div class="tooltip-stat">Coming soon</div>
      {/if}
      {#if nodeCost(hovered.node) != null && !unlockedSet.has(hovered.node.position)}
        <div class="tooltip-cost">Cost: {nodeCost(hovered.node)} Ichor</div>
      {/if}
    </div>
  {/if}

  {#if isMobile && drawerNode}
    <TranscendenceDrawer
      node={drawerNode}
      unlocked={unlockedSet.has(drawerNode.position)}
      disabled={!unlockedSet.has(drawerNode.position) && !canUnlock(drawerNode.position, unlockedPositions, tree)}
      cost={nodeCost(drawerNode)}
      onAllocate={onDrawerAllocate}
      onClose={closeDrawer}
    />
  {/if}
{/if}

<style>
  .empty-hint {
    color: var(--color-muted);
    padding-top: var(--space-6);
  }
  .header-row {
    margin-bottom: var(--space-2);
  }
  .hint {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0;
  }
  .header-bar {
    display: flex;
    gap: var(--space-6);
    margin-bottom: var(--space-3);
  }
  .readout {
    color: var(--color-muted);
  }
  .readout strong {
    color: var(--color-ink);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .node-filter {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filter-chip {
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: var(--color-field);
    border: 1px solid var(--color-border-strong);
    color: var(--color-muted);
    cursor: pointer;
  }
  .filter-chip:hover {
    border-color: var(--nav-transcendence);
    color: var(--color-ink);
  }
  .filter-chip.active {
    background: var(--nav-transcendence-tint);
    border-color: var(--nav-transcendence);
    color: var(--nav-transcendence-light);
  }
  .filter-clear {
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: none;
    border: 1px dashed var(--color-border-strong);
    color: var(--color-muted);
    cursor: pointer;
  }
  .filter-clear:hover {
    color: var(--color-ink);
    border-color: var(--color-ink);
  }

  .tooltip {
    position: fixed;
    z-index: 20;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 0.5rem 0.65rem;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    max-width: 15rem;
  }
  .tooltip-title {
    font-family: var(--font-heading);
    font-weight: 700;
    color: var(--color-gold-light);
    margin-bottom: 0.2rem;
  }
  .tooltip-stat {
    font-size: 0.85rem;
    color: var(--color-ink);
  }
  .tooltip-cost {
    font-size: 0.8rem;
    color: var(--color-muted);
    margin-top: 0.2rem;
  }
</style>
