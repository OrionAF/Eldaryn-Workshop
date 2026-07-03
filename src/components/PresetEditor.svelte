<script>
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS, TALENT_TOTAL_POINTS, STAT_FIELDS, fieldsForTab } from '../lib/constants.js';
  import { RELICS_BY_CLASS } from '../lib/relicsData.js';
  import { formatStat } from '../lib/format.js';
  import { computeDps, computeHps } from '../lib/dps.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { talentSetLabel } from '../lib/model.js';
  import Chip from './Chip.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import StatsFields from './StatsFields.svelte';

  let { preset, character, setStatus, onDeleted } = $props();

  const relicDefs = $derived(RELICS_BY_CLASS[character.class] || []);
  const totals = $derived(resolveEffectiveTotals(character, preset));
  const dps = $derived(computeDps(totals));
  const hps = $derived(computeHps(totals).total_hps);
  const profileFields = $derived(fieldsForTab('profile', character.class));

  let relicError = $state('');

  function filledSlotCount(loadoutIndex) {
    const gear = character.loadouts[loadoutIndex].gear;
    return SLOTS.filter((s) => Object.values(gear[s]).some((v) => v !== 0)).length;
  }

  function pointsSpent(talentSetIndex) {
    return Object.values(character.talentSets[talentSetIndex].allocation || {}).reduce((a, b) => a + b, 0);
  }

  function petSummary(pet) {
    const bits = STAT_FIELDS.filter((f) => (pet.stats[f.key] || 0) !== 0)
      .map((f) => `${formatStat(f.key, pet.stats[f.key])}${f.kind === 'pct' ? '%' : ''} ${f.label}`)
      .slice(0, 3);
    return bits.length ? bits.join(' · ') : 'no stats yet';
  }

  function tierColorVar(tier) {
    return { gold: 'var(--tier-gold)', silver: 'var(--tier-silver)', bronze: 'var(--tier-bronze)' }[tier];
  }

  function rename(e) {
    rosterStore.renamePreset(preset.id, e.target.value);
  }

  function toggleRelic(defId) {
    const equipped = preset.relicIds.includes(defId);
    const ok = rosterStore.toggleRelicOnPreset(preset.id, defId, !equipped);
    relicError = !ok && !equipped ? '4 slots full — remove one first.' : '';
  }

  function deletePreset() {
    rosterStore.deletePreset(preset.id);
    onDeleted?.();
  }
</script>

<div class="editor">
  <div class="editor-header">
    <span class="rule"></span>
    <h2>EDITING — {preset.name.toUpperCase()}</h2>
    <span class="rule"></span>
    <ConfirmButton
      class="delete-btn"
      label="Delete preset"
      confirmLabel="Confirm delete"
      prompt="Delete this preset?"
      disabled={character.presets.length <= 1}
      onConfirm={deletePreset}
    />
  </div>

  <div class="editor-grid">
    <div class="field-group">
      <span class="field-group-label">Name</span>
      <input type="text" value={preset.name} onblur={rename} onkeydown={(e) => e.key === 'Enter' && e.target.blur()} />
    </div>

    <div class="field-group">
      <span class="field-group-label">Gear Loadout</span>
      <div class="chip-list">
        {#each character.loadouts as loadout, i (i)}
          <Chip
            label={`${loadout.name} · ${filledSlotCount(i)}/${SLOTS.length}`}
            selected={preset.loadout === i}
            onClick={() => rosterStore.setPresetLoadout(preset.id, i)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label">Talent Set</span>
      <div class="chip-list">
        {#each character.talentSets as _, i (i)}
          <Chip
            label={`${talentSetLabel(i)} · ${pointsSpent(i)}/${TALENT_TOTAL_POINTS} pts`}
            selected={preset.talentSet === i}
            onClick={() => rosterStore.setPresetTalentSet(preset.id, i)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label">Totals</span>
      <div class="chip-list">
        <Chip label="Manual" selected={preset.manualTotals} onClick={() => rosterStore.setPresetTotalsMode(preset.id, 'manual')} />
        <Chip
          label="Calculated"
          selected={!preset.manualTotals}
          onClick={() => rosterStore.setPresetTotalsMode(preset.id, 'calculated')}
        />
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label">Pet</span>
      <div class="chip-list">
        <Chip label="None" selected={!preset.petId} onClick={() => rosterStore.setPresetPet(preset.id, null)} />
        {#each character.pets as pet (pet.id)}
          <Chip
            label={`${pet.name} (${pet.rarity}) — ${petSummary(pet)}`}
            selected={preset.petId === pet.id}
            onClick={() => rosterStore.setPresetPet(preset.id, pet.id)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label">Relics — {preset.relicIds.length}/4 slots</span>
      <div class="chip-list">
        {#each relicDefs as def (def.id)}
          <Chip
            label={`${def.name} LV${character.relicLevels[def.id] || 1}`}
            selected={preset.relicIds.includes(def.id)}
            color={preset.relicIds.includes(def.id) ? tierColorVar(def.tier) : null}
            onClick={() => toggleRelic(def.id)}
          />
        {/each}
      </div>
      {#if relicError}
        <p class="inline-error" role="alert">{relicError}</p>
      {/if}
    </div>
  </div>

  <div class="totals-divider"></div>
  <div class="totals-section">
    <div class="totals-header">
      <span class="totals-mode">EFFECTIVE TOTALS — {preset.manualTotals ? 'MANUAL (editable)' : 'CALCULATED (read-only)'}</span>
      <span class="dps-readout">DPS <strong>{dps.toFixed(1)}</strong></span>
      <span class="hps-readout">HPS <strong>{hps.toFixed(1)}</strong></span>
    </div>
    <StatsFields
      values={totals}
      fields={profileFields}
      readOnly={!preset.manualTotals}
      onChange={(key, value) => rosterStore.setPresetManualStat(preset.id, key, value)}
    />
  </div>
</div>

<style>
  .editor {
    margin-top: var(--space-6);
    border: 1px solid var(--color-gold);
    box-shadow: var(--color-gold-glow);
    border-radius: var(--radius-panel);
    padding: 16px 18px;
  }
  .editor-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .editor-header h2 {
    font-size: 13px;
    color: var(--color-gold-light);
    white-space: nowrap;
    margin: 0;
  }
  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-gold), transparent);
  }
  .editor-grid {
    display: grid;
    grid-template-columns: 220px 1fr 1fr;
    gap: 16px 22px;
  }
  @media (max-width: 900px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-group-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-dim);
  }
  .field-group input[type='text'] {
    font-family: var(--font-data);
  }
  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .inline-error {
    color: var(--color-downgrade);
    font-size: 11px;
    margin: 0;
  }
  .totals-divider {
    height: 1px;
    background: var(--color-border-hairline);
    margin: var(--space-4) 0;
  }
  .totals-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .totals-mode {
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-dim);
    flex: 1;
  }
  .dps-readout,
  .hps-readout {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
  }
  .dps-readout strong {
    color: var(--color-dps);
  }
  .hps-readout strong {
    color: var(--color-hps);
  }
</style>
