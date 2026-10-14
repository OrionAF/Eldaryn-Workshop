<script>
  /**
   * PresetsScreen.svelte - the hub: a grid of the character's presets (2..8) and the editor for the
   * active one. A preset is a set of ids (gear set, talent set, pet, mount, relics, sigils,
   * transcendence) plus an optional entered stat sheet; the editor also validates the model against
   * that sheet and can absorb the gap into the character's base stats.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { MAX_PRESETS } from '../../lib/model/presets.js';
  import PresetCard from '../presets/PresetCard.svelte';
  import PresetEditor from '../presets/PresetEditor.svelte';

  let { setStatus = () => {}, onNavigate = () => {} } = $props(); // eslint-disable-line no-unused-vars

  const character = $derived(rosterStore.current);
  const active = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);

  function addPreset() {
    if (!rosterStore.addPreset()) setStatus(`At most ${MAX_PRESETS} presets.`);
  }
</script>

<div class="header-row">
  <h2>Presets</h2>
  <p class="hint">each preset picks a gear set, talent set, pet, mount, relics and sigils · the sheet validates the model</p>
  <button type="button" class="btn-gold new-preset-btn" disabled={character.presets.length >= MAX_PRESETS} onclick={addPreset}>
    + New Preset
  </button>
</div>

<div class="preset-grid">
  {#each character.presets as preset (preset.id)}
    <PresetCard
      {preset}
      {character}
      editing={preset.id === active.id}
      onSelect={() => rosterStore.setActivePreset(preset.id)}
    />
  {/each}
</div>

{#key active.id}
  <PresetEditor preset={active} {character} {setStatus} />
{/key}

<style>
  .header-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
  h2 { font-family: var(--font-heading); margin: 0; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; flex: 1; }
  .preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
  @media (max-width: 700px) { .preset-grid { grid-template-columns: 1fr; } }
</style>
