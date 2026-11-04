<script>
  /**
   * PetCard.svelte - one owned Pet Core. Display mode shows the rarity name and art, the core's base ATK/HP and
   * one line per secondary; edit mode swaps in a rarity select, base ATK/HP fields (with the rarity's
   * roll band as a hint) and a type + value editor per secondary slot. Every change persists as it is
   * made (Save is only a view toggle). Secondary types are class-gated by the parent via `types`.
   *
   * When the parent passes the Core Altar level and tier, a read-only line shows the altar-scaled
   * ATK/HP and each secondary's scaled value, straight from the engine core source (engine/sources/petCore.js).
   *
   * A "Used in" menu lists every preset (`presets`), checks those using this core and reports a pick via
   * `onUse(presetId)`; the parent toggles the assignment.
   */
  import { coreImage } from '../../lib/assets/pets.js';
  import { statByEnum } from '../../lib/game/stats.js';
  import { coreBaseBand } from '../../lib/game/petCores.js';
  import { CORE_RARITY_NAMES, coreName, coreSlots, coreRarityEnum, coreSecondaryRangePoints } from '../../lib/model/pets.js';
  import { calculateCoreBonuses } from '../../lib/engine/sources/petCore.js';
  import { petSecondaryValue } from '../../lib/engine/sources/pet.js';
  import { rarityClass, formatFlat, formatPct } from '../../lib/format.js';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import PresetMenu from '../character/PresetMenu.svelte';

  let { pet, types = [], altarLevel = null, altarTier = 1, usedBy = [], presets = [], editing = false, onRarity, onBase, onType, onValue, onDropSecondary, onToggleEdit, onUse, onRemove } = $props();

  const slots = $derived(coreSlots(pet.rarity));
  const band = $derived(coreBaseBand(coreRarityEnum(pet.rarity)));
  const flat = $derived(altarLevel != null ? calculateCoreBonuses({ baseAttack: pet.baseAttack, baseHp: pet.baseHp }, altarLevel, altarTier) : null);
  const scaled = $derived(altarLevel != null && altarLevel > 1);
  const label = (type) => statByEnum(type)?.sheetLabel ?? type;
  const taken = (current) => new Set(pet.secondaries.map((s) => s.type).filter((t) => t !== current));
  const choices = (current) => types.filter((t) => !taken(current).has(t) || t === current);
  const useItems = $derived(presets.map((p) => ({ id: p.id, label: p.name, checked: p.petId === pet.id, meta: p.petId && p.petId !== pet.id ? 'uses another' : '' })));
  const rarityOptions = CORE_RARITY_NAMES.map((r) => ({ value: r, label: r }));
  const typeOptions = (current) => choices(current).map((t) => ({ value: t, label: label(t) }));
  const addOptions = $derived([{ value: '', label: '+ add secondary…' }, ...typeOptions(null)]);
</script>

