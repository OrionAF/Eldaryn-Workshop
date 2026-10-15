<script>
  /**
   * CharacterSigilsPage.svelte - C5: the sigil collection (levels, per-card "Equip in") and the
   * Sigil Altar (ia.md §5.11). Character-wide: the Altar tier and which sigils are owned at what
   * level (sigils.owned). Which sigils a preset equips is per-preset: the slots and activation
   * conditions are the Builds loadout page's (B2); this page only lists what each preset equips.
   * Every number on a card is derived from the level through engine/sources/sigilScale; the page
   * stores nothing but levels, the tier and the picks.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel, sigilUnlockLevel } from '../../lib/game/classes.js';
  import { sigilBySpecies, isSigilSpeciesActiveForSpec } from '../../lib/game/sigils.js';
  import { ownableSigils, MAX_ALTAR_TIER, EVOLVE_TIER_CAP } from '../../lib/model/sigils.js';
  import { equipItems, equipPatch } from '../sigils/sigilView.js';
  import Modal from '../Modal.svelte';
  import Panel from '../ui/Panel.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import SigilCard from '../sigils/SigilCard.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const tier = $derived(character.sigils.altarTier);
  const owned = $derived(character.sigils.owned);

  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
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

  const equippedIn = (p, species) => p.sigilSpecies.includes(species) || p.utilitySigilSpecies === species || p.ancientSigilSpecies === species;
  const usedBy = (species) => character.presets.filter((p) => equippedIn(p, species)).map((p) => p.name);

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
  function equipIn(species, presetId) {
    const target = character.presets.find((p) => p.id === presetId);
    const patch = target && equipPatch(character, target, species);
    if (patch) rosterStore.setPresetSigils(presetId, patch);
  }

  // --- Evolve: destructive, so it lists what it takes before it runs ---
  let evolveOpen = $state(false);
  const destroyed = $derived(Object.keys(owned).filter((sp) => sigilBySpecies(sp)?.rarity !== 'Ancient'));
  const losingPresets = $derived(
    character.presets
      .map((p) => ({ name: p.name, lost: destroyed.filter((sp) => equippedIn(p, sp)) }))
      .filter((x) => x.lost.length > 0),
  );
  const nameOf = (sp) => sigilBySpecies(sp)?.name ?? sp;
  function evolve() {
    evolveOpen = false;
    rosterStore.evolveSigilAltar();
  }
</script>

{#if !character.class}
  <EmptyState title="Choose a class first" text="Each class has its own sigils.">
    {#snippet action()}<Button onclick={() => onNavigate('character/overview')}>Pick a class on Overview</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="sigils">
    <p class="hint">
      {classLabel(character.class)} · sigils unlock at level {sigilUnlockLevel(character.class)} · levels set each sigil's stats; each preset equips its own
    </p>

    <Panel title="Sigil Altar">
      <div class="altar-row">
        <div class="stepper-group">
          <span class="label" id="altar-label">Altar tier</span>
          <Stepper label="altar tier" value={tier} min={1} max={MAX_ALTAR_TIER} onchange={(n) => rosterStore.setSigilAltarTier(n)} />
          <span class="num" data-testid="altar-tier">{tier}</span>
        </div>
        <p class="hint">The tier multiplies every sigil's flat Attack and Health by 3 per tier above 1. Spell numbers do not depend on it.</p>
      </div>
      {#if tier > EVOLVE_TIER_CAP}
        <Banner variant="warn" lead="Tier {tier} cannot be reached by evolving.">
          The Altar only evolves to tier {EVOLVE_TIER_CAP}. Use higher tiers only if your game shows one; the numbers are scaled as entered.
        </Banner>
      {/if}
      {#if tier < EVOLVE_TIER_CAP}
        <div class="danger-zone">
          <Button variant="danger" onclick={() => (evolveOpen = true)}>Evolve Altar</Button>
          <span class="hint">Destroys every owned sigil except Ancients. Shows what is lost first.</span>
        </div>
      {/if}
    </Panel>

    <Panel title="Equipped per preset">
      <ul class="equipped" data-testid="equipped-summary" aria-label="Sigils equipped per preset">
        {#each character.presets as p (p.id)}
          {@const names = [...p.sigilSpecies, p.utilitySigilSpecies, p.ancientSigilSpecies].filter(Boolean).map(nameOf)}
          <li><strong>{p.name}</strong><span class="names">{names.length ? names.join(', ') : 'No sigils'}</span></li>
        {/each}
      </ul>
      <p class="hint">Slots and activation conditions are picked per preset in <a href="#/builds/loadout">Loadout</a>.</p>
    </Panel>

    <h2 class="collection-head">Collection</h2>
    {#each sections as section (section.rarity)}
      <section class="rarity-section">
        <h3 class="rarity-head">{section.rarity}</h3>
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
              equip={equipItems(character, def.species)}
              onEquip={(presetId) => equipIn(def.species, presetId)}
            />
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <Modal bind:open={evolveOpen} title="Evolve the Altar to tier {tier + 1}?">
    {#snippet children()}
      {#if destroyed.length === 0}
        <p>No sigils are owned, so nothing is destroyed. Ancients are always kept.</p>
      {:else}
        <p>This destroys {destroyed.length} owned sigil{destroyed.length === 1 ? '' : 's'} (Ancients are kept):</p>
        <p class="destroyed" data-testid="evolve-destroyed">{destroyed.map(nameOf).join(', ')}</p>
        {#if losingPresets.length}
          <p>Presets that lose equips:</p>
          <ul class="losing">
            {#each losingPresets as x (x.name)}<li><strong>{x.name}</strong>: {x.lost.map(nameOf).join(', ')}</li>{/each}
          </ul>
        {/if}
      {/if}
    {/snippet}
    {#snippet footer()}
      <Button variant="ghost" onclick={() => (evolveOpen = false)}>Keep the Altar as it is</Button>
      <Button variant="danger" onclick={evolve}>Evolve to tier {tier + 1}</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  .sigils { display: grid; gap: var(--sp-4); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .altar-row { display: flex; align-items: center; gap: var(--sp-5); flex-wrap: wrap; margin-bottom: var(--sp-3); }
  .stepper-group { display: flex; align-items: center; gap: var(--sp-2); }
  .danger-zone { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line-rule); }
  .equipped { list-style: none; margin: 0 0 var(--sp-2); padding: 0; display: grid; gap: var(--sp-1); font-size: var(--fs-13); }
  .equipped li { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
  .equipped .names { color: var(--text-soft); }
  .collection-head { margin: var(--sp-4) 0 0; }
  .label, .rarity-head {
    font-family: var(--font-ui);
    font-weight: var(--fw-bold);
    font-size: var(--fs-11);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .rarity-head { margin: 0 0 var(--sp-2); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .sigil-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--sp-3); }
  .destroyed { color: var(--text-soft); }
  .losing { margin: 0; padding-left: var(--sp-5); display: grid; gap: var(--sp-1); }
  @media (max-width: 700px) {
    .sigil-grid { grid-template-columns: 1fr; }
  }
</style>
