<script>
  /**
   * OpponentPicker.svelte - the saved opponents of the character as chips, plus the two ways to make
   * one: a blank opponent of a chosen spec (then type its sheet), or "clone my preset as spec X"
   * (my effective stats and the loadout parts legal for X, ready to tweak).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { SPECS, classLabel } from '../../lib/game/classes.js';
  import { MAX_OPPONENTS } from '../../lib/model/opponents.js';
  import Chip from '../Chip.svelte';

  let { character, selectedId = null, onSelect, setStatus = () => {} } = $props();

  let newSpec = $state('WARRIOR_DPS');
  let cloneSpec = $state('WARRIOR_DPS');
  // svelte-ignore state_referenced_locally
  let clonePreset = $state(character.activePresetId);

  const full = $derived(character.opponents.length >= MAX_OPPONENTS);
  const specLabel = (key) => {
    const s = SPECS.find((x) => x.key === key);
    return s ? `${classLabel(s.class)} · ${s.name}` : key;
  };
  const presetId = $derived(character.presets.some((p) => p.id === clonePreset) ? clonePreset : character.activePresetId);

  function add() {
    const id = rosterStore.addOpponent(newSpec);
    if (id) onSelect(id);
    else setStatus(`At most ${MAX_OPPONENTS} saved opponents.`);
  }
  function clone() {
    const id = rosterStore.cloneOpponentFromPreset(presetId, cloneSpec);
    if (id) {
      onSelect(id);
      setStatus('Cloned your preset. Adjust the stats to match the real opponent.');
    } else setStatus(`At most ${MAX_OPPONENTS} saved opponents.`);
  }
</script>

<div class="picker" data-testid="opponent-picker">
  <div class="chip-list">
    {#each character.opponents as o (o.id)}
      <Chip label={`${o.name} · ${specLabel(o.spec)}`} selected={selectedId === o.id} onClick={() => onSelect(o.id)} />
    {:else}
      <p class="note">No saved opponents yet. Add one below.</p>
    {/each}
  </div>
  <div class="make">
    <div class="row">
      <select aria-label="New opponent spec" bind:value={newSpec}>
        {#each SPECS as s (s.key)}<option value={s.key}>{specLabel(s.key)}</option>{/each}
      </select>
      <button type="button" class="btn-gold" disabled={full} onclick={add}>+ New opponent</button>
    </div>
    <div class="row">
      <span class="micro-label">Clone</span>
      <select aria-label="Preset to clone" bind:value={clonePreset}>
        {#each character.presets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <span class="micro-label">as</span>
      <select aria-label="Spec to clone as" bind:value={cloneSpec}>
        {#each SPECS as s (s.key)}<option value={s.key}>{specLabel(s.key)}</option>{/each}
      </select>
      <button type="button" class="btn-ghost" disabled={full} onclick={clone}>Clone</button>
    </div>
  </div>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: var(--space-3); }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .make { display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .note { color: var(--color-muted); font-size: 11.5px; margin: 0; }
</style>
