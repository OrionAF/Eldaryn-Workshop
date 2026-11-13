<script>
  /**
   * PetCard.svelte - one owned Pet Core, display only (the Pets page edits a core in its drawer, with
   * CoreEditor.svelte, so editing never changes the card's size or the grid around it).
   *
   * One table holds every number: base ATK/HP, then one row per secondary, and, when the parent passes
   * the Core Altar level and tier, a second column with each value at that altar, straight from the
   * engine core source (engine/sources/petCore.js, pet.js).
   *
   * A "Used in" menu lists every preset (`presets`), checks those using this core and reports a pick via
   * `onUse(presetId)`; the parent toggles the assignment. `editing` marks the card whose editor is open.
   *
   * `score` (features/coreScore.js coreScore, scored for `specName`) adds a grade letter with the score, stat
   * fit and roll, a roll bar under each secondary's name, and marks each secondary's priority for that spec.
   */
  import { coreImage } from '../../lib/assets/pets.js';
  import { statByEnum } from '../../lib/game/stats.js';
  import { coreName, coreSlots } from '../../lib/model/pets.js';
  import { calculateCoreBonuses } from '../../lib/engine/sources/petCore.js';
  import { petSecondaryValue } from '../../lib/engine/sources/pet.js';
  import { rarityClass, formatFlat, formatPct, formatRate } from '../../lib/format.js';
  import Button from '../ui/Button.svelte';
  import PresetMenu from '../character/PresetMenu.svelte';

  let { pet, altarLevel = null, altarTier = 1, presets = [], editing = false, score = null, specName = '', onUse = () => {}, onEdit = () => {} } = $props();

  const slots = $derived(coreSlots(pet.rarity));
  const flat = $derived(altarLevel != null ? calculateCoreBonuses({ baseAttack: pet.baseAttack, baseHp: pet.baseHp }, altarLevel, altarTier) : null);
  const secAt = (v) => (altarLevel != null && altarLevel > 1 ? petSecondaryValue(v, altarLevel) : v);
  const label = (type) => statByEnum(type)?.sheetLabel ?? type;
  const useItems = $derived(presets.map((p) => ({ id: p.id, label: p.name, checked: p.petId === pet.id, meta: p.petId && p.petId !== pet.id ? 'uses another' : '' })));
  const pct = (f) => formatRate(f, 0);
  const scoreTitle = $derived(
    !score
      ? ''
      : score.grade
        ? `Scored for ${specName}. Stats ${pct(score.fit)}: its secondaries' priority against the best ${coreSlots(pet.rarity)} a ${pet.rarity} core can hold. Roll ${pct(score.roll)}: how far base ATK, HP and each secondary sit up their ranges.`
        : 'Mean position of base ATK, HP and each secondary in its possible range. No stat priorities for this class, so no score.',
  );
  const secTitle = (sc) =>
    [sc?.weight != null ? `${pct(sc.weight)} priority for ${specName}` : null, sc?.roll != null ? `${pct(sc.roll)} of range` : null].filter(Boolean).join(', ');
  const cols = $derived(flat ? 3 : 2);
</script>

