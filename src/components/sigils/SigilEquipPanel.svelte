<script>
  /**
   * SigilEquipPanel.svelte - one preset's sigil loadout: up to 3 generic slots (unlocked by character
   * level), the class's utility slot (Summon / Shield / Form by spec; none for Warrior and Sentinel),
   * one Ancient, and per-sigil activation conditions (character level 54+).
   * The store (setPresetSigils / setPresetSigilCondition) writes the picks and model/sigils.js
   * reconcile enforces legality, so this panel only offers legal choices.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { sigilBySpecies, utilitySlotSpellType } from '../../lib/game/sigils.js';
  import { formatFlat } from '../../lib/format.js';
  import {
    maxSigilSlots,
    slotUnlockLevel,
    genericSigils,
    utilitySigils,
    ancientSigils,
    sigilConditionOptions,
    SIGIL_CONDITIONS_LEVEL,
  } from '../../lib/model/sigils.js';
  import { getSigilBonusAttack, getSigilBonusHp } from '../../lib/engine/sources/sigilScale.js';
  import { conditionLabel } from './sigilView.js';

  let { character, preset } = $props();

  const cls = $derived(character.class);
  const spec = $derived(character.talentSets?.[preset.talentSet]?.spec ?? null);
  const owned = $derived(character.sigils.owned);
  const tier = $derived(character.sigils.altarTier);
  const slots = $derived(maxSigilSlots(character.level, cls));
  const utilityType = $derived(utilitySlotSpellType(cls, spec));
  const conditionsOpen = $derived(character.level >= SIGIL_CONDITIONS_LEVEL);

  const ownedOf = (list) => list.filter((s) => owned[s.species]);
  const genericOptions = $derived(ownedOf(genericSigils(cls, spec)));
  const utilityOptions = $derived(ownedOf(utilitySigils(cls, spec)));
  const ancientOptions = $derived(ownedOf(ancientSigils(cls)));

  const picks = $derived(preset.sigilSpecies);
  const equipped = $derived([...picks, preset.utilitySigilSpecies, preset.ancientSigilSpecies].filter(Boolean));

  const totals = $derived(
    equipped.reduce(
      (t, sp) => {
        const def = sigilBySpecies(sp);
        const level = owned[sp]?.level ?? 1;
        t.attack += getSigilBonusAttack(def, level, tier);
        t.hp += getSigilBonusHp(def, level, tier);
        return t;
      },
      { attack: 0, hp: 0 },
    ),
  );

  const label = (s) => `${s.name} (${s.rarity}, L${owned[s.species]?.level ?? 1})`;

  function setGeneric(index, species) {
    const next = [...picks];
    if (species) {
      if (index < next.length) next[index] = species;
      else next.push(species);
    } else {
      next.splice(index, 1);
    }
    rosterStore.setPresetSigils(preset.id, { species: next });
  }

  const typeName = $derived(utilityType ? utilityType.charAt(0) + utilityType.slice(1).toLowerCase() : '');
</script>

<section class="equip-panel" aria-label="Sigils equipped in {preset.name}">
  <div class="slots">
    {#each [0, 1, 2] as i (i)}
      {@const unlocked = i < slots}
      {@const current = picks[i] ?? ''}
      <label class="slot" class:locked={!unlocked}>
        <span class="micro-label">Sigil {i + 1}</span>
        {#if unlocked}
          <select value={current} aria-label="Sigil slot {i + 1}" onchange={(e) => setGeneric(i, e.currentTarget.value)}>
            <option value="">Empty</option>
            {#each genericOptions as s (s.species)}
              <option value={s.species} disabled={picks.includes(s.species) && current !== s.species}>{label(s)}</option>
            {/each}
          </select>
        {:else}
          <span class="lock-note">Unlocks at level {slotUnlockLevel(i + 1, cls)}</span>
        {/if}
      </label>
    {/each}

    {#if utilityType}
      <label class="slot" class:locked={slots === 0}>
        <span class="micro-label">{typeName} slot</span>
        {#if slots > 0}
          <select
            value={preset.utilitySigilSpecies ?? ''}
            aria-label="Utility sigil slot"
            onchange={(e) => rosterStore.setPresetSigils(preset.id, { utility: e.currentTarget.value || null })}
          >
            <option value="">Empty</option>
            {#each utilityOptions as s (s.species)}
              <option value={s.species}>{label(s)}</option>
            {/each}
          </select>
        {:else}
          <span class="lock-note">Unlocks at level {slotUnlockLevel(1, cls)}</span>
        {/if}
      </label>
    {/if}

    <label class="slot" class:locked={slots === 0}>
      <span class="micro-label">Ancient</span>
      {#if slots > 0}
        <select
          value={preset.ancientSigilSpecies ?? ''}
          aria-label="Ancient sigil slot"
          onchange={(e) => rosterStore.setPresetSigils(preset.id, { ancient: e.currentTarget.value || null })}
        >
          <option value="">Empty</option>
          {#each ancientOptions as s (s.species)}
            <option value={s.species}>{s.name}</option>
          {/each}
        </select>
        {#if ancientOptions.length === 0}<span class="hint">Unlock an Ancient below first</span>{/if}
      {:else}
        <span class="lock-note">Unlocks at level {slotUnlockLevel(1, cls)}</span>
      {/if}
    </label>
  </div>

  <p class="totals">
    Flat from equipped sigils (Altar tier {tier}):
    Attack <span class="stat-num" data-testid="equip-atk">{formatFlat(totals.attack)}</span>
    <span class="sep">|</span>
    Health <span class="stat-num" data-testid="equip-hp">{formatFlat(totals.hp)}</span>
  </p>

  <div class="conditions">
    <h4 class="micro-label">Activation conditions</h4>
    {#if !conditionsOpen}
      <p class="hint">Unlock at character level {SIGIL_CONDITIONS_LEVEL}. Until then every sigil casts on cooldown.</p>
    {:else if equipped.length === 0}
      <p class="hint">Equip a sigil to set when it fires.</p>
    {:else}
      {#each equipped as sp (sp)}
        {@const options = sigilConditionOptions(sp, spec)}
        {#if options.length > 1}
          <label class="cond-row">
            <span>{sigilBySpecies(sp).name}</span>
            <select
              value={rosterStore.current.sigils.owned[sp]?.condition ?? 'ON_COOLDOWN'}
              aria-label="{sigilBySpecies(sp).name} activation condition"
              onchange={(e) => rosterStore.setPresetSigilCondition(preset.id, sp, e.currentTarget.value === 'ON_COOLDOWN' ? null : e.currentTarget.value)}
            >
              {#each options as id (id)}
                <option value={id}>{conditionLabel(id)}</option>
              {/each}
            </select>
          </label>
        {/if}
      {/each}
      <p class="hint">Damage and debuff conditions apply only in PvP; in PvE they always fire on cooldown. Buff and heal conditions apply everywhere.</p>
    {/if}
  </div>
</section>

<style>
  .equip-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: var(--space-3);
  }
  .slot {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .slot select {
    width: 100%;
  }
  .slot.locked {
    opacity: 0.6;
  }
  .lock-note,
  .hint {
    font-size: 11.5px;
    color: var(--color-muted);
    margin: 0;
  }
  .totals {
    margin: 0;
    font-size: 12px;
    color: var(--color-soft);
  }
  .stat-num {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .sep {
    color: var(--color-dim);
    margin: 0 4px;
  }
  .conditions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .conditions h4 {
    margin: 0;
  }
  .cond-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 12px;
  }
</style>
