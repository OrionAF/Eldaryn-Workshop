<script>
  /**
   * CharacterTranscendencePage.svelte (C10) - character-wide boards (up to 4 transcendence presets, 'default' always
   * present). Which board a build preset uses is chosen in the Loadout page (transcendencePresetId); a preset
   * with no link follows the active board here (legality.resolveTranscendencePreset), and "Used by" says so.
   * Ichor is information only, never a gate (docs/Reference/Game/transcendence.md §1, §6, §9).
   * Graph rules live in lib/transcendence.js; the stat sums here are display of the same bonuses.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel } from '../../lib/game/classes.js';
  import { transcendenceBoard, TRANSCENDENCE_CONSTANTS } from '../../lib/game/transcendence.js';
  import {
    boardKeyFor, allocCost, removeRefund, setTotalCost, canAllocateNode, sideProgress, transcendenceBonuses,
  } from '../../lib/transcendence.js';
  import { MAX_TRANSCENDENCE_PRESETS, DEFAULT_TRANSCENDENCE_ID } from '../../lib/model/transcendence.js';
  import BoardGrid from '../transcendence/BoardGrid.svelte';
  import NodeDrawer from '../transcendence/NodeDrawer.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Panel from '../ui/Panel.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Button from '../ui/Button.svelte';
  import { boardUsers } from '../../lib/build/usage.js';
  import { statLabel, formatNodeStat, KIND_LABEL } from '../transcendence/statLabels.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const t = $derived(character.transcendence);
  const active = $derived(t.presets.find((p) => p.id === t.activePresetId) ?? t.presets[0]);
  const ids = $derived(active.allocatedNodeIds);

  // Spec of the active build preset's talent set picks the flavour (Mage/Druid, Doomweaver/Deathlord).
  const spec = $derived.by(() => {
    const bp = character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0];
    return character.talentSets?.[bp?.talentSet ?? 0]?.spec ?? null;
  });
  const boardKey = $derived(boardKeyFor(character.class, spec));
  const board = $derived(boardKey ? transcendenceBoard(boardKey) : null);
  const spent = $derived(boardKey ? setTotalCost(boardKey, ids) : 0);
  const bonuses = $derived(boardKey ? Object.entries(transcendenceBonuses(boardKey, ids)) : []);
  const attack = $derived(boardKey ? sideProgress(boardKey, 'attack', ids) : { got: 0, total: 0 });
  const defense = $derived(boardKey ? sideProgress(boardKey, 'defense', ids) : { got: 0, total: 0 });
  const users = $derived(boardUsers(character, active.id));

  // Node Filter: highlight nodes with any selected stat. Session-only UI state.
  let filterStats = $state([]);
  const filterSet = $derived(new Set(filterStats));
  const filterOptions = $derived(board ? [...new Set(board.nodes.flatMap((n) => n.stats.map((s) => s.stat)))] : []);
  const toggleFilter = (key) => (filterStats = filterStats.includes(key) ? filterStats.filter((k) => k !== key) : [...filterStats, key]);

  let renaming = $state(false);
  let renameDraft = $state('');

  let hovered = $state(null);
  let drawerNode = $state(null);
  let isMobile = $state(false);
  $effect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 700px)');
    isMobile = mq.matches;
    const onChange = (e) => (isMobile = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  const isOwned = (node) => ids.includes(node.id);
  const selectable = (node) => node.kind !== 'socket' && node.kind !== 'start';

  function nodeCost(node) {
    if (!selectable(node) || isOwned(node)) return null;
    return allocCost(boardKey, ids, node.id);
  }

  const REASONS = {
    unreachable: 'Allocate an adjacent node first',
    strands: "Can't remove: it would strand connected nodes",
    'no-class': 'Choose a class for this character first',
  };

  function toggleNode(node) {
    if (!selectable(node)) return;
    const result = isOwned(node)
      ? rosterStore.removeTranscendenceNode(node.id)
      : rosterStore.allocateTranscendenceNode(node.id);
    if (result !== 'ok' && REASONS[result]) setStatus(REASONS[result]);
  }

  function onHover(node, x, y) {
    if (isMobile) return;
    hovered = node ? { node, x, y } : null;
  }

  function onSelect(node) {
    if (!selectable(node)) return;
    if (isMobile) drawerNode = node;
    else toggleNode(node);
  }

  function addPreset() {
    if (rosterStore.addTranscendencePreset() == null) setStatus(`At most ${MAX_TRANSCENDENCE_PRESETS} transcendence presets`);
  }

  function commitRename() {
    rosterStore.renameTranscendencePreset(active.id, renameDraft);
    renaming = false;
  }
</script>

{#if !character.class}
  <EmptyState title="Choose a class first" text="Transcendence boards depend on the character's class.">
    {#snippet action()}<Button onclick={() => onNavigate('character/overview')}>Go to Overview</Button>{/snippet}
  </EmptyState>
{:else if !board}
  <EmptyState title="No board" text="There is no Transcendence board for {classLabel(character.class)}." />
{:else}
  <Panel title="Transcendence" scope="character">
  {#snippet meta()}
    <span class="hint">
      unlocks at level {TRANSCENDENCE_CONSTANTS.unlockLevel} - {classLabel(character.class)}
      {board.flavor && board.flavor !== 'MAGE' ? board.flavor.toLowerCase() : ''} board · flavour follows the spec of the active preset
    </span>
  {/snippet}

  <div class="preset-bar" role="tablist" aria-label="Transcendence presets">
    {#each t.presets as p (p.id)}
      <button
        type="button"
        role="tab"
        class="preset-tab"
        class:active={p.id === active.id}
        aria-selected={p.id === active.id}
        onclick={() => rosterStore.setActiveTranscendencePreset(p.id)}
      >
        {p.name}
      </button>
    {/each}
    <button type="button" class="btn-ghost" disabled={t.presets.length >= MAX_TRANSCENDENCE_PRESETS} onclick={addPreset}>
      + Board
    </button>
  </div>

  <div class="preset-actions">
    {#if renaming}
      <input
        type="text"
        aria-label="Preset name"
        maxlength={18}
        bind:value={renameDraft}
        onkeydown={(e) => e.key === 'Enter' && commitRename()}
      />
      <button type="button" class="btn-gold" onclick={commitRename}>Save</button>
      <button type="button" class="btn-ghost" onclick={() => (renaming = false)}>Cancel</button>
    {:else}
      <button type="button" class="btn-ghost" onclick={() => { renameDraft = active.name; renaming = true; }}>Rename</button>
      <ConfirmButton class="btn-ghost" label="Reset board" confirmLabel="Reset" onConfirm={() => rosterStore.resetTranscendencePreset(active.id)} disabled={ids.length === 0} />
      {#if active.id !== DEFAULT_TRANSCENDENCE_ID}
        <ConfirmButton class="btn-danger" label="Delete preset" confirmLabel="Delete" onConfirm={() => rosterStore.deleteTranscendencePreset(active.id)} />
      {/if}
    {/if}
    <span class="hint" data-testid="board-used-by">
      Used by: {users.linked.length ? users.linked.join(', ') : 'no preset links it'}{#if users.following.length}; follows the active board: {users.following.join(', ')}{/if}
    </span>
  </div>

  <div class="header-bar">
    <span class="readout">Nodes: <strong>{ids.length}</strong></span>
    <span class="readout">Ichor in use: <strong>{spent}</strong> <span class="hint">(information, not a budget)</span></span>
    <span class="readout">Offense: <strong>{attack.got}/{attack.total}</strong></span>
    <span class="readout">Defense: <strong>{defense.got}/{defense.total}</strong></span>
  </div>

  <div class="node-filter">
    <span class="micro-label">Node Filter</span>
    <div class="filter-chips">
      {#each filterOptions as key (key)}
        <button type="button" class="filter-chip" class:active={filterSet.has(key)} aria-pressed={filterSet.has(key)} onclick={() => toggleFilter(key)}>
          {statLabel(key)}
        </button>
      {/each}
      {#if filterStats.length > 0}
        <button type="button" class="filter-clear" onclick={() => (filterStats = [])}>Clear</button>
      {/if}
    </div>
  </div>

  {#key boardKey}
    <BoardGrid {boardKey} nodes={board.nodes} allocatedIds={ids} highlightStats={filterSet} {onSelect} {onHover} />
  {/key}

  {#if bonuses.length}
    <ul class="bonus-list" aria-label="Allocated bonuses">
      {#each bonuses as [stat, value] (stat)}
        <li><span>{statLabel(stat)}</span> <strong>{formatNodeStat(stat, value)}</strong></li>
      {/each}
    </ul>
  {/if}

  {#if hovered && !isMobile}
    <div class="tooltip" style="left: {hovered.x + 14}px; top: {hovered.y + 14}px;">
      <div class="tooltip-title">{KIND_LABEL[hovered.node.kind]}{hovered.node.kind === 'minor' ? '' : `: ${hovered.node.name}`}</div>
      {#each hovered.node.stats as s (s.stat)}
        <div class="tooltip-stat">{statLabel(s.stat)}: {formatNodeStat(s.stat, s.value)}</div>
      {/each}
      {#if hovered.node.kind === 'socket'}<div class="tooltip-stat">Coming soon</div>{/if}
      {#if nodeCost(hovered.node) != null}
        <div class="tooltip-cost">Cost: {nodeCost(hovered.node)} Ichor</div>
      {:else if isOwned(hovered.node)}
        <div class="tooltip-cost">Refund: {removeRefund(boardKey, ids, hovered.node.id)} Ichor</div>
      {/if}
    </div>
  {/if}

  </Panel>

  {#if isMobile && drawerNode}
    <NodeDrawer
      node={drawerNode}
      unlocked={isOwned(drawerNode)}
      disabled={!isOwned(drawerNode) && !canAllocateNode(boardKey, ids, drawerNode.id)}
      cost={nodeCost(drawerNode)}
      onAllocate={() => toggleNode(drawerNode)}
      onClose={() => (drawerNode = null)}
    />
  {/if}
{/if}

<style>
  /* Body text matches the other screens (12-12.5px); the browser default is 16px. */
  .empty-hint {
    color: var(--color-muted);
    font-size: 12px;
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
  .preset-bar,
  .preset-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .preset-tab {
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    background: var(--color-field);
    border: 1px solid var(--color-border-strong);
    color: var(--color-muted);
    cursor: pointer;
  }
  .preset-tab.active {
    background: var(--nav-transcendence-tint);
    border-color: var(--nav-transcendence);
    color: var(--nav-transcendence-light);
  }
  .header-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    margin-bottom: var(--space-3);
  }
  .readout {
    color: var(--color-muted);
    font-size: 12.5px;
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
  .filter-chip,
  .filter-clear {
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
    background: none;
    border-style: dashed;
  }
  .bonus-list {
    list-style: none;
    padding: 0;
    margin: var(--space-4) 0 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-1) var(--space-4);
  }
  .bonus-list li {
    display: flex;
    justify-content: space-between;
    color: var(--color-muted);
    font-size: 12.5px;
  }
  .bonus-list strong {
    color: var(--color-ink);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
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
    font-size: 12px;
  }
  .tooltip-title {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 13px;
    color: var(--color-gold-light);
    margin-bottom: 0.2rem;
  }
  .tooltip-stat {
    font-size: 12px;
    color: var(--color-ink);
  }
  .tooltip-cost {
    font-size: 11.5px;
    color: var(--color-muted);
    margin-top: 0.2rem;
  }
</style>
