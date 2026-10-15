<script>
  /**
   * SigilCard.svelte - one sigil in the collection: ownership level (0 = not owned), the flat
   * Attack/Health it grants at the character's Altar tier, and its spell numbers at that level.
   * All numbers are derived (engine/sources/sigilScale); the only input is the level. Ancients are
   * unique and stay level 1, so they get an owned toggle instead of a stepper.
   * Adapted from the v1 components/SigilsScreen.svelte card.
   */
  import { rarityClass, formatFlat } from '../../lib/format.js';
  import { sigilImage } from '../../lib/assets.js';
  import { MAX_SIGIL_LEVEL, isFormSigil } from '../../lib/model/sigils.js';
  import Menu from '../ui/Menu.svelte';
  import { getSigilBonusAttack, getSigilBonusHp } from '../../lib/engine/sources/sigilScale.js';
  import { sigilSpellBlocks } from './sigilView.js';

  // `equip` is the "Equip in" menu (sigilView.equipItems); `onEquip(presetId)` toggles the sigil in that preset.
  let { def, level = 0, tier = 1, spec = null, usedBy = [], note = '', onLevel = () => {}, equip = [], onEquip = () => {} } = $props();

  const owned = $derived(level > 0);
  const ancient = $derived(def.rarity === 'Ancient');
  // Ancients are unique and Form sigils are granted, not forged: both stay at level 1 (model/sigils.js clampSigilLevel).
  const fixed = $derived(ancient || isFormSigil(def.species));
  let details = $state(false);
  let menuOpen = $state(false);
  // Show level-1 numbers for a sigil that is not owned yet, so the card still reads as a catalogue.
  const shownLevel = $derived(Math.max(1, level));
  const attack = $derived(getSigilBonusAttack(def, shownLevel, tier));
  const hp = $derived(getSigilBonusHp(def, shownLevel, tier));
  const blocks = $derived(sigilSpellBlocks(def.species, shownLevel, spec));
  const art = $derived(sigilImage(def.class, def.id));
</script>

<div class="sigil-card rarity-card {rarityClass(def.rarity)}" class:unowned={!owned} data-species={def.species}>
  <h3 class="rarity-title">{def.name}</h3>
  {#if art}
    <img class="sigil-art" src={art} alt="" loading="lazy" />
  {/if}

  {#if fixed}
    <label class="owned-toggle">
      <input type="checkbox" checked={owned} aria-label="{def.name} owned" onchange={(e) => onLevel(def.species, e.currentTarget.checked ? 1 : 0)} />
      <span>{owned ? (ancient ? 'Unlocked (level 1)' : 'Owned (fixed at level 1)') : ancient ? 'Not unlocked' : 'Not owned (level is fixed at 1)'}</span>
    </label>
  {:else}
    <div class="level-row">
      <div class="stepper">
        <button type="button" disabled={level <= 0} aria-label="{def.name} level down" onclick={() => onLevel(def.species, level - 1)}>−</button>
        <input
          class="level-input"
          type="text"
          inputmode="numeric"
          value={level}
          aria-label="{def.name} level"
          onchange={(e) => onLevel(def.species, e.currentTarget.value)}
        />
        <button type="button" disabled={level >= MAX_SIGIL_LEVEL} aria-label="{def.name} level up" onclick={() => onLevel(def.species, level + 1)}>+</button>
      </div>
      {#if !owned}<span class="level-caption">not owned</span>{/if}
    </div>
  {/if}

  <p class="base-stats">
    Attack <span class="stat-num" data-testid="atk">{formatFlat(attack)}</span>
    <span class="sep">|</span>
    Health <span class="stat-num" data-testid="hp">{formatFlat(hp)}</span>
  </p>

  <button type="button" class="details-toggle" aria-expanded={details} onclick={() => (details = !details)}>{details ? 'Hide details' : 'Details'}</button>

  {#if details}
  <div class="effects">
    {#each blocks as block (block.form ?? 'base')}
      {#if block.rows.length || block.title}
        <div class="effect">
          <span class="effect-title">{block.type}{block.form ? ` · ${block.form}` : ''}{block.title ? ` · ${block.title}` : ''}</span>
          {#each block.rows as row}
            <span class="stat-row">
              <span class="stat-name">{row.label}</span>
              <span class="derived-stat">{row.value}</span>
            </span>
          {/each}
          {#if !block.rows.length}
            <span class="timing">Fixed at every level (see Game/sigils.md §6)</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  {/if}

  {#if note}<p class="notes">{note}</p>{/if}

  <div class="card-foot">
    <span class="used-by">{usedBy.length ? `Equipped in: ${usedBy.join(', ')}` : 'Unequipped'}</span>
    {#if equip.length}
      <span class="equip-wrap">
        <button type="button" class="equip-btn" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>Equip in ▾</button>
        {#if menuOpen}
          <div class="equip-menu">
            <Menu
              label="Equip {def.name} in"
              items={equip}
              onselect={(item) => {
                menuOpen = false;
                onEquip(item.id);
              }}
              onclose={() => (menuOpen = false)}
            />
          </div>
        {/if}
      </span>
    {/if}
  </div>
</div>

<style>
  .sigil-card { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
  .sigil-card.unowned { opacity: 0.6; }
  .rarity-title { margin: 0; }
  .sigil-art { display: block; width: 64px; height: 64px; margin: 0 auto; object-fit: contain; border-radius: var(--r-1); }
  .level-row { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); }
  .stepper { display: flex; align-items: center; gap: var(--sp-1); }
  .stepper button {
    width: 26px;
    padding: 2px 0;
    font-size: var(--fs-13);
    border-radius: var(--r-1);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    color: var(--text-ink);
  }
  .stepper button:hover:not(:disabled) { border-color: var(--brass-400); }
  .level-input { width: 42px; text-align: center; padding: var(--sp-1) 2px; }
  .level-caption { font-size: var(--fs-11); color: var(--text-muted); }
  .owned-toggle { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); }
  .base-stats { margin: 0; text-align: center; font-size: var(--fs-12); color: var(--text-soft); }
  .stat-num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .sep { color: var(--text-muted); margin: 0 var(--sp-1); }
  .effects { display: flex; flex-direction: column; gap: var(--sp-2); }
  .effect { display: flex; flex-direction: column; gap: var(--sp-1); background: var(--surface-1); border-radius: var(--r-1); padding: var(--sp-2); }
  .effect-title {
    font-family: var(--font-ui);
    font-weight: var(--fw-bold);
    font-size: var(--fs-11);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .stat-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-12); }
  .stat-name { color: var(--text-muted); }
  .derived-stat { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--brass-200); }
  .timing { font-size: var(--fs-11); color: var(--text-muted); }
  .notes { margin: 0; font-size: var(--fs-12); font-style: italic; color: var(--text-muted); }
  .card-foot {
    margin-top: auto;
    padding-top: var(--sp-2);
    border-top: 1px solid var(--line-hairline);
    font-size: var(--fs-12);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }
  .used-by { color: var(--text-muted); }
  .details-toggle, .equip-btn {
    background: transparent;
    border: 1px solid var(--line-control);
    color: var(--text-soft);
    border-radius: var(--r-1);
    padding: 2px var(--sp-2);
    font-size: var(--fs-12);
    cursor: pointer;
  }
  .details-toggle:hover, .equip-btn:hover { border-color: var(--line-control-hover); color: var(--text-ink); }
  .details-toggle { align-self: flex-start; }
  .equip-wrap { position: relative; }
  .equip-menu { position: absolute; right: 0; bottom: 100%; z-index: 5; }
</style>
