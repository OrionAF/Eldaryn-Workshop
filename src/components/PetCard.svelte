<script>
  /**
   * PetCard.svelte - one pet in the Pets grid.
   *
   * Two renderings of the same persisted state (BigReworkV1's "Edit Mode"):
   *  - EDIT: a companion dropdown plus a stat dropdown + slider per secondary
   *    slot, ending in Save. A `manual` secondary (petsData.js) has no scraped
   *    range, so it gets a typed field instead of a slider.
   *  - DISPLAY: the pet's name, and each secondary collapsed to one line
   *    ("Attack %: +7.2%"), with Edit / Remove in the footer.
   *
   * Save is a VIEW TOGGLE, not a commit: every change is persisted as it is
   * made, exactly like the rest of the app, so there is no draft to lose and
   * no Cancel to reason about.
   *
   * Attack/Health are derived from the character-wide Pet Altar, so they are
   * read-only here - the pet has no level of its own.
   */
  import { COMPANION_MAX_LEVEL, companionById, companionStat, secondaryRange, petSlotsFor } from '../lib/petsData.js';
  import { STAT_FIELDS, rarityClass } from '../lib/constants.js';
  import { petImage } from '../lib/assets.js';
  import { formatStat, parseStat } from '../lib/format.js';
  import Slider from './Slider.svelte';

  let {
    pet,
    altar,
    companions = [],
    usedBy = [],
    editing = false,
    onCompanion,
    onSecondaryKey,
    onSecondaryValue,
    onToggleEdit,
    onRemove,
  } = $props();

  let confirming = $state(false);

  const def = $derived(companionById(pet.companionId));
  const slots = $derived(petSlotsFor(pet));
  const art = $derived(def ? petImage(def.name) : null);
  const attack = $derived(def ? companionStat(def, 'attack', altar.tier, altar.level) : 0);
  const health = $derived(def ? companionStat(def, 'health', altar.tier, altar.level) : 0);

  function statLabel(statKey) {
    return STAT_FIELDS.find((f) => f.key === statKey)?.label ?? statKey;
  }

  /** Secondary options still free, plus whichever this slot already holds. */
  function available(currentKey) {
    const taken = new Set(pet.secondaries.filter((s) => s.statKey !== currentKey).map((s) => s.statKey));
    return STAT_FIELDS.filter((f) => secondaryRange(f.key) && !taken.has(f.key));
  }

  function handleRemove() {
    if (!confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    onRemove();
  }
</script>

<div class="pet-card rarity-card {rarityClass(pet.rarity)}" class:editing>
  {#if editing}
    <select
      class="companion-select"
      value={pet.companionId ?? ''}
      aria-label="Companion"
      onchange={(e) => onCompanion(e.target.value || null)}
    >
      <option value="">— pick a companion —</option>
      {#each companions as c (c.id)}<option value={c.id}>{c.name} · {c.rarity}</option>{/each}
    </select>
  {:else}
    <h3 class="rarity-title">{pet.name}</h3>
  {/if}

  {#if art}
    <img class="pet-art" src={art} alt="" loading="lazy" />
  {/if}

  {#if def}
    <p class="base-stats">
      Attack: <span class="stat-num">{formatStat('attack', attack)}</span>
      <span class="sep">|</span>
      Health: <span class="stat-num">{formatStat('health', health)}</span>
    </p>

    <div class="secondaries">
      <span class="micro-label">SECONDARY {pet.secondaries.length}/{slots}</span>

      {#each pet.secondaries as sec, i (i)}
        {@const range = secondaryRange(sec.statKey)}
        {#if editing}
          <div class="sec-edit">
            <select
              value={sec.statKey}
              aria-label="Secondary stat {i + 1}"
              onchange={(e) => onSecondaryKey(i, e.target.value)}
            >
              {#each available(sec.statKey) as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
            </select>
            {#if range?.manual}
              <input
                class="sec-manual"
                type="text"
                inputmode="decimal"
                value={formatStat(sec.statKey, sec.value)}
                aria-label="{statLabel(sec.statKey)} value"
                onchange={(e) => onSecondaryValue(i, parseStat(sec.statKey, e.target.value))}
              />
            {:else if range}
              <div class="sec-slider">
                <Slider
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={sec.value}
                  ariaLabel="{statLabel(sec.statKey)} value"
                  oninput={(v) => onSecondaryValue(i, v)}
                />
                <span class="sec-value">{formatStat(sec.statKey, sec.value)}</span>
              </div>
            {/if}
            <button type="button" class="drop-sec" aria-label="Remove secondary" onclick={() => onSecondaryKey(i, '')}>×</button>
          </div>
        {:else}
          <p class="sec-line">
            <span class="sec-name">{statLabel(sec.statKey)}:</span>
            <span class="sec-num">+{formatStat(sec.statKey, sec.value)}%</span>
          </p>
        {/if}
      {/each}

      {#if editing && pet.secondaries.length < slots}
        <select
          class="add-sec"
          value=""
          aria-label="Add secondary stat"
          onchange={(e) => e.target.value && onSecondaryKey(pet.secondaries.length, e.target.value)}
        >
          <option value="">+ add secondary…</option>
          {#each available(null) as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      {/if}
    </div>
  {:else if editing}
    <p class="hint">Pick a companion to see its stats.</p>
  {:else}
    <p class="hint">No companion chosen.</p>
  {/if}

  <p class="used-by">{usedBy.length ? `used by ${usedBy.join(', ')}` : 'unused'}</p>

  <div class="card-foot">
    {#if !confirming}
      <button type="button" class="btn-ghost" onclick={onToggleEdit}>{editing ? 'Save' : 'Edit'}</button>
    {/if}
    <button
      type="button"
      class="btn-danger is-expanding"
      class:is-confirming={confirming}
      onclick={handleRemove}
      onblur={() => (confirming = false)}
    >
      {confirming ? 'Confirm remove' : 'Remove'}
    </button>
  </div>
</div>

<style>
  .pet-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .pet-card.editing {
    outline: 1px solid var(--color-gold);
    outline-offset: -1px;
  }

  .rarity-title {
    margin: 0;
  }
  .companion-select {
    width: 100%;
  }

  .pet-art {
    display: block;
    width: 84px;
    height: 84px;
    margin: 0 auto;
    object-fit: contain;
    outline: 1px solid rgba(0, 0, 0, 0.25);
    outline-offset: -1px;
    border-radius: var(--radius-field);
  }

  .base-stats {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--color-soft);
  }
  .stat-num {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .sep {
    color: var(--color-dim);
    margin: 0 4px;
  }

  .secondaries {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--color-inset);
    border-radius: var(--radius-field);
    padding: 6px 8px;
  }

  .sec-edit {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 4px;
    position: relative;
  }
  .sec-edit select {
    width: 100%;
    font-size: 11.5px;
  }
  .sec-slider {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Manual secondaries (no scraped range to slide within) - see petsData.js. */
  .sec-manual {
    width: 100%;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }
  .sec-slider :global(.slider) {
    flex: 1;
    min-width: 0;
  }
  .sec-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-soft);
    min-width: 40px;
    text-align: right;
  }
  .drop-sec {
    position: absolute;
    top: 0;
    right: 0;
    background: none;
    border: none;
    color: var(--color-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 2px 4px;
  }
  .drop-sec:hover {
    color: var(--color-danger);
  }

  .sec-line {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 11.5px;
  }
  .sec-name {
    color: var(--color-muted);
  }
  .sec-num {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }

  .hint,
  .used-by {
    margin: 0;
    font-size: 10.5px;
    color: var(--color-muted);
  }

  .card-foot {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
  }
  .card-foot .btn-ghost {
    flex: 1;
  }
  .card-foot button {
    font-size: 11px;
  }

  @media (max-width: 700px) {
    .card-foot button {
      min-height: 44px;
    }
  }
</style>
