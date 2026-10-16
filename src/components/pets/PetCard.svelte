<script>
  /**
   * PetCard.svelte - one owned pet. Display mode shows the name (evolved at altar tier >= 2), the
   * species base ATK/HP and one line per secondary; edit mode swaps in a species select and a
   * type + value editor per secondary slot. Every change persists as it is made (Save is only a
   * view toggle). Secondary types are class-gated by the parent via `types`.
   *
   * When the parent passes the altar level and tier, a read-only line shows the altar-scaled ATK/HP
   * and each secondary's scaled value, straight from the engine pet source (engine/sources/pet.js).
   */
  import { petImage } from '../../lib/assets.js';
  import { petSpeciesById, petDisplayName } from '../../lib/game/pets.js';
  import { statByEnum } from '../../lib/game/stats.js';
  import { PET_SECONDARY_RANGES, secondarySlots } from '../../lib/model/pets.js';
  import { petFlatAttack, petFlatHp, petSecondaryValue } from '../../lib/engine/sources/pet.js';
  import { rarityClass, formatFlat, formatPct } from '../../lib/format.js';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';

  let { pet, species = [], types = [], evolved = false, altarLevel = null, altarTier = 1, usedBy = [], editing = false, onSpecies, onType, onValue, onDropSecondary, onToggleEdit, onRemove } = $props();

  const def = $derived(petSpeciesById(pet.species));
  const slots = $derived(secondarySlots(pet.species));
  const name = $derived(petDisplayName(pet.species, evolved));
  const scaled = $derived(altarLevel != null && altarLevel > 1);
  const label = (type) => statByEnum(type)?.sheetLabel ?? type;
  const taken = (current) => new Set(pet.secondaries.map((s) => s.type).filter((t) => t !== current));
  const choices = (current) => types.filter((t) => !taken(current).has(t) || t === current);
  const speciesOptions = $derived(species.map((s) => ({ value: s.id, label: `${petDisplayName(s.id, evolved)} · ${s.rarity}` })));
  const typeOptions = (current) => choices(current).map((t) => ({ value: t, label: label(t) }));
  const addOptions = $derived([{ value: '', label: '+ add secondary…' }, ...typeOptions(null)]);
</script>

<div class="pet-card rarity-card {rarityClass(pet.rarity)}" class:editing>
  {#if editing}
    <Select label="Species" options={speciesOptions} value={pet.species} onchange={(v) => onSpecies(v)} />
  {:else}
    <h3 class="card-title">{name}</h3>
  {/if}

  <img class="pet-art" src={petImage(name)} alt="" loading="lazy" />

  <p class="base-stats">
    Base Attack <span class="num">{formatFlat(def.baseAttack)}</span>
    <span class="sep">|</span>
    Base HP <span class="num">{formatFlat(def.baseHp)}</span>
  </p>

  {#if altarLevel != null}
    <p class="base-stats preview" data-testid="pet-preview">
      Altar level {altarLevel}, tier {altarTier}:
      ATK <span class="num">{formatFlat(petFlatAttack(def.baseAttack, altarLevel, altarTier))}</span>
      <span class="sep">|</span>
      HP <span class="num">{formatFlat(petFlatHp(def.baseHp, altarLevel, altarTier))}</span>
    </p>
  {/if}

  <div class="secondaries">
    <span class="head-label">Secondary {pet.secondaries.length}/{slots}</span>
    {#each pet.secondaries as sec, i (i)}
      {@const range = PET_SECONDARY_RANGES[sec.type]}
      {#if editing}
        <div class="sec-edit">
          <Select label="Secondary stat {i + 1}" options={typeOptions(sec.type)} value={sec.type} onchange={(v) => onType(i, v)} />
          <NumberField
            label="{label(sec.type)} value"
            value={sec.value}
            min={range.min}
            unit="%"
            onchange={(v) => onValue(i, v)}
          />
          {#if !range.manual}
            <div class="sec-slider">
              <Slider min={range.min} max={range.max} step={range.step} value={sec.value} ariaLabel="{label(sec.type)} slider" oninput={(v) => onValue(i, v)} />
              <span class="sec-range">{formatPct(range.min)}-{formatPct(range.max)}</span>
            </div>
          {/if}
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
  .pet-art { display: block; width: 84px; height: 84px; margin: 0 auto; object-fit: contain; border-radius: var(--r-2); }
  .base-stats { margin: 0; text-align: center; font-size: var(--fs-12); color: var(--text-soft); }
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
