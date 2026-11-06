<script>
  /**
   * LoadoutSets.svelte - B2 "Gear & talents" panel (ia.md §5.7): equipment set, talent set and
   * Transcendence board of the active preset. Sets 2 are level-gated (M1 legality); the gate shows as a
   * disabled option with its reason instead of the choice silently reverting.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { dualEquipUnlocked, dualTalentsUnlocked, transcendenceUnlocked, transcendenceLinkUnlocked, UNLOCK_LEVELS, effectiveTranscendencePreset } from '../../lib/model/legality.js';
  import Panel from '../ui/Panel.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Select from '../ui/Select.svelte';
  import { SET_LABELS, talentSetLabel, filledSlots } from './presetLabels.js';

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
  // below level 58 a preset cannot link a board (transcendence.md §9); a saved link stays selectable so it can be cleared
  const canLink = $derived(transcendenceLinkUnlocked(character.level));
  const boardOptions = $derived([
    { value: '', label: 'Use the active board' },
    ...character.transcendence.presets.map((p) => ({ value: p.id, label: p.name, disabled: !canLink && p.id !== preset.transcendencePresetId })),
  ]);
  // the board the stats run on: below 58 a saved link is ignored for the active board
  const runs = $derived(effectiveTranscendencePreset(character, preset));
  const boardHint = $derived(
    !transcendenceUnlocked(character.level)
      ? `Transcendence unlocks at level ${UNLOCK_LEVELS.TRANSCENDENCE}.`
      : `${runs ? `Uses ${runs.name}` : 'No board yet'}${canLink && preset.transcendencePresetId ? '' : ' (the active board)'}. ` +
          (canLink ? '' : `Choosing a board for this preset unlocks at level ${UNLOCK_LEVELS.TRANSCENDENCE_PRESETS}${preset.transcendencePresetId ? '; until then the active board is used' : ''}.`),
  );
</script>

<Panel title="Gear & talents" level="primary" scope="preset">
  <!-- three choices side by side, each as wide as its options (never the panel), hints under each -->
  <div class="field-row sets">
  <div class="field gear">
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
  <div class="talent">
  <Select
    label="Talent set"
    options={talentOptions}
    value={String(preset.talentSet)}
    hint={dualTalentsUnlocked(character.level) ? '' : `Set B unlocks at level ${UNLOCK_LEVELS.DUAL_TALENTS}.`}
    onchange={(v) => rosterStore.setPresetTalentSet(preset.id, Number(v))}
  />
  </div>
  <div class="board">
  <Select
    label="Transcendence board"
    options={boardOptions}
    value={preset.transcendencePresetId ?? ''}
    disabled={!canLink && !preset.transcendencePresetId}
    hint={boardHint}
    onchange={(v) => rosterStore.setPresetTranscendence(preset.id, v || null)}
  />
  <a class="link" href="#/character/transcendence">Edit boards</a>
  </div>
  </div>
</Panel>

<style>
  .sets { gap: var(--sp-3) var(--sp-6); }
  .field { display: grid; gap: var(--field-gap); align-content: start; }
  .gear { width: min(20rem, 100%); }
  .talent { width: min(16rem, 100%); }
  .board { width: min(20rem, 100%); display: grid; gap: var(--sp-1); align-content: start; }
  .label { font-size: var(--fs-12); line-height: var(--field-label-h); font-weight: var(--fw-bold); color: var(--text-soft); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .link { font-size: var(--fs-12); }
</style>
