<script>
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS, TALENT_TOTAL_POINTS, STAT_FIELDS, fieldsForTab } from '../lib/constants.js';
  import { RELICS_BY_CLASS } from '../lib/relicsData.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import { summarizeStats } from '../lib/format.js';
  import { petStats } from '../lib/petsData.js';
  import { computeDps } from '../lib/dps.js';
  import { resolveEffectiveTotals, computePresetRawTotals } from '../lib/totals.js';
  import { talentSetLabel } from '../lib/model.js';
  import { formatFlat } from '../lib/format.js';
  import Chip from './Chip.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import StatsFields from './StatsFields.svelte';
  import GoalSliders from './GoalSliders.svelte';
  import Slider from './Slider.svelte';

  let { preset, character, setStatus, onDeleted } = $props();

  const relicDefs = $derived(RELICS_BY_CLASS[character.class] || []);
  const sigilDefs = $derived(SIGILS_BY_CLASS[character.class] || []);
  const totals = $derived(resolveEffectiveTotals(character, preset));
  // Raw pre-curve totals drive the "SOFT · raw" line on overcapped stats -
  // Calculated only; Manual entries are already the game's effective values.
  const rawTotals = $derived(preset.manualTotals ? null : computePresetRawTotals(character, preset));
  const dps = $derived(computeDps(totals));
  const profileFields = $derived(fieldsForTab('profile', character.class));

  // Goal kinds selectable for this class ('tank' is Warrior-only). Clicking
  // the selected kind unassigns (kind null = the prompted "assign a goal"
  // state - nothing is silently chosen).
  const goalKinds = $derived([
    { kind: 'dps', label: 'DPS' },
    ...(character.class === 'Warrior' ? [{ kind: 'tank', label: 'Tank' }] : []),
    { kind: 'pvp', label: 'PVP' },
    { kind: 'custom', label: 'Custom' },
  ]);

  function setGoalKind(kind) {
    rosterStore.setPresetGoal(preset.id, { kind: preset.goal.kind === kind ? null : kind });
  }

  let relicError = $state('');
  let sigilError = $state('');

  function filledSlotCount(loadoutIndex) {
    const gear = character.loadouts[loadoutIndex].gear;
    return SLOTS.filter((s) => Object.values(gear[s]).some((v) => v !== 0)).length;
  }

  function pointsSpent(talentSetIndex) {
    return Object.values(character.talentSets[talentSetIndex].allocation || {}).reduce((a, b) => a + b, 0);
  }

  function petSummary(pet) {
    return summarizeStats(petStats(pet, character.petAltar), STAT_FIELDS);
  }

  function mountSummary(m) {
    return `+${m.hpPct}% HP / +${m.atkPct}% ATK`;
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

  function toggleSigil(sigilId) {
    const equipped = preset.sigilIds.includes(sigilId);
    const ok = rosterStore.toggleSigilOnPreset(preset.id, sigilId, !equipped);
    sigilError = !ok && !equipped ? '3 slots full — remove one first.' : '';
  }

  function deletePreset() {
    rosterStore.deletePreset(preset.id);
    onDeleted?.();
  }
</script>

<div class="editor">
  <div class="editor-header">
    <span class="rule-left"></span>
    <h2>EDITING — {preset.name.toUpperCase()}</h2>
    <span class="rule-right"></span>
    <ConfirmButton
      class="delete-btn"
      label="Delete preset"
      confirmLabel="Confirm delete"
      prompt="Delete this preset?"
      disabled={character.presets.length <= 2}
      onConfirm={deletePreset}
    />
  </div>

  <div class="editor-grid">
    <div class="field-group">
      <span class="field-group-label micro-label">Name</span>
      <input type="text" value={preset.name} onblur={rename} onkeydown={(e) => e.key === 'Enter' && e.target.blur()} />

      <span class="field-group-label micro-label goal-label">Goal{preset.goal.kind === null ? ' — unassigned' : ''}</span>
      <div class="chip-list">
        {#each goalKinds as g (g.kind)}
          <Chip label={g.label} selected={preset.goal.kind === g.kind} onClick={() => setGoalKind(g.kind)} size="compact" />
        {/each}
      </div>
      {#if preset.goal.kind === null}
        <p class="goal-hint">Assign a goal so the optimizer knows what this preset is for.</p>
      {/if}
      {#if preset.goal.kind === 'custom'}
        <input
          type="text"
          placeholder="Custom goal name"
          value={preset.goal.name}
          onblur={(e) => rosterStore.setPresetGoal(preset.id, { name: e.target.value })}
          onkeydown={(e) => e.key === 'Enter' && e.target.blur()}
        />
      {/if}
      {#if preset.goal.kind === 'tank'}
        <label class="goal-slider-row">
          <span class="micro-label">Sustain ↔ EHP</span>
          <Slider
            min={0}
            max={100}
            step={5}
            value={Math.round(preset.goal.ehpWeight * 100)}
            oninput={(v) => rosterStore.setPresetGoal(preset.id, { ehpWeight: v / 100 })}
            ariaLabel="EHP weight"
          />
          <span class="goal-slider-value">{Math.round(preset.goal.ehpWeight * 100)}%</span>
        </label>
      {/if}
      {#if preset.goal.kind === 'pvp' || preset.goal.kind === 'custom'}
        <GoalSliders weights={preset.goal.weights} onChange={(w) => rosterStore.setPresetGoal(preset.id, { weights: w })} />
      {/if}
      <label class="fortress-check goal-linked">
        <input
          type="checkbox"
          checked={preset.goal.linked}
          onchange={(e) => rosterStore.setPresetLinked(preset.id, e.target.checked)}
        />
        LINKED
      </label>
    </div>

    <div class="field-group">
      <span class="field-group-label micro-label"><span class="diamond" style="color: var(--nav-gear)">◆</span> Gear Loadout</span>
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
      <span class="field-group-label micro-label"><span class="diamond" style="color: var(--nav-talents)">◆</span> Talent Set</span>
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
      <span class="field-group-label micro-label">Totals</span>
      <div class="chip-list">
        <Chip label="Manual" selected={preset.manualTotals} onClick={() => rosterStore.setPresetTotalsMode(preset.id, 'manual')} />
        <Chip
          label="Calculated"
          selected={!preset.manualTotals}
          onClick={() => rosterStore.setPresetTotalsMode(preset.id, 'calculated')}
        />
      </div>
      <span class="field-group-label micro-label fortress-label">Fortress Buffs</span>
      <div class="fortress-buffs">
        <label class="fortress-check">
          <input
            type="checkbox"
            checked={preset.fortressBuffs.top}
            onchange={(e) => rosterStore.setPresetFortressBuff(preset.id, 'top', e.target.checked)}
          />
          TOP
        </label>
        <label class="fortress-check">
          <input
            type="checkbox"
            checked={preset.fortressBuffs.bottom}
            onchange={(e) => rosterStore.setPresetFortressBuff(preset.id, 'bottom', e.target.checked)}
          />
          BOTTOM
        </label>
        <label class="fortress-check">
          <input
            type="checkbox"
            checked={preset.fortressBuffs.core}
            onchange={(e) => rosterStore.setPresetFortressBuff(preset.id, 'core', e.target.checked)}
          />
          CORE
        </label>
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label micro-label"><span class="diamond" style="color: var(--nav-pets)">◆</span> Pet</span>
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
      <span class="field-group-label micro-label"><span class="diamond" style="color: var(--nav-mounts)">◆</span> Mount</span>
      <div class="chip-list">
        <Chip label="None" selected={!preset.mountId} onClick={() => rosterStore.setPresetMount(preset.id, null)} />
        {#each character.mounts.entries.filter((m) => m.star > 0 || m.id === preset.mountId) as mount (mount.id)}
          <Chip
            label={`${mount.name} (${mount.rarity}) — ${mountSummary(mount)}`}
            selected={preset.mountId === mount.id}
            onClick={() => rosterStore.setPresetMount(preset.id, mount.id)}
          />
        {/each}
      </div>
    </div>

    <div class="field-group">
      <span class="field-group-label micro-label"
        ><span class="diamond" style="color: var(--nav-relics)">◆</span> Relics — {preset.relicIds.length}/4 slots</span
      >
      <div class="chip-list">
        {#each relicDefs as def (def.id)}
          <Chip
            label={`${def.name} LV${character.relicLevels[def.id] || 0}`}
            selected={preset.relicIds.includes(def.id)}
            color={preset.relicIds.includes(def.id) ? tierColorVar(def.tier) : null}
            onClick={() => toggleRelic(def.id)}
            size="compact"
          />
        {/each}
      </div>
      {#if relicError}
        <p class="inline-error" role="alert">{relicError}</p>
      {/if}
    </div>

    <div class="field-group">
      <span class="field-group-label micro-label"
        ><span class="diamond" style="color: var(--nav-sigils)">◆</span> Sigils — {preset.sigilIds.length}/3 slots</span
      >
      <div class="chip-list">
        {#each sigilDefs as def (def.id)}
          <Chip
            label={`${def.name} (${def.rarity})`}
            selected={preset.sigilIds.includes(def.id)}
            onClick={() => toggleSigil(def.id)}
            size="compact"
          />
        {/each}
      </div>
      {#if sigilError}
        <p class="inline-error" role="alert">{sigilError}</p>
      {/if}
    </div>
  </div>

  <div class="totals-divider"></div>
  <div class="totals-section">
    <div class="totals-header">
      <span class="totals-mode micro-label">EFFECTIVE TOTALS — {preset.manualTotals ? 'MANUAL (editable)' : 'CALCULATED (read-only)'}</span>
      <span class="dps-readout"><span class="value">{formatFlat(Math.round(dps))}</span><span class="unit">DPS</span></span>
    </div>
    <StatsFields
      values={totals}
      rawValues={rawTotals}
      fields={profileFields}
      readOnly={!preset.manualTotals}
      onChange={(key, value) => rosterStore.setPresetManualStat(preset.id, key, value)}
    />
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
  .editor-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .editor-header h2 {
    font-size: 12.5px;
    letter-spacing: 0.14em;
    color: var(--color-gold-light);
    white-space: nowrap;
    margin: 0;
  }
  .rule-left {
    width: 26px;
    height: 1px;
    background: var(--color-gold);
    flex-shrink: 0;
  }
  .rule-right {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--color-gold), transparent);
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
    margin-bottom: 7px;
  }
  .field-group-label .diamond {
    font-size: 9px;
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
  .fortress-label {
    margin-top: 10px;
  }
  .goal-label {
    margin-top: 10px;
  }
  .goal-hint {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0;
  }
  .goal-slider-row {
    display: grid;
    grid-template-columns: auto 1fr 40px;
    align-items: center;
    gap: 8px;
  }
  /* Slider styling lives in app.css's .slider block. */
  .goal-slider-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--color-soft);
    text-align: right;
  }
  .goal-linked {
    padding: 4px 0 0;
  }
  .fortress-buffs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .fortress-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-muted);
  }
  .fortress-check input {
    width: 16px;
    height: 16px;
    accent-color: var(--color-gold);
  }
  .totals-divider {
    border-top: 1px solid var(--color-border);
    margin-top: 14px;
    padding-top: 14px;
  }
  .totals-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .totals-mode {
    flex: 1;
  }
  .dps-readout {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
  }
  .dps-readout .value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-dps);
  }
  .dps-readout .unit {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  @media (min-width: 900px) {
    .totals-section :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
</style>
