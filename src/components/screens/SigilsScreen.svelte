<script>
  /**
   * SigilsScreen.svelte - sigil collection and per-preset equips (rebuild-plan §7.3 B5).
   *
   * Character-wide: the Altar tier and which sigils are owned at what level (sigils.owned).
   * Per-preset: the 3 generic slots, the utility slot, the Ancient and the activation conditions
   * (SigilEquipPanel). Every number on a card is derived from the level through engine/sources/
   * sigilScale; the screen stores nothing but levels, the tier and the picks.
   * Adapted from the v1 components/SigilsScreen.svelte.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel, sigilUnlockLevel } from '../../lib/game/classes.js';
  import { isSigilSpeciesActiveForSpec } from '../../lib/game/sigils.js';
  import { ownableSigils, MAX_ALTAR_TIER, EVOLVE_TIER_CAP } from '../../lib/model/sigils.js';
  import Chip from '../Chip.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SigilCard from '../sigils/SigilCard.svelte';
  import SigilEquipPanel from '../sigils/SigilEquipPanel.svelte';

  // Screens receive {setStatus, onNavigate}; this one needs neither.
  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {} } = $props();

  const character = $derived(rosterStore.current);
  const tier = $derived(character.sigils.altarTier);
  const owned = $derived(character.sigils.owned);

  let selectedId = $state(null);
  const preset = $derived(character.presets.find((p) => p.id === selectedId) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const spec = $derived(character.talentSets?.[preset.talentSet]?.spec ?? null);

  const SECTION_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Ancient'];
  const sections = $derived(
    character.class
      ? SECTION_ORDER.map((rarity) => ({
          rarity,
          defs: ownableSigils(character.class).filter((s) => s.rarity === rarity),
        })).filter((s) => s.defs.length > 0)
      : [],
  );

  const usedBy = (species) =>
    character.presets
      .filter((p) => p.sigilSpecies.includes(species) || p.utilitySigilSpecies === species || p.ancientSigilSpecies === species)
      .map((p) => p.name);

  function noteFor(def) {
    if (def.rarity === 'Ancient') return 'Unlocked from the Transcendence board; unique, stays level 1.';
    if (!isSigilSpeciesActiveForSpec(def.species, character.class, spec)) {
      return spec === 'MYSTIC_DRUID' ? 'Not usable as a Druid.' : 'Druid only.';
    }
    if (def.rarity === 'Legendary' && tier < 2) return 'Forges from Altar Tier 2.';
    return '';
  }

  function setLevel(species, value) {
    rosterStore.setSigilLevel(species, value);
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before managing sigils.</p>
{:else}
  <div class="header-row">
    <h2>Sigils</h2>
    <p class="hint">
      {classLabel(character.class)} · unlock at level {sigilUnlockLevel(character.class)} · levels set each sigil's stats; each preset equips its own
    </p>
  </div>

  <div class="altar-row">
    <div class="stepper-group">
      <span class="micro-label">SIGIL ALTAR TIER</span>
      <div class="rank-controls">
        <button type="button" disabled={tier <= 1} aria-label="Lower altar tier" onclick={() => rosterStore.setSigilAltarTier(tier - 1)}>−</button>
        <span class="rank-value" data-testid="altar-tier">{tier}</span>
        <button type="button" disabled={tier >= MAX_ALTAR_TIER} aria-label="Raise altar tier" onclick={() => rosterStore.setSigilAltarTier(tier + 1)}>+</button>
      </div>
    </div>
    {#if tier < EVOLVE_TIER_CAP}
      <ConfirmButton
        class="btn-danger"
        label="Evolve Altar"
        confirmLabel="Evolve"
        prompt="Destroys every owned sigil except Ancients."
        onConfirm={() => rosterStore.evolveSigilAltar()}
      />
    {/if}
    <p class="hint">The tier multiplies every sigil's flat Attack and Health by 3 per tier above 1. Spell numbers do not depend on it.</p>
  </div>

  <h3 class="subheading">Equipped</h3>
  <div class="preset-chips" role="group" aria-label="Preset">
    {#each character.presets as p (p.id)}
      <Chip label={p.name} selected={p.id === preset.id} onClick={() => (selectedId = p.id)} />
    {/each}
  </div>
  <SigilEquipPanel {character} {preset} />

  <h3 class="subheading collection-head">Collection</h3>
  {#each sections as section (section.rarity)}
    <section class="rarity-section">
      <h3 class="subheading">{section.rarity}</h3>
      <div class="sigil-grid">
        {#each section.defs as def (def.species)}
          <SigilCard
            {def}
            level={owned[def.species]?.level ?? 0}
            {tier}
            {spec}
            usedBy={usedBy(def.species)}
            note={noteFor(def)}
            onLevel={setLevel}
          />
        {/each}
      </div>
    </section>
  {/each}
{/if}

<style>
  .header-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
  h2 {
    font-family: var(--font-heading);
    margin: 0;
  }
  .hint {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .empty-hint {
    color: var(--color-muted);
  }
  .altar-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-5);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }
  .stepper-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .rank-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rank-value {
    min-width: 26px;
    text-align: center;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .collection-head {
    margin-top: var(--space-5);
  }
  .rarity-section {
    margin-bottom: var(--space-6);
  }
  .rarity-section .subheading {
    margin: 0 0 var(--space-2);
  }
  .sigil-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
  }
  @media (max-width: 700px) {
    .sigil-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
