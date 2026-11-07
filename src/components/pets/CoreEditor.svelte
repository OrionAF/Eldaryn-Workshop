<script>
  /**
   * CoreEditor.svelte - the editor for one Pet Core, shown in the Pets page's drawer: the rarity, the two
   * base rolls (each with a meter of where it sits in the rarity's band) and one row per secondary slot
   * (stat, value, and a slider over the stat's range). Every change persists as it is made through the
   * callbacks, and the core's card in the grid shows the result live. Secondary types are class-gated by
   * the parent via `types`.
   */
  import { coreBaseBand } from '../../lib/game/petCores.js';
  import { statByEnum } from '../../lib/game/stats.js';
  import { CORE_RARITY_NAMES, coreSlots, coreRarityEnum, coreSecondaryRangePoints } from '../../lib/model/pets.js';
  import { formatFlat, formatPct } from '../../lib/format.js';
  import Slider from '../Slider.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import RangeMeter from '../ui/RangeMeter.svelte';

  let { pet, types = [], onRarity, onBase, onType, onValue, onDropSecondary } = $props();
  const id = $props.id();

  const slots = $derived(coreSlots(pet.rarity));
  const band = $derived(coreBaseBand(coreRarityEnum(pet.rarity)));
  const label = (type) => statByEnum(type)?.sheetLabel ?? type;
  const taken = (current) => new Set(pet.secondaries.map((s) => s.type).filter((t) => t !== current));
  const typeOptions = (current) => types.filter((t) => !taken(current).has(t) || t === current).map((t) => ({ value: t, label: label(t) }));
  const addOptions = $derived([{ value: '', label: '+ add secondary…' }, ...typeOptions(null)]);
  const rarityOptions = CORE_RARITY_NAMES.map((r) => ({ value: r, label: r }));
  const bases = $derived([
    { stat: 'attack', name: 'Base Attack', value: pet.baseAttack },
    { stat: 'hp', name: 'Base HP', value: pet.baseHp },
  ]);
</script>

<div class="core-editor">
  <div class="rarity"><Select label="Rarity" options={rarityOptions} value={pet.rarity} onchange={(v) => onRarity(v)} /></div>

  <section class="block" aria-labelledby="{id}-base">
    <h3 class="micro-label" id="{id}-base">Base rolls</h3>
    {#each bases as b (b.stat)}
      <div class="base-row">
        <NumberField label={b.name} value={b.value} min={0} flat onchange={(v) => onBase(b.stat, v)} />
        {#if band}
          <div class="control-align">
            <RangeMeter min={band[b.stat].min} max={band[b.stat].max} value={b.value} format={formatFlat} label="{b.name} in the {pet.rarity} band" />
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <section class="block" aria-labelledby="{id}-sec">
    <h3 class="micro-label" id="{id}-sec">Secondaries <span class="num">{pet.secondaries.length}/{slots}</span></h3>
    {#each pet.secondaries as sec, i (i)}
      {@const range = coreSecondaryRangePoints(sec.type)}
      <div class="sec-row">
        <Select label="Secondary stat {i + 1}" hideLabel options={typeOptions(sec.type)} value={sec.type} onchange={(v) => onType(i, v)} />
        <NumberField label="{label(sec.type)} value" hideLabel value={sec.value} min={range?.min ?? null} unit="%" onchange={(v) => onValue(i, v)} />
        <Button variant="quiet" size="small" aria-label="Remove secondary {i + 1}" onclick={() => onDropSecondary(i)}>×</Button>
        {#if range}
          <div class="sec-slider">
            <span class="end num">{formatPct(range.min)}</span>
            <Slider min={range.min} max={range.max} step={range.step} value={sec.value} ariaLabel="{label(sec.type)} slider" oninput={(v) => onValue(i, v)} />
            <span class="end num">{formatPct(range.max)}%</span>
          </div>
        {/if}
      </div>
    {/each}
    {#if pet.secondaries.length < slots}
      {#key pet.secondaries.length}
        <Select label="Add secondary stat" hideLabel options={addOptions} value="" onchange={(v) => v && onType(pet.secondaries.length, v)} />
      {/key}
    {/if}
  </section>
</div>

<style>
  .core-editor { display: grid; gap: var(--sp-5); min-width: 0; --meter-lo: 5.5ch; }
  .rarity { max-width: 14rem; }
  .block { display: grid; gap: var(--sp-3); min-width: 0; }
  .block h3 { margin: 0; }
  .block h3 .num { margin-left: var(--sp-1); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  /* field | where the roll sits in the rarity's band, on the field's line */
  .base-row { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); gap: var(--sp-3); align-items: start; }
  .base-row .control-align { display: flex; align-items: center; height: var(--control-h); }
  /* stat | value | remove, then the slider over the stat's range under them */
  .sec-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6.5rem auto;
    gap: var(--sp-1) var(--sp-2);
    align-items: center;
    padding-bottom: var(--sp-2);
    border-bottom: 1px solid var(--line-hairline);
  }
  .sec-slider { grid-column: 1 / -1; display: grid; grid-template-columns: 4ch minmax(0, 1fr) 5ch; align-items: center; gap: var(--sp-2); }
  .end { font-size: var(--fs-11); color: var(--text-muted); white-space: nowrap; }
  .end:first-child { text-align: right; }
  @media (pointer: coarse), (max-width: 700px) {
    .base-row .control-align { height: var(--hit); }
  }
</style>
