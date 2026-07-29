<script>
  /**
   * SimulationsScreen.svelte - the one home for everything simulation:
   * a Dashboard tab (setup + auto-saved run statistics) plus one tab per
   * assigned preset goal (goals/linking redesign,
   * docs/Reference/Notes/goals-linking-redesign-notes.md).
   *
   * Tab semantics: built-in goal kinds are DEDUPED (one DPS / Tank / PVP
   * tab exists if ANY preset carries that goal - inside, the embedded
   * screen's preset picker is filtered to matching presets), while each
   * Custom-goal preset gets its own tab named by its goal name (locked to
   * that preset, optimizer only).
   *
   * Keep-alive: a visited tab stays mounted inside a `hidden` wrapper so an
   * in-flight optimizer/Web Worker search survives tab switches; the
   * visited set resets on character switch (the screens reset their own
   * view-state then too). A tab that disappears (goal unassigned) falls
   * back to the Dashboard.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { presetGoalLabel } from '../lib/model.js';
  import SimulationsDashboard from './SimulationsDashboard.svelte';
  import SimulationScreen from './SimulationScreen.svelte';
  import PvpScreen from './PvpScreen.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);

  // [{ id, label, color }] - Dashboard first, then built-in goal kinds in a
  // fixed order, then one tab per Custom-goal preset.
  const tabs = $derived.by(() => {
    const list = [{ id: 'dashboard', label: 'Dashboard', color: 'simulations' }];
    const kinds = new Set(character.presets.map((p) => p.goal?.kind).filter(Boolean));
    if (kinds.has('dps')) list.push({ id: 'dps', label: 'DPS', color: 'simulations' });
    if (kinds.has('tank')) list.push({ id: 'tank', label: 'Tank', color: 'mounts' });
    if (kinds.has('pvp')) list.push({ id: 'pvp', label: 'PVP', color: 'pvp' });
    for (const p of character.presets) {
      if (p.goal?.kind === 'custom') {
        list.push({ id: `custom-${p.id}`, label: presetGoalLabel(p.goal), color: 'awakening', presetId: p.id });
      }
    }
    return list;
  });

  let activeTab = $state('dashboard');
  let visited = $state(['dashboard']);

  // Character switches reset the tab state entirely (the embedded screens
  // reset their own view-state on the same signal).
  let lastCharacterId = $state(null);
  $effect(() => {
    if (character.id !== lastCharacterId) {
      lastCharacterId = character.id;
      activeTab = 'dashboard';
      visited = ['dashboard'];
    }
  });

  // A vanished tab (goal unassigned / custom preset deleted) falls back to
  // the Dashboard; its keep-alive wrapper unmounts with it.
  $effect(() => {
    if (!tabs.some((t) => t.id === activeTab)) activeTab = 'dashboard';
    // Only replace the array when something actually pruned - an
    // unconditional write would re-trigger this effect forever.
    const pruned = visited.filter((id) => tabs.some((t) => t.id === id));
    if (pruned.length !== visited.length) visited = pruned;
  });

  function selectTab(id) {
    activeTab = id;
    if (!visited.includes(id)) visited = [...visited, id];
  }

  const tabStyle = (t) =>
    `--tab-color: var(--nav-${t.color}); --tab-color-light: var(--nav-${t.color}-light); --tab-color-tint: var(--nav-${t.color}-tint);`;
</script>

<div class="simulations-screen">
  <div class="tab-bar" role="tablist" aria-label="Simulation tabs">
    {#each tabs as t (t.id)}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === t.id}
        class="tab"
        class:active={activeTab === t.id}
        style={tabStyle(t)}
        onclick={() => selectTab(t.id)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  {#each tabs.filter((t) => visited.includes(t.id)) as t (t.id)}
    <div class="tab-panel" role="tabpanel" hidden={activeTab !== t.id}>
      {#if t.id === 'dashboard'}
        <SimulationsDashboard {setStatus} />
      {:else if t.id === 'dps'}
        <SimulationScreen {setStatus} presetFilterGoal="dps" />
      {:else if t.id === 'tank'}
        <SimulationScreen {setStatus} presetFilterGoal="tank" />
      {:else if t.id === 'pvp'}
        <PvpScreen {setStatus} />
      {:else}
        <SimulationScreen {setStatus} lockedPresetId={t.presetId} panels={['optimizer']} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    gap: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-6);
    overflow-x: auto; /* mobile: the bar scrolls, never wraps */
    scrollbar-width: none;
  }
  .tab {
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-muted);
    font: inherit;
    font-size: 13px;
    letter-spacing: 0.04em;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:hover {
    color: var(--tab-color-light);
  }
  .tab.active {
    color: var(--tab-color-light);
    border-bottom-color: var(--tab-color);
    background: var(--tab-color-tint);
  }
</style>
