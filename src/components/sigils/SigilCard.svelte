<script>
  /**
   * SigilCard.svelte - one sigil in the collection: ownership level (0 = not owned), the flat
   * Attack/Health it grants at the character's Altar tier, and its spell numbers at that level.
   * All numbers are derived (engine/sources/sigilScale); the only input is the level. Ancients are
   * unique and stay level 1, so they get an owned toggle instead of a stepper.
   * Adapted from the v1 components/SigilsScreen.svelte card.
   */
  import { rarityClass, formatFlat } from '../../lib/format.js';
  import Num from '../ui/Num.svelte';
  import { sigilImage } from '../../lib/assets.js';
  import { MAX_SIGIL_LEVEL, isFormSigil, isGrantedSigil } from '../../lib/model/sigils.js';
  import PresetMenu from '../character/PresetMenu.svelte';
  import { getSigilBonusAttack, getSigilBonusHp } from '../../lib/engine/sources/sigilScale.js';
  import { sigilSpellBlocks } from './sigilView.js';

  // `equip` is the "Used in" menu (sigilView.equipItems); `onEquip(presetId)` toggles the sigil in that preset.
  // `showEffects` is the page's one Effects toggle: every card shows or hides its effects together, so a
  // row of cards never turns ragged because one card was opened.
  let { def, level = 0, tier = 1, spec = null, usedBy = [], note = '', onLevel = () => {}, equip = [], onEquip = () => {}, showEffects = true } = $props();

  const owned = $derived(level > 0);
  const ancient = $derived(def.rarity === 'Ancient');
  // Ancients are unique and Form sigils are granted, not forged: both stay at level 1 (model/sigils.js clampSigilLevel).
  const fixed = $derived(ancient || isFormSigil(def.species) || isGrantedSigil(def.species));
  // Show level-1 numbers for a sigil that is not owned yet, so the card still reads as a catalogue.
  const shownLevel = $derived(Math.max(1, level));
  const attack = $derived(getSigilBonusAttack(def, shownLevel, tier));
  const hp = $derived(getSigilBonusHp(def, shownLevel, tier));
  const blocks = $derived(sigilSpellBlocks(def.species, shownLevel, spec));
  const art = $derived(sigilImage(def.class, def.id));
  // 'DAMAGE' -> 'Damage', 'BEAR' -> 'Bear form'
  const typeLabel = (t) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : '');
  const formLabel = (f) => `${typeLabel(f)} form`;
</script>

<div class="sigil-card rarity-card {rarityClass(def.rarity)}" class:unowned={!owned} data-species={def.species}>
  <h3 class="rarity-title">{def.name}</h3>
  {#if art}
    <img class="sigil-art" src={art} alt="" loading="lazy" />
  {/if}

  <!-- the same height for a stepper and an owned toggle, so the stats line sits level across the row -->
  <div class="level-slot">
  {#if fixed}
    <label class="owned-toggle">
      <input type="checkbox" checked={owned} disabled={isGrantedSigil(def.species)} aria-label="{def.name} owned" onchange={(e) => onLevel(def.species, e.currentTarget.checked ? 1 : 0)} />
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
  </div>

  <p class="base-stats">
    Attack <span class="stat-num" data-testid="atk"><Num value={attack} format={formatFlat} flash="verdict" /></span>
    <span class="sep">|</span>
    Health <span class="stat-num" data-testid="hp"><Num value={hp} format={formatFlat} flash="verdict" /></span>
  </p>

  {#if showEffects}
  <div class="effects">
    {#each blocks as block (block.form ?? 'base')}
      {#if block.rows.length || block.title}
        <div class="effect">
          <span class="effect-title">{typeLabel(block.type)}{block.form ? ` · ${formLabel(block.form)}` : ''}{block.title ? ` · ${block.title}` : ''}</span>
          {#each block.rows as row}
            <span class="stat-row">
              <span class="stat-name">{row.label}</span>
              <span class="derived-stat">{row.value}</span>
            </span>
          {/each}
          {#if !block.rows.length || block.constant}
            <span class="timing">The same at every level</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  {/if}

  {#if note}<p class="notes">{note}</p>{/if}

  <div class="card-foot">
    {#if equip.length}
      <PresetMenu label="Used in" items={equip} onselect={(id) => onEquip(id)} />
    {:else}
      <span class="used-by">{usedBy.length ? `Used in: ${usedBy.join(', ')}` : 'Used in: none'}</span>
    {/if}
  </div>
</div>

<style>
  .sigil-card { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
  .sigil-card.unowned { opacity: 0.6; }
  .rarity-title { margin: 0; }
  .sigil-art { display: block; width: 64px; height: 64px; margin: 0 auto; object-fit: contain; border-radius: var(--r-1); }
  .level-slot { display: flex; align-items: center; justify-content: center; min-height: var(--control-h); }
  .level-row { position: relative; display: flex; align-items: center; justify-content: center; }
  /* one bordered group, like ui/Stepper */
  .stepper { display: inline-flex; align-items: stretch; height: var(--control-h); border: 1px solid var(--line-control); border-radius: var(--r-1); background: var(--surface-3); }
  .stepper button {
    display: grid;
    place-items: center;
    width: 28px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-soft);
    font-size: var(--fs-16);
    line-height: 1;
  }
  .stepper button:hover:not(:disabled) { color: var(--text-ink); background: var(--surface-4); }
  .stepper button:disabled { color: var(--text-disabled); }
  .level-input {
    width: 44px;
    height: 100%;
    padding: 0 2px;
    text-align: center;
    border: 0;
    border-left: 1px solid var(--line-rule);
    border-right: 1px solid var(--line-rule);
    border-radius: 0;
    background: transparent;
  }
  /* beside the stepper without pushing it off centre */
  .level-caption { position: absolute; left: calc(100% + var(--sp-2)); white-space: nowrap; font-size: var(--fs-11); color: var(--text-muted); }
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
  .card-foot :global(.preset-menu) { min-width: 0; max-width: 100%; }
  .card-foot :global(.preset-menu > button) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Phone: a row, not a tile. Art beside the name and stats, then the level and Used in on one line, so
     a card is about a third as tall and the collection is a list you can scan. */
  @media (max-width: 700px) {
    .sigil-card { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; column-gap: var(--sp-3); row-gap: var(--sp-1); align-items: center; }
    .rarity-title { grid-column: 2 / -1; grid-row: 1; text-align: left; }
    .sigil-art { grid-column: 1; grid-row: 1 / span 2; width: 48px; height: 48px; margin: 0; }
    .base-stats { grid-column: 2 / -1; grid-row: 2; text-align: left; }
    .level-slot { grid-column: 1 / span 2; grid-row: 3; justify-content: flex-start; min-width: 0; }
    .level-row { justify-content: flex-start; gap: var(--sp-2); }
    .level-caption { position: static; }
    .owned-toggle { justify-content: flex-start; min-height: var(--hit); }
    .card-foot { grid-column: 3; grid-row: 3; margin: 0; padding: 0; border: 0; justify-content: flex-end; min-width: 0; max-width: 11rem; }
    .effects, .notes { grid-column: 1 / -1; }
    .stepper button { width: var(--hit); }
    .stepper { height: var(--hit); }
  }
</style>
