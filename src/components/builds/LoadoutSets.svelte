<script>
  /**
   * LoadoutSets.svelte - B2 "Gear & talents" panel (ia.md §5.7): equipment set, talent set and
   * Transcendence board of the active preset. Sets 2 are level-gated (M1 legality); the gate shows as a
   * disabled option with its reason instead of the choice silently reverting.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { dualEquipUnlocked, dualTalentsUnlocked, transcendenceUnlocked, UNLOCK_LEVELS, resolveTranscendencePreset } from '../../lib/model/legality.js';
  import Panel from '../ui/Panel.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Select from '../ui/Select.svelte';
  import { SET_LABELS, talentSetLabel, filledSlots } from '../presets/presetLabels.js';

  let { character, preset } = $props();

  const gearOptions = $derived(
    [1, 2].map((n) => ({
      value: n,
      label: `Set ${n}`,
      sub: `${filledSlots(character, `set${n}`)} items`,
      disabled: n === 2 && !dualEquipUnlocked(character.level),
    })),
  );
  const talentOptions = $derived(
    [0, 1].map((i) => ({
      value: String(i),
      label: talentSetLabel(character, i),
      disabled: i === 1 && !dualTalentsUnlocked(character.level),
    })),
  );
  const boardOptions = $derived([
    { value: '', label: 'Follow the active board' },
    ...character.transcendence.presets.map((p) => ({ value: p.id, label: p.name })),
  ]);
  const resolved = $derived(resolveTranscendencePreset(character, preset));
</script>

<Panel title="Gear & talents" level="primary" scope="preset">
  <div class="field">
    <span class="label" id="lo-gear-label">Equipment set</span>
    <SegmentedControl
      label="Equipment set"
      options={gearOptions}
      value={preset.equipmentSet}
      onchange={(v) => rosterStore.setPresetEquipmentSet(preset.id, v)}
    />
    {#if !dualEquipUnlocked(character.level)}
      <span class="hint">Set 2 unlocks at level {UNLOCK_LEVELS.DUAL_EQUIP}.</span>
    {:else}
      <span class="hint">{SET_LABELS[preset.equipmentSet]} is what this preset wears. Edit items in <a href="#/character/gear">Gear</a>.</span>
    {/if}
  </div>
  <Select
    label="Talent set"
    options={talentOptions}
    value={String(preset.talentSet)}
    hint={dualTalentsUnlocked(character.level) ? '' : `Set B unlocks at level ${UNLOCK_LEVELS.DUAL_TALENTS}.`}
    onchange={(v) => rosterStore.setPresetTalentSet(preset.id, Number(v))}
  />
  <Select
    label="Transcendence board"
    options={boardOptions}
    value={preset.transcendencePresetId ?? ''}
    disabled={!transcendenceUnlocked(character.level)}
    hint={transcendenceUnlocked(character.level)
      ? `${resolved ? `Uses ${resolved.name}` : 'No board yet'}${preset.transcendencePresetId ? '' : ' (the active board)'}. `
      : `Transcendence unlocks at level ${UNLOCK_LEVELS.TRANSCENDENCE}.`}
    onchange={(v) => rosterStore.setPresetTranscendence(preset.id, v || null)}
  />
  <a class="link" href="#/character/transcendence">Edit boards</a>
</Panel>

<style>
  .field { display: grid; gap: var(--sp-2); }
  .label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .link { font-size: var(--fs-12); }
</style>