<div class="pet-card rarity-card {rarityClass(pet.rarity)}" class:editing>
  {#if editing}
    <Select label="Rarity" options={rarityOptions} value={pet.rarity} onchange={(v) => onRarity(v)} />
  {:else}
    <h3 class="card-title">{coreName(pet)}</h3>
  {/if}

  <img class="core-art" src={coreImage(pet.rarity)} alt="" loading="lazy" />

  {#if editing}
    <div class="base-edit">
      <NumberField label="Base Attack" value={pet.baseAttack} min={0} onchange={(v) => onBase('attack', v)} />
      <NumberField label="Base HP" value={pet.baseHp} min={0} onchange={(v) => onBase('hp', v)} />
    </div>
    {#if band}
      <p class="hint">{pet.rarity} rolls <span class="num">{formatFlat(band.attack.min)}-{formatFlat(band.attack.max)}</span> ATK, <span class="num">{formatFlat(band.hp.min)}-{formatFlat(band.hp.max)}</span> HP</p>
    {/if}
  {:else}
    <p class="base-stats">
      Base Attack <span class="num">{formatFlat(pet.baseAttack)}</span>
      <span class="sep">|</span>
      Base HP <span class="num">{formatFlat(pet.baseHp)}</span>
    </p>
  {/if}

  {#if flat}
    <p class="base-stats preview" data-testid="pet-preview">
      Altar level {altarLevel}, tier {altarTier}:
      ATK <span class="num">{formatFlat(flat.flatAttack)}</span>
      <span class="sep">|</span>
      HP <span class="num">{formatFlat(flat.flatHp)}</span>
    </p>
  {/if}

  <div class="secondaries">
    <span class="head-label">Secondary {pet.secondaries.length}/{slots}</span>
    {#each pet.secondaries as sec, i (i)}
      {@const range = coreSecondaryRangePoints(sec.type)}
      {#if editing}
        <div class="sec-edit">
          <Select label="Secondary stat {i + 1}" options={typeOptions(sec.type)} value={sec.type} onchange={(v) => onType(i, v)} />
          <NumberField label="{label(sec.type)} value" value={sec.value} min={range.min} unit="%" onchange={(v) => onValue(i, v)} />
          <div class="sec-slider">
            <Slider min={range.min} max={range.max} step={range.step} value={sec.value} ariaLabel="{label(sec.type)} slider" oninput={(v) => onValue(i, v)} />
            <span class="sec-range">{formatPct(range.min)}-{formatPct(range.max)}</span>
          </div>
          <div class="drop-sec"><Button variant="quiet" size="small" aria-label="Remove secondary {i + 1}" onclick={() => onDropSecondary(i)}>×</Button></div>
        </div>
      {:else}
        <p class="sec-line"><span class="sec-name">{label(sec.type)}</span><span class="num">+{formatPct(sec.value)}%{#if scaled}<span class="scaled"> → +{formatPct(petSecondaryValue(sec.value, altarLevel))}%</span>{/if}</span></p>
      {/if}
    {/each}
    {#if editing && pet.secondaries.length < slots}
      {#key pet.secondaries.length}
        <Select label="Add secondary stat" options={addOptions} value="" onchange={(v) => v && onType(pet.secondaries.length, v)} />
      {/key}
    {/if}
  </div>

  <p class="used-by">{usedBy.length ? `used by ${usedBy.join(', ')}` : 'unused'}</p>

  <div class="card-foot">
    <PresetMenu label="Used in" items={useItems} onselect={(id) => onUse(id)} />
    <Button variant="ghost" size="small" onclick={onToggleEdit}>{editing ? 'Save' : 'Edit'}</Button>
    <ConfirmButton variant="danger" size="small" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
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
  .pet-card.editing { outline: 1px solid var(--brass-400); outline-offset: -1px; }
  .card-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-14);
    text-align: center;
    color: var(--r-up, var(--text-ink));
  }
  .core-art { display: block; width: 84px; height: 84px; margin: 0 auto; object-fit: contain; }
  .base-stats { margin: 0; text-align: center; font-size: var(--fs-12); color: var(--text-soft); }
  .base-edit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
  .hint { margin: 0; font-size: var(--fs-11); color: var(--text-muted); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .sep { color: var(--text-muted); margin: 0 var(--sp-1); }
  .scaled { color: var(--brass-400); }
  .head-label {
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .secondaries { display: flex; flex-direction: column; gap: var(--sp-1); background: var(--surface-1); border-radius: var(--r-2); padding: var(--sp-2); min-width: 0; }
  .sec-edit { display: flex; flex-direction: column; gap: var(--sp-1); padding-bottom: var(--sp-1); position: relative; min-width: 0; }
  .sec-slider { display: flex; align-items: center; gap: var(--sp-1); }
  .sec-slider :global(.slider) { flex: 1; min-width: 0; }
  .sec-range { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: var(--fs-11); color: var(--text-soft); text-align: right; white-space: nowrap; }
  .drop-sec { align-self: flex-end; }
  .sec-line { margin: 0; display: flex; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-12); }
  .sec-name { color: var(--text-muted); }
  .used-by { margin: 0; font-size: var(--fs-11); color: var(--text-muted); }
  .card-foot { display: flex; align-items: center; gap: var(--sp-1); margin-top: auto; padding-top: var(--sp-2); border-top: 1px solid var(--line-hairline); flex-wrap: wrap; }
</style>
