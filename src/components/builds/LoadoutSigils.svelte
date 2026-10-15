<script>
  /**
   * LoadoutSigils.svelte - B2 sigil tray (ia.md §5.7, §5.11): generic slots by unlock level, the utility
   * slot (Summon / Shield / Form by spec, none for Warrior and Sentinel) and the Ancient slot. Activation
   * conditions are CHARACTER-wide (sigils.md §7): changing one reaches every preset that equips the
   * sigil, and the ScopeChip names those presets.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { sigilBySpecies, utilitySlotSpellType } from '../../lib/game/sigils.js';
  import { formatFlat } from '../../lib/format.js';
  import {
    slotUnlockLevel,
    genericSigils,
    utilitySigils,
    ancientSigils,
    sigilConditionOptions,
    SIGIL_CONDITIONS_LEVEL,
  } from '../../lib/model/sigils.js';
  import { sigilSlotCap, ancientActive, effectiveTranscendencePreset } from '../../lib/model/legality.js';
  import { getSigilBonusAttack, getSigilBonusHp } from '../../lib/engine/sources/sigilScale.js';
  import { presetSpec } from '../../lib/build/presetInputs.js';
  import Panel from '../ui/Panel.svelte';
  import ScopeChip from '../ui/ScopeChip.svelte';
  import Select from '../ui/Select.svelte';
  import { conditionLabel } from '../sigils/sigilView.js';

  let { character, preset } = $props();

  const cls = $derived(character.class);
  const spec = $derived(presetSpec(character, preset));
  const owned = $derived(character.sigils.owned);
  const tier = $derived(character.sigils.altarTier);
  const slots = $derived(sigilSlotCap(character.level, cls));
  const utilityType = $derived(utilitySlotSpellType(cls, spec));
  const conditionsOpen = $derived(character.level >= SIGIL_CONDITIONS_LEVEL);

  const ownedOf = (list) => list.filter((s) => owned[s.species]);
  const genericOptions = $derived(ownedOf(genericSigils(cls, spec)));
  const utilityOptions = $derived(ownedOf(utilitySigils(cls, spec)));
  const ancientOptions = $derived(ownedOf(ancientSigils(cls)));
  const picks = $derived(preset.sigilSpecies);
  const equipped = $derived([...picks, preset.utilitySigilSpecies, preset.ancientSigilSpecies].filter(Boolean));
  const ancientOn = $derived(
    !preset.ancientSigilSpecies || ancientActive(preset.ancientSigilSpecies, effectiveTranscendencePreset(character, preset)),
  );

  const totals = $derived(
    equipped.reduce(
      (t, sp) => {
        if (sp === preset.ancientSigilSpecies && !ancientOn) return t;
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
  const typeName = $derived(utilityType ? utilityType.charAt(0) + utilityType.slice(1).toLowerCase() : '');
  const alsoEquippedIn = (sp) =>
    character.presets
      .filter((p) => p.id !== preset.id && [...p.sigilSpecies, p.utilitySigilSpecies, p.ancientSigilSpecies].includes(sp))
      .map((p) => p.name);

  function setGeneric(index, species) {
    const next = [...picks];
    if (species) {
      if (index < next.length) next[index] = species;
      else next.push(species);
    } else next.splice(index, 1);
    rosterStore.setPresetSigils(preset.id, { species: next });
  }
</script>

<Panel title="Sigils" scope="preset">
  {#snippet meta()}<span class="note">Altar tier <span class="num">{tier}</span> (character-wide)</span>{/snippet}
  <div class="sigil-slots">
    {#each [0, 1, 2] as i (i)}
      {#if i < slots}
        {@const current = picks[i] ?? ''}
        <Select
          label="Sigil {i + 1}"
          value={current}
          options={[{ value: '', label: 'Empty' }, ...genericOptions.map((s) => ({ value: s.species, label: label(s), disabled: picks.includes(s.species) && current !== s.species }))]}
          onchange={(v) => setGeneric(i, v)}
        />
      {:else}
        <div class="slot locked">
          <span class="lbl">Sigil {i + 1}</span>
          <span class="lock">Unlocks at level {slotUnlockLevel(i + 1, cls)}</span>
        </div>
      {/if}
    {/each}

    {#if utilityType}
      {#if slots > 0}
        <Select
          label="{typeName} slot"
          value={preset.utilitySigilSpecies ?? ''}
          options={[{ value: '', label: 'Empty' }, ...utilityOptions.map((s) => ({ value: s.species, label: label(s) }))]}
          onchange={(v) => rosterStore.setPresetSigils(preset.id, { utility: v || null })}
        />
      {:else}
        <div class="slot locked">
          <span class="lbl">{typeName} slot</span>
          <span class="lock">Unlocks at level {slotUnlockLevel(1, cls)}</span>
        </div>
      {/if}
    {/if}

    {#if slots > 0}
      <div class="slot">
        <Select
          label="Ancient"
          value={preset.ancientSigilSpecies ?? ''}
          options={[{ value: '', label: 'Empty' }, ...ancientOptions.map((s) => ({ value: s.species, label: s.name }))]}
          onchange={(v) => rosterStore.setPresetSigils(preset.id, { ancient: v || null })}
        />
        {#if ancientOptions.length === 0}<span class="hint">Unlock an Ancient in <a href="#/character/sigils">Sigils</a> first</span>{/if}
      </div>
    {:else}
      <div class="slot locked">
        <span class="lbl">Ancient</span>
        <span class="lock">Unlocks at level {slotUnlockLevel(1, cls)}</span>
      </div>
    {/if}
  </div>

  <p class="totals">
    Flat from equipped sigils: Attack <span class="num" data-testid="equip-atk">{formatFlat(totals.attack)}</span>
    · Health <span class="num" data-testid="equip-hp">{formatFlat(totals.hp)}</span>
  </p>

  <section class="conditions" aria-label="Activation conditions">
    <h3>Activation conditions</h3>
    {#if !conditionsOpen}
      <p class="hint">Unlock at character level {SIGIL_CONDITIONS_LEVEL}. Until then every sigil casts on cooldown.</p>
    {:else if equipped.length === 0}
      <p class="hint">Equip a sigil to set when it fires.</p>
    {:else}
      {#each equipped as sp (sp)}
        {@const options = sigilConditionOptions(sp, spec)}
        {#if options.length > 1}
          <div class="cond-row">
            <Select
              label="{sigilBySpecies(sp).name} activation condition"
              value={owned[sp]?.condition ?? 'ON_COOLDOWN'}
              options={options.map((id) => ({ value: id, label: conditionLabel(id) }))}
              onchange={(v) => rosterStore.setSigilCondition(sp, v === 'ON_COOLDOWN' ? null : v)}
            />
            <ScopeChip scope="character" target={sigilBySpecies(sp).name} sideEffects={alsoEquippedIn(sp)} />
          </div>
        {/if}
      {/each}
      <p class="hint">Damage and debuff conditions apply only in PvP; in PvE they always fire on cooldown. Buff and heal conditions apply everywhere.</p>
    {/if}
  </section>
</Panel>

<style>
  .sigil-slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-3); }
  .slot { display: grid; gap: var(--sp-1); }
  .lbl { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .lock, .hint, .note { font-size: var(--fs-12); color: var(--text-muted); }
  .slot.locked { opacity: 0.8; }
  .totals { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .conditions { display: grid; gap: var(--sp-2); border-top: 1px solid var(--line-hairline); padding-top: var(--sp-3); }
  h3 { margin: 0; font-size: var(--fs-13); font-weight: var(--fw-bold); color: var(--text-soft); }
  .cond-row { display: flex; gap: var(--sp-3); align-items: flex-end; flex-wrap: wrap; }
  .cond-row :global(.field) { min-width: min(20rem, 100%); }
</style>