<div class="pet-card rarity-card {rarityClass(pet.rarity)}" class:editing>
  <h3 class="card-title">{coreName(pet)}</h3>

  {#if score}
    <p class="core-score" title={scoreTitle} data-testid="core-score">
      {#if score.grade}
        <span class="roll-grade grade-{score.grade}">{score.grade}</span>
        <span class="num">Score {pct(score.score)}</span>
      {/if}
      <span class="score-parts">{#if score.grade}Stats <span class="num">{pct(score.fit)}</span>{' · '}{/if}Roll <span class="num">{pct(score.roll)}</span></span>
    </p>
  {/if}

  <img class="core-art" src={coreImage(pet.rarity)} alt="" loading="lazy" />

  <table class="core-stats" data-testid="core-stats">
    <thead>
      <tr>
        <th scope="col"><span class="visually-hidden">Stat</span></th>
        <th scope="col">Base</th>
        {#if flat}<th scope="col" title="At Core Altar level {altarLevel}, tier {altarTier}">Altar {altarLevel}</th>{/if}
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Attack</th>
        <td class="num">{formatFlat(pet.baseAttack)}</td>
        {#if flat}<td class="num scaled">{formatFlat(flat.flatAttack)}</td>{/if}
      </tr>
      <tr>
        <th scope="row">Health</th>
        <td class="num">{formatFlat(pet.baseHp)}</td>
        {#if flat}<td class="num scaled">{formatFlat(flat.flatHp)}</td>{/if}
      </tr>
    </tbody>
    <tbody>
      <tr class="sec-head"><th scope="colgroup" colspan={cols}>Secondary <span class="num">{pet.secondaries.length}/{slots}</span></th></tr>
      {#each pet.secondaries as sec, i (i)}
        {@const sc = score?.secondaries[i]}
        <tr class="sec-line" title={secTitle(sc) || undefined}>
          <th scope="row">
            <span class="sec-name" class:fit-high={sc?.weight != null && sc.weight >= 2 / 3} class:fit-low={sc?.weight != null && sc.weight < 1 / 3}>{label(sec.type)}</span>
            {#if sc?.roll != null}<span class="stat-bar" aria-hidden="true"><span class="stat-fill" style:width={pct(sc.roll)}></span></span>{/if}
          </th>
          <td class="num">+{formatPct(sec.value)}%</td>
          {#if flat}<td class="num scaled">+{formatPct(secAt(sec.value))}%</td>{/if}
        </tr>
      {:else}
        <tr><td class="none" colspan={cols}>none yet</td></tr>
      {/each}
    </tbody>
  </table>

  <div class="card-foot">
    <PresetMenu label="Used in" items={useItems} onselect={(id) => onUse(id)} />
    <Button variant="ghost" size="small" aria-pressed={editing} onclick={onEdit}>Edit</Button>
  </div>
</div>

<style>
  .pet-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    min-width: 0;
  }
  .pet-card.editing { outline: 2px solid var(--brass-400); outline-offset: -2px; }
  .card-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-14);
    text-align: center;
    color: var(--r-up, var(--text-ink));
  }
  .core-art { display: block; width: 84px; height: 84px; margin: 0 auto; object-fit: contain; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  /* Stat names take the free width (and ellipsize); the number columns size to their numbers, so every
     card's columns line up and nothing wraps. */
  .core-stats {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    background: var(--surface-1);
    border-radius: var(--r-2);
    font-size: var(--fs-12);
  }
  .core-stats th, .core-stats td { padding: 3px var(--sp-2); }
  .core-stats thead th {
    padding-top: var(--sp-2);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: right;
    white-space: nowrap;
  }
  /* row headers are stat names, not the global th micro label */
  .core-stats tbody th[scope='row'] {
    width: 100%;
    max-width: 0;
    text-align: left;
    font-family: var(--font-ui);
    font-size: var(--fs-12);
    font-weight: var(--fw-regular);
    letter-spacing: normal;
    text-transform: none;
    color: var(--text-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .core-stats td { text-align: right; white-space: nowrap; }
  .core-stats td.scaled { color: var(--brass-200); }
  .sec-head th {
    padding-top: var(--sp-2);
    text-align: left;
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
    border-top: 1px solid var(--line-hairline);
  }
  .sec-head .num { color: var(--text-soft); }
  .core-stats tbody:last-child tr:last-child > * { padding-bottom: var(--sp-2); }
  .sec-name { color: var(--text-muted); }
  .sec-name.fit-high { color: var(--brass-200); }
  .sec-name.fit-low { opacity: 0.6; }
  .none { color: var(--text-muted); text-align: left !important; }
  .core-score { margin: 0; display: flex; align-items: baseline; justify-content: center; gap: var(--sp-2); font-size: var(--fs-11); color: var(--text-muted); }
  .core-score .num { font-size: var(--fs-11); }
  .stat-bar { display: block; height: 2px; margin-top: 2px; background: var(--line-hairline); border-radius: 1px; overflow: hidden; }
  .stat-fill { display: block; height: 100%; background: var(--r-up, var(--brass-400)); }
  .card-foot { display: flex; align-items: center; gap: var(--sp-1); margin-top: auto; padding-top: var(--sp-2); border-top: 1px solid var(--line-hairline); }
  /* the menu button takes the free width and ellipsizes a long preset list; Edit keeps its size */
  .card-foot :global(.preset-menu) { flex: 1; min-width: 0; }
  .card-foot :global(.preset-menu > button) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
