<script>
  /**
   * BuildsLoadoutPage.svelte - B2 (plan §D U7): the active preset's loadout trays. A preset only picks
   * things; the collections they come from are edited in Character. `tab` is the optional third hash segment.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { MIN_PRESETS, MAX_PRESETS } from '../../lib/model/presets.js';
  import Button from '../ui/Button.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import LoadoutChecks from '../builds/LoadoutChecks.svelte';
  import LoadoutSets from '../builds/LoadoutSets.svelte';
  import LoadoutPetMount from '../builds/LoadoutPetMount.svelte';
  import LoadoutRelics from '../builds/LoadoutRelics.svelte';
  import LoadoutSigils from '../builds/LoadoutSigils.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const atMax = $derived(character.presets.length >= MAX_PRESETS);
  const atMin = $derived(character.presets.length <= MIN_PRESETS);

  function rename(e) {
    if (e.target.value.trim()) rosterStore.renamePreset(preset.id, e.target.value);
    else e.target.value = preset.name;
  }
</script>

{#key preset.id}
  <div class="head" data-testid="preset-editor">
    <label class="title">
      <span class="visually-hidden">Preset name</span>
      <input type="text" aria-label="Preset name" value={preset.name} onblur={rename} onkeydown={(e) => e.key === 'Enter' && e.target.blur()} />
    </label>
    <Button
      variant="ghost"
      size="small"
      disabled={atMax}
      reason={atMax ? `At most ${MAX_PRESETS} presets` : ''}
      onclick={() => rosterStore.duplicatePreset(preset.id)}>Duplicate</Button
    >
    <ConfirmButton
      variant="danger"
      size="small"
      label="Delete preset"
      confirmLabel="Confirm delete"
      prompt="Delete this preset?"
      disabled={atMin}
      onConfirm={() => rosterStore.deletePreset(preset.id)}
    />
    {#if atMin}<span class="hint">A character keeps at least {MIN_PRESETS} presets.</span>{/if}
  </div>

  <LoadoutChecks {character} {preset} />

  <div class="grid">
    <LoadoutSets {character} {preset} />
    <LoadoutPetMount {character} {preset} />
    <LoadoutRelics {character} {preset} />
    <LoadoutSigils {character} {preset} />
  </div>
{/key}

<style>
  .head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
  .title { flex: 1; min-width: 200px; max-width: 360px; }
  .title input { width: 100%; font-family: var(--font-display); font-size: var(--fs-20); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .grid { display: grid; gap: var(--sp-3); margin-top: var(--sp-3); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
