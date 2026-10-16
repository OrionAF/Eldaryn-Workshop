<script>
  /**
   * ToolsOpponentsPage.svelte - T4 Opponents (ia.md §3.4, §5.19): the saved opponent library (up to
   * 12), a blank opponent of a chosen spec, "Clone my preset as..." and the editor. Duel, Drop Check
   * and the Optimiser read this library; this page is where it is written.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { requestImportFocus } from '../../lib/importFlow.svelte.js';
  import { prefs } from '../../lib/prefs.svelte.js';
  import { SPECS, classLabel } from '../../lib/game/classes.js';
  import { MAX_OPPONENTS } from '../../lib/model/opponents.js';
  import { opponentFighter, missingStats } from '../../lib/features/duel.js';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import OpponentPanel from '../duel/OpponentPanel.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const specLabel = (key) => {
    const s = SPECS.find((x) => x.key === key);
    return s ? `${classLabel(s.class)} · ${s.name}` : key;
  };
  const specOptions = SPECS.map((s) => ({ value: s.key, label: specLabel(s.key) }));

  let selectedId = $state(null);
  let newSpec = $state('WARRIOR_DPS');
  let cloneSpecPick = $state(null); // null: follow the chosen preset's talent-set spec
  let clonePick = $state(null);

  const selected = $derived(character.opponents.find((o) => o.id === selectedId) ?? character.opponents[0] ?? null);
  const full = $derived(character.opponents.length >= MAX_OPPONENTS);
  const clonePreset = $derived(character.presets.some((p) => p.id === clonePick) ? clonePick : character.activePresetId);
  // The spec the preset plays: its chosen talent set's spec, else the class's first spec.
  const presetSpec = (id) => {
    const p = character.presets.find((x) => x.id === id);
    return character.talentSets?.[p?.talentSet === 1 ? 1 : 0]?.spec ?? SPECS.find((x) => x.class === character.class)?.key ?? 'WARRIOR_DPS';
  };
  const cloneSpec = $derived(cloneSpecPick ?? presetSpec(clonePreset));
  const presetOptions = $derived(character.presets.map((p) => ({ value: p.id, label: p.name })));
  const rows = $derived(
    character.opponents.map((o) => {
      const missing = missingStats(opponentFighter(o));
      return { o, missing };
    }),
  );

  function add() {
    const id = rosterStore.addOpponent(newSpec);
    if (id) selectedId = id;
    else setStatus(`At most ${MAX_OPPONENTS} saved opponents.`);
  }
  function clone() {
    const id = rosterStore.cloneOpponentFromPreset(clonePreset, cloneSpec);
    if (id) {
      selectedId = id;
      setStatus('Cloned your preset. Adjust the stats to match the real opponent.');
    } else setStatus(`At most ${MAX_OPPONENTS} saved opponents.`);
  }
</script>

<div class="panes">
  <div class="stack">
    <Panel title="Opponent library" level="primary" scope="tool">
      {#snippet meta()}<span class="count" data-testid="opponent-count">{character.opponents.length} of {MAX_OPPONENTS}</span>{/snippet}
      <div data-testid="opponent-picker">
        {#if rows.length}
          <ul class="list" aria-label="Saved opponents">
            {#each rows as { o, missing } (o.id)}
              <li>
                <button type="button" class="row" class:is-sel={selected?.id === o.id} aria-current={selected?.id === o.id ? 'true' : undefined} onclick={() => (selectedId = o.id)}>
                  <span class="name">{o.name}</span>
                  <span class="sub">{specLabel(o.spec)}{o.imported ? ` · from Rankings, level ${o.imported.level}` : ''}</span>
                  <span class="state" class:warn={missing.length > 0}>{missing.length ? `Needs ${missing.join(', ')}` : 'Ready'}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <EmptyState title="No saved opponents yet" text="Add one below, or clone one of your presets as a starting point." />
        {/if}
      </div>
    </Panel>

    <Panel title="Add an opponent" scope="tool">
      <Select label="New opponent spec" options={specOptions} bind:value={newSpec} />
      <Button variant="primary" disabled={full} reason={full ? `At most ${MAX_OPPONENTS} saved opponents.` : ''} onclick={add}>+ New opponent</Button>
      <hr />
      <Select label="Clone my preset" options={presetOptions} value={clonePreset} onchange={(v) => { clonePick = v; cloneSpecPick = null; }} />
      <Select label="as spec" options={specOptions} value={cloneSpec} onchange={(v) => (cloneSpecPick = v)} />
      <Button variant="secondary" disabled={full} reason={full ? `At most ${MAX_OPPONENTS} saved opponents.` : ''} onclick={clone}>Clone</Button>
    </Panel>

    {#if selected}
      <Button variant="ghost" onclick={() => go('#/tools/duel')}>Duel an opponent</Button>
    {/if}
    {#if prefs.showImport}
      <p class="note" data-testid="rankings-import-note">
        <a href="#/settings" onclick={requestImportFocus}>Import a player from Rankings in Settings → Advanced</a>.
        {#if selected?.imported}
          {selected.name} came from Rankings (level {selected.imported.level}){selected.imported.importedAt ? `, ${selected.imported.importedAt.slice(0, 10)}` : ''}: import the same player's profile again to refresh it.
        {/if}
      </p>
    {:else if selected?.imported}
      <p class="note" data-testid="rankings-import-note">
        {selected.name} came from Rankings (level {selected.imported.level}){selected.imported.importedAt ? `, ${selected.imported.importedAt.slice(0, 10)}` : ''}.
      </p>
    {/if}
  </div>

  <div class="editor">
    {#if selected}
      {#key selected.id}
        <OpponentPanel opponent={selected} onRemoved={() => (selectedId = null)} />
      {/key}
    {:else}
      <Panel title="Opponent" scope="tool">
        <EmptyState title="Pick or add an opponent" text="Its editor opens here: name, class and spec, stat sheet and loadout." />
      </Panel>
    {/if}
  </div>
</div>

<style>
  .panes { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  @media (max-width: 1100px) { .panes { grid-template-columns: minmax(0, 1fr); } }
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .editor { min-width: 0; }
  .count { font-family: var(--font-data); font-size: var(--fs-12); color: var(--text-muted); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-1); }
  .row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--sp-3);
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-1);
    cursor: pointer;
    font-family: var(--font-ui);
  }
  .row:hover { border-color: var(--line-control-hover); }
  .row.is-sel { border-color: var(--brass-400); box-shadow: inset 2px 0 0 var(--brass-400); }
  .name { font-weight: var(--fw-bold); }
  .sub { grid-column: 1; color: var(--text-soft); font-size: var(--fs-12); }
  .state { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--text-muted); font-size: var(--fs-12); }
  .state.warn { color: var(--verdict-warn, var(--text-soft)); }
  .note { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
  hr { border: 0; border-top: 1px solid var(--line-hairline); width: 100%; margin: 0; }
</style>
