<script>
  /**
   * CharacterTranscendencePage.svelte (C10) - character-wide boards (up to 4 transcendence presets, 'default' always
   * present). Which board a build preset uses is chosen in the Loadout page (transcendencePresetId); a preset
   * with no link follows the active board here (legality.resolveTranscendencePreset), and "Used by" says so.
   * Ichor is information only, never a gate (docs/Reference/Game/transcendence.md §1, §6, §9).
   * Graph rules live in lib/transcendence.js; the stat sums here are display of the same bonuses.
   * The totals (nodes, Ichor, per-side progress, allocated bonuses) are the page's inspector content.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel } from '../../lib/game/classes.js';
  import { orderStats } from '../../lib/ui/statOrder.js';
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
  import Tabs from '../ui/Tabs.svelte';
  import { inspector } from '../../lib/inspector.svelte.js';
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
  const bonuses = $derived(boardKey ? orderStats(Object.entries(transcendenceBonuses(boardKey, ids)), character.class, ([key]) => key) : []);
  const attack = $derived(boardKey ? sideProgress(boardKey, 'attack', ids) : { got: 0, total: 0 });
  const defense = $derived(boardKey ? sideProgress(boardKey, 'defense', ids) : { got: 0, total: 0 });
  const users = $derived(boardUsers(character, active.id));

  // Node Filter: highlight nodes with any selected stat. Session-only UI state.
  let filterStats = $state([]);
  const filterSet = $derived(new Set(filterStats));
  const filterOptions = $derived(board ? orderStats([...new Set(board.nodes.flatMap((n) => n.stats.map((s) => s.stat)))], character.class) : []);
  const toggleFilter = (key) => (filterStats = filterStats.includes(key) ? filterStats.filter((k) => k !== key) : [...filterStats, key]);

  // Registered while the page shows a board; the release clears the slot when the page goes away.
  $effect(() => (character.class && board ? inspector.set(totals) : undefined));

  const presetTabs = $derived(t.presets.map((p) => ({ id: p.id, label: p.name })));

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
    strands: "Can't remove: it would cut off other nodes",
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

{#snippet totals()}
  <Panel title="Board totals">
    <dl class="totals">
      <div><dt>Nodes</dt><dd class="num">{ids.length}</dd></div>
      <div><dt>Ichor in use</dt><dd class="num">{spent}</dd></div>
      <div><dt>Offense</dt><dd class="num">{attack.got}/{attack.total}</dd></div>
      <div><dt>Defense</dt><dd class="num">{defense.got}/{defense.total}</dd></div>
    </dl>
    <p class="hint">Ichor is only shown for information. The app does not limit how much you use.</p>
    {#if bonuses.length}
      <ul class="bonus-list" aria-label="Allocated bonuses">
        {#each bonuses as [stat, value] (stat)}
          <li><span>{statLabel(stat)}</span> <strong class="num">{formatNodeStat(stat, value)}</strong></li>
        {/each}
      </ul>
    {:else}
      <p class="hint">No nodes allocated yet.</p>
    {/if}
  </Panel>
{/snippet}

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
      {board.flavor && board.flavor !== 'MAGE' ? board.flavor.toLowerCase() : ''} board · style follows the specialization of the active preset
    </span>
  {/snippet}

  <Tabs items={presetTabs} value={active.id} label="Transcendence presets" idPrefix="tr" onchange={(id) => rosterStore.setActiveTranscendencePreset(id)} />

  <div class="preset-actions">
    <Button variant="ghost" size="small" disabled={t.presets.length >= MAX_TRANSCENDENCE_PRESETS} onclick={addPreset}>+ Board</Button>
    {#if renaming}
      <input
        type="text"
        class="name-input"
        aria-label="Preset name"
        maxlength={18}
        bind:value={renameDraft}
        onkeydown={(e) => e.key === 'Enter' && commitRename()}
      />
      <Button variant="primary" size="small" onclick={commitRename}>Save</Button>
      <Button variant="ghost" size="small" onclick={() => (renaming = false)}>Cancel</Button>
    {:else}
      <Button variant="ghost" size="small" onclick={() => { renameDraft = active.name; renaming = true; }}>Rename</Button>
      <ConfirmButton variant="ghost" size="small" label="Reset board" confirmLabel="Reset" onConfirm={() => rosterStore.resetTranscendencePreset(active.id)} disabled={ids.length === 0} />
      {#if active.id !== DEFAULT_TRANSCENDENCE_ID}
        <ConfirmButton variant="danger" size="small" label="Delete preset" confirmLabel="Delete" onConfirm={() => rosterStore.deleteTranscendencePreset(active.id)} />
      {/if}
    {/if}
    <span class="hint" data-testid="board-used-by">
      Used by: {users.linked.length ? users.linked.join(', ') : 'no preset links it'}{#if users.following.length}; follows the active board: {users.following.join(', ')}{/if}
    </span>
  </div>

  <div class="node-filter">
    <span class="filter-label">Node Filter</span>
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
  .hint { font-size: var(--fs-12); color: var(--text-muted); margin: 0; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .preset-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin: var(--sp-3) 0; }
  .name-input {
    height: 28px;
    padding: 0 var(--sp-2);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-ink);
    font: inherit;
    font-size: var(--fs-13);
  }
  .node-filter { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  .filter-label {
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .filter-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .filter-chip,
  .filter-clear {
    font-size: var(--fs-12);
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    color: var(--text-soft);
    cursor: pointer;
  }
  .filter-chip:hover { border-color: var(--brass-400); color: var(--text-ink); }
  .filter-chip.active { background: var(--brass-tint); border-color: var(--brass-400); color: var(--brass-200); }
  .filter-clear { background: none; border-style: dashed; }
  .totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2) var(--sp-4); margin: 0; }
  .totals div { display: grid; gap: 2px; }
  .totals dt { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .totals dd { margin: 0; font-size: var(--fs-16); color: var(--text-ink); }
  .bonus-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--sp-1); }
  .bonus-list li { display: flex; justify-content: space-between; gap: var(--sp-3); color: var(--text-soft); font-size: var(--fs-13); }
  .bonus-list strong { color: var(--text-ink); }
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
