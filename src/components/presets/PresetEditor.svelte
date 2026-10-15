<script>
  /**
   * PresetEditor.svelte - edits one preset: its name, the ids it points at (gear set, talent set, pet,
   * mount, relics, sigils, transcendence preset) and the in-game stat sheet used to validate or replace
   * the computed totals (rebuild-plan §4). Every selector is a chip row over things the character owns.
   *
   * The sheet is per preset; with Oblivion unlocked the Oblivion realm has its own sheet
   * (character.oblivion.sheet), edited through the realm toggle.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { computePresetStats } from '../../lib/build/stats.js';
  import { absorbIntoBase } from '../../lib/build/residual.js';
  import { presetSpec } from '../../lib/build/presetInputs.js';
  import { sheetKeysForClass, normaliseSheetValues } from '../../lib/engine/pipeline/sheet.js';
  import { relicsForClass } from '../../lib/game/relics.js';
  import { MIN_PRESETS, MAX_PRESETS, PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from '../../lib/model/presets.js';
  import { genericSigils, utilitySigils, ancientSigils, maxSigilSlots } from '../../lib/model/sigils.js';
  import Chip from '../Chip.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SheetFields from '../sheet/SheetFields.svelte';
  import SheetDiff from '../sheet/SheetDiff.svelte';
  import { SET_LABELS, petLabel, mountLabel, talentSetLabel, sigilLabel, filledSlots } from './presetLabels.js';

  let { preset, character, setStatus = () => {}, onDeleted = () => {} } = $props();

  let realm = $state('base');
  const activeRealm = $derived(realm === 'oblivion' && character.oblivion.unlocked ? 'oblivion' : 'base');

  const spec = $derived(presetSpec(character, preset));
  const relicDefs = $derived(relicsForClass(character.class));
  const genericDefs = $derived(
    genericSigils(character.class, spec).filter((s) => character.sigils.owned[s.species] || preset.sigilSpecies.includes(s.species)),
  );
  const utilityDefs = $derived(utilitySigils(character.class, spec).filter((s) => character.sigils.owned[s.species]));
  const ancientDefs = $derived(ancientSigils(character.class).filter((s) => character.sigils.owned[s.species]));
  const sigilSlots = $derived(Math.min(PRESET_SIGIL_CAP, maxSigilSlots(character.level, character.class)));

  let relicError = $state('');
  let sigilError = $state('');

  function toggleRelic(id) {
    const has = preset.relicIds.includes(id);
    if (!has && preset.relicIds.length >= PRESET_RELIC_CAP) {
      relicError = `${PRESET_RELIC_CAP} slots full, remove one first.`;
      return;
    }
    relicError = '';
    rosterStore.setPresetRelics(preset.id, has ? preset.relicIds.filter((r) => r !== id) : [...preset.relicIds, id]);
  }

  function toggleSigil(species) {
    const has = preset.sigilSpecies.includes(species);
    if (!has && preset.sigilSpecies.length >= sigilSlots) {
      sigilError = `${sigilSlots} generic slot${sigilSlots === 1 ? '' : 's'} unlocked and full, remove one first.`;
      return;
    }
    sigilError = '';
    rosterStore.setPresetSigils(preset.id, {
      species: has ? preset.sigilSpecies.filter((s) => s !== species) : [...preset.sigilSpecies, species],
    });
  }

  // --- Sheet ---
  const stats = $derived(computePresetStats(character, preset.id, { realm: activeRealm }));
  const sheetValues = $derived(stats.sheet?.values ?? {});
  const sheetKeys = $derived(sheetKeysForClass(character.class, activeRealm).filter((k) => k !== 'totalDominion'));
  const ABSORB_KEYS = ['totalAttack', 'totalHp', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage'];
  const absorbable = $derived(ABSORB_KEYS.some((k) => stats.residual[k]));

  function writeSheet(values) {
    const clean = normaliseSheetValues(values);
    const next = Object.keys(clean).length ? clean : null;
    if (activeRealm === 'oblivion') rosterStore.setOblivionSheet(next, preset.id);
    else rosterStore.setPresetSheet(preset.id, next);
  }

  function confirmSheet() {
    if (activeRealm === 'oblivion') rosterStore.confirmOblivionSheet(preset.id);
    else rosterStore.confirmPresetSheet(preset.id);
  }

  function onSheetChange(key, value) {
    const next = { ...sheetValues };
    if (value === null) delete next[key];
    else next[key] = value;
    writeSheet(next);
  }

  function absorb() {
    const { base } = absorbIntoBase(character.baseResidual, stats.computed, stats.residual, stats.ctx);
    rosterStore.setBaseResidual(base);
    setStatus('Absorbed the sheet gap into the character base stats.');
  }

  function deletePreset() {
    rosterStore.deletePreset(preset.id);
    onDeleted();
  }
</script>

<div class="editor" data-testid="preset-editor">
  <div class="editor-header">
    <span class="rule-left"></span>
    <h2>EDITING - {preset.name.toUpperCase()}</h2>
    <span class="rule-right"></span>
    <button
      type="button"
      class="btn-ghost"
      disabled={character.presets.length >= MAX_PRESETS}
      onclick={() => rosterStore.duplicatePreset(preset.id)}>Duplicate</button
    >
    <ConfirmButton
      class="btn-danger"
      label="Delete preset"
      confirmLabel="Confirm delete"
      prompt="Delete this preset?"
      disabled={character.presets.length <= MIN_PRESETS}
      onConfirm={deletePreset}
    />
  </div>

  <div class="editor-grid">
    <div class="field-group">
      <span class="micro-label">Name</span>
      <input
        type="text"
        aria-label="Preset name"
        value={preset.name}
        onblur={(e) => rosterStore.renamePreset(preset.id, e.target.value)}
        onkeydown={(e) => e.key === 'Enter' && e.target.blur()}
      />
    </div>

    <div class="field-group">
      <span class="micro-label"><span class="diamond" style="color: var(--nav-gear)">◆</span> Gear Set</span>
      <div class="chip-list">
        {#each [1, 2] as n (n)}
          <Chip
            label={`${SET_LABELS[n]} · ${filledSlots(character, `set${n}`)} items`}
            selected={preset.equipmentSet === n}
            onClick={() => rosterStore.setPresetEquipmentSet(preset.id, n)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="micro-label"><span class="diamond" style="color: var(--nav-talents)">◆</span> Talent Set</span>
      <div class="chip-list">
        {#each [0, 1] as i (i)}
          <Chip
            label={talentSetLabel(character, i)}
            selected={preset.talentSet === i}
            onClick={() => rosterStore.setPresetTalentSet(preset.id, i)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="micro-label"><span class="diamond" style="color: var(--nav-pets)">◆</span> Pet</span>
      <div class="chip-list">
        <Chip label="None" selected={!preset.petId} onClick={() => rosterStore.setPresetPet(preset.id, null)} />
        {#each character.pets.owned as pet (pet.id)}
          <Chip
            label={`${petLabel(character, pet.id)} (${pet.rarity})`}
            selected={preset.petId === pet.id}
            onClick={() => rosterStore.setPresetPet(preset.id, pet.id)}
          />
        {/each}
      </div>
      {#if !character.pets.owned.length}<p class="note">No pets owned yet. Add some on the Pets screen.</p>{/if}
    </div>

    <div class="field-group">
      <span class="micro-label"><span class="diamond" style="color: var(--nav-mounts)">◆</span> Mount</span>
      <div class="chip-list">
        <Chip label="None" selected={!preset.mountId} onClick={() => rosterStore.setPresetMount(preset.id, null)} />
        {#each character.mounts as mount (mount.id)}
          <Chip
            label={`${mountLabel(character, mount.id)} (${mount.rarity})`}
            selected={preset.mountId === mount.id}
            onClick={() => rosterStore.setPresetMount(preset.id, mount.id)}
          />
        {/each}
      </div>
      {#if !character.mounts.length}<p class="note">No mounts owned yet. Add some on the Mounts screen.</p>{/if}
    </div>

    <div class="field-group">
      <span class="micro-label">Transcendence</span>
      <div class="chip-list">
        <Chip label="None" selected={!preset.transcendencePresetId} onClick={() => rosterStore.setPresetTranscendence(preset.id, null)} />
        {#each character.transcendence.presets as tp (tp.id)}
          <Chip
            label={tp.name}
            selected={preset.transcendencePresetId === tp.id}
            onClick={() => rosterStore.setPresetTranscendence(preset.id, tp.id)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group wide">
      <span class="micro-label"
        ><span class="diamond" style="color: var(--nav-relics)">◆</span> Relics - {preset.relicIds.length}/{PRESET_RELIC_CAP} slots</span
      >
      <div class="chip-list">
        {#each relicDefs as def (def.id)}
          {@const lv = character.relics[def.id] ?? 0}
          <Chip
            label={`${def.name} Lv${lv}`}
            selected={preset.relicIds.includes(def.id)}
            disabled={lv === 0 && !preset.relicIds.includes(def.id)}
            onClick={() => toggleRelic(def.id)}
            size="compact"
          />
        {/each}
      </div>
      {#if relicError}<p class="inline-error" role="alert">{relicError}</p>{/if}
    </div>

    <div class="field-group wide">
      <span class="micro-label"
        ><span class="diamond" style="color: var(--nav-sigils)">◆</span> Sigils - {preset.sigilSpecies.length}/{sigilSlots} slots unlocked</span
      >
      <div class="chip-list">
        {#each genericDefs as def (def.species)}
          <Chip
            label={`${def.name} Lv${character.sigils.owned[def.species]?.level ?? 0}`}
            selected={preset.sigilSpecies.includes(def.species)}
            onClick={() => toggleSigil(def.species)}
            size="compact"
          />
        {/each}
      </div>
      {#if !genericDefs.length}<p class="note">No sigils owned for this spec. Add some on the Sigils screen.</p>{/if}
      {#if sigilError}<p class="inline-error" role="alert">{sigilError}</p>{/if}

      {#if utilityDefs.length}
        <span class="micro-label sub">Utility</span>
        <div class="chip-list">
          <Chip label="None" selected={!preset.utilitySigilSpecies} onClick={() => rosterStore.setPresetSigils(preset.id, { utility: null })} size="compact" />
          {#each utilityDefs as def (def.species)}
            <Chip
              label={def.name}
              selected={preset.utilitySigilSpecies === def.species}
              onClick={() => rosterStore.setPresetSigils(preset.id, { utility: def.species })}
              size="compact"
            />
          {/each}
        </div>
      {/if}
      {#if ancientDefs.length}
        <span class="micro-label sub">Ancient</span>
        <div class="chip-list">
          <Chip label="None" selected={!preset.ancientSigilSpecies} onClick={() => rosterStore.setPresetSigils(preset.id, { ancient: null })} size="compact" />
          {#each ancientDefs as def (def.species)}
            <Chip
              label={sigilLabel(def.species)}
              selected={preset.ancientSigilSpecies === def.species}
              onClick={() => rosterStore.setPresetSigils(preset.id, { ancient: def.species })}
              size="compact"
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="sheet-section">
    <div class="sheet-header">
      <span class="micro-label">IN-GAME STAT SHEET</span>
      <span class="source-note" data-testid="sheet-source">
        {stats.source === 'sheet' ? 'Using your sheet where entered' : 'Using computed totals'}
      </span>
      {#if character.oblivion.unlocked}
        <div class="chip-list realm-toggle">
          <Chip label="Base" size="compact" selected={activeRealm === 'base'} onClick={() => (realm = 'base')} />
          <Chip label="Oblivion" size="compact" selected={activeRealm === 'oblivion'} onClick={() => (realm = 'oblivion')} />
        </div>
      {/if}
      <button type="button" class="btn-ghost" disabled={!stats.sheet} onclick={() => writeSheet({})}>Clear sheet</button>
      {#if stats.sheetStatus === 'stale' || stats.sheetStatus === 'unverified'}
        <button type="button" class="btn-ghost" data-testid="sheet-confirm" onclick={confirmSheet}>Confirm sheet matches this build</button>
      {/if}
    </div>
    {#if stats.sheetStatus === 'stale' || stats.sheetStatus === 'unverified'}
      <p class="note" data-testid="sheet-status">{stats.warnings[stats.warnings.length - 1]}</p>
    {/if}
    <p class="note">
      Type the numbers from the in-game character sheet. Leave a row blank to use the model's value. Flat rows
      read "." as a thousands separator ("48.124" is 48124); percentage rows read it as a decimal point.
      {#if activeRealm === 'oblivion'}This is the Oblivion realm's sheet; it applies only to the preset it was entered for.{/if}
    </p>
    <SheetFields keys={sheetKeys} values={sheetValues} computed={stats.computed} onChange={onSheetChange} />
    <SheetDiff computed={stats.computed} sheet={stats.sheet} {absorbable} onAbsorb={absorb} />
  </div>
</div>

<style>
  .editor {
    margin-top: 14px;
    background: var(--color-panel);
    border: 1px solid var(--color-gold);
    box-shadow: var(--color-gold-glow);
    border-radius: var(--radius-panel);
    padding: 18px 20px;
  }
  .editor-header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
  .editor-header h2 { font-size: 12.5px; letter-spacing: 0.14em; color: var(--color-gold-light); white-space: nowrap; margin: 0; }
  .rule-left { width: 26px; height: 1px; background: var(--color-gold); flex-shrink: 0; }
  .rule-right { flex: 1; height: 1px; background: linear-gradient(90deg, var(--color-gold), transparent); }
  .editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 22px; }
  .field-group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .field-group.wide { grid-column: 1 / -1; }
  .micro-label .diamond { font-size: 9px; }
  .micro-label.sub { margin-top: var(--space-2); }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .inline-error { color: var(--color-downgrade); font-size: 11px; margin: 0; }
  .note { color: var(--color-muted); font-size: 11.5px; margin: 0; }
  .sheet-section { border-top: 1px solid var(--color-border); margin-top: 18px; padding-top: 14px; display: flex; flex-direction: column; gap: var(--space-3); }
  .sheet-header { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .source-note { flex: 1; font-size: 11.5px; color: var(--color-soft); }
  .realm-toggle { gap: 4px; }
</style>
