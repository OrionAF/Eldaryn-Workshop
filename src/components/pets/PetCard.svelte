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
  import { rarityClass } from '../../lib/constants.js';
  import { petImage } from '../../lib/assets.js';
  import { petSpeciesById, petDisplayName } from '../../lib/game/pets.js';
  import { statByEnum } from '../../lib/game/stats.js';
  import { PET_SECONDARY_RANGES, secondarySlots } from '../../lib/model/pets.js';
  import { petFlatAttack, petFlatHp, petSecondaryValue } from '../../lib/engine/sources/pet.js';
  import { formatFlat, formatPct } from '../../lib/format.js';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';

  let { pet, species = [], types = [], evolved = false, altarLevel = null, altarTier = 1, usedBy = [], editing = false, onSpecies, onType, onValue, onDropSecondary, onToggleEdit, onRemove } = $props();

  const def = $derived(petSpeciesById(pet.species));
  const slots = $derived(secondarySlots(pet.species));
  const name = $derived(petDisplayName(pet.species, evolved));
  const scaled = $derived(altarLevel != null && altarLevel > 1);
  const label = (type) => statByEnum(type)?.sheetLabel ?? type;
  const taken = (current) => new Set(pet.secondaries.map((s) => s.type).filter((t) => t !== current));
  const choices = (current) => types.filter((t) => !taken(current).has(t) || t === current);
</script>

<div class="pet-card rarity-card {rarityClass(pet.rarity)}" class:editing>
  {#if editing}
    <select class="species-select" value={pet.species} aria-label="Species" onchange={(e) => onSpecies(e.target.value)}>
      {#each species as s (s.id)}<option value={s.id}>{petDisplayName(s.id, evolved)} · {s.rarity}</option>{/each}
    </select>
  {:else}
    <h3 class="rarity-title">{name}</h3>
  {/if}

  <img class="pet-art" src={petImage(name)} alt="" loading="lazy" />

  <p class="base-stats">
    Base Attack <span class="num">{formatFlat(def.baseAttack)}</span>
    <span class="sep">|</span>
    Base HP <span class="num">{formatFlat(def.baseHp)}</span>
  </p>

  {#if altarLevel != null}
    <p class="base-stats preview" data-testid="pet-preview">
      Altar L{altarLevel} T{altarTier}:
      ATK <span class="num">{formatFlat(petFlatAttack(def.baseAttack, altarLevel, altarTier))}</span>
      <span class="sep">|</span>
      HP <span class="num">{formatFlat(petFlatHp(def.baseHp, altarLevel, altarTier))}</span>
    </p>
  {/if}

  <div class="secondaries">
    <span class="micro-label">SECONDARY {pet.secondaries.length}/{slots}</span>
    {#each pet.secondaries as sec, i (i)}
      {@const range = PET_SECONDARY_RANGES[sec.type]}
      {#if editing}
        <div class="sec-edit">
          <select value={sec.type} aria-label="Secondary stat {i + 1}" onchange={(e) => onType(i, e.target.value)}>
            {#each choices(sec.type) as t (t)}<option value={t}>{label(t)}</option>{/each}
          </select>
          {#if range.manual}
            <input class="sec-manual" type="text" inputmode="decimal" value={formatPct(sec.value)} aria-label="{label(sec.type)} value"
              onchange={(e) => onValue(i, e.target.value.replace(',', '.'))} />
          {:else}
            <div class="sec-slider">
              <Slider min={range.min} max={range.max} step={range.step} value={sec.value} ariaLabel="{label(sec.type)} value" oninput={(v) => onValue(i, v)} />
              <span class="sec-value">{formatPct(sec.value)}</span>
            </div>
          {/if}
          <button type="button" class="drop-sec" aria-label="Remove secondary {i + 1}" onclick={() => onDropSecondary(i)}>×</button>
        </div>
      {:else}
        <p class="sec-line"><span class="sec-name">{label(sec.type)}</span><span class="num">+{formatPct(sec.value)}%{#if scaled}<span class="scaled"> → +{formatPct(petSecondaryValue(sec.value, altarLevel))}%</span>{/if}</span></p>
      {/if}
    {/each}
    {#if editing && pet.secondaries.length < slots}
      <select class="add-sec" value="" aria-label="Add secondary stat" onchange={(e) => e.target.value && onType(pet.secondaries.length, e.target.value)}>
        <option value="">+ add secondary…</option>
        {#each choices(null) as t (t)}<option value={t}>{label(t)}</option>{/each}
      </select>
    {/if}
  </div>

  <p class="used-by">{usedBy.length ? `used by ${usedBy.join(', ')}` : 'unused'}</p>

  <div class="card-foot">
    <button type="button" class="btn-ghost" onclick={onToggleEdit}>{editing ? 'Save' : 'Edit'}</button>
    <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
  </div>
</div>

<style>
  .pet-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
  .pet-card.editing { outline: 1px solid var(--color-gold); outline-offset: -1px; }
  .rarity-title { margin: 0; }
  .species-select { width: 100%; }
  .pet-art { display: block; width: 84px; height: 84px; margin: 0 auto; object-fit: contain; border-radius: var(--radius-field); }
  .base-stats { margin: 0; text-align: center; font-size: 12px; color: var(--color-soft); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--color-ink); }
  .sep { color: var(--color-dim); margin: 0 4px; }
  .scaled { color: var(--color-gold); }
  .secondaries { display: flex; flex-direction: column; gap: 4px; background: var(--color-inset); border-radius: var(--radius-field); padding: 6px 8px; }
  .sec-edit { display: flex; flex-direction: column; gap: 3px; padding-bottom: 4px; position: relative; }
  .sec-edit select { width: 100%; font-size: 11.5px; }
  .sec-slider { display: flex; align-items: center; gap: 4px; }
  .sec-slider :global(.slider) { flex: 1; min-width: 0; }
  .sec-manual { width: 100%; font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: 11.5px; }
  .sec-value { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: 11px; color: var(--color-soft); min-width: 40px; text-align: right; }
  .drop-sec { position: absolute; top: 0; right: 0; background: none; border: none; color: var(--color-muted); cursor: pointer; font-size: 13px; line-height: 1; padding: 2px 4px; }
  .drop-sec:hover { color: var(--color-danger); }
  .sec-line { margin: 0; display: flex; justify-content: space-between; gap: var(--space-2); font-size: 11.5px; }
  .sec-name { color: var(--color-muted); }
  .used-by { margin: 0; font-size: 10.5px; color: var(--color-muted); }
  .card-foot { display: flex; align-items: center; gap: 4px; margin-top: auto; padding-top: var(--space-2); border-top: 1px solid var(--color-border-hairline); }
  .card-foot .btn-ghost { flex: 1; }
  .card-foot button { font-size: 11px; }
  @media (max-width: 700px) { .card-foot button { min-height: 44px; } }
</style>
