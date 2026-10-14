<script>
  /**
   * SigilCard.svelte - one sigil in the collection: ownership level (0 = not owned), the flat
   * Attack/Health it grants at the character's Altar tier, and its spell numbers at that level.
   * All numbers are derived (engine/sources/sigilScale); the only input is the level. Ancients are
   * unique and stay level 1, so they get an owned toggle instead of a stepper.
   * Adapted from the v1 components/SigilsScreen.svelte card.
   */
  import { rarityClass } from '../../lib/constants.js';
  import { formatFlat } from '../../lib/format.js';
  import { sigilImage } from '../../lib/assets.js';
  import { MAX_SIGIL_LEVEL } from '../../lib/model/sigils.js';
  import { getSigilBonusAttack, getSigilBonusHp } from '../../lib/engine/sources/sigilScale.js';
  import { sigilSpellBlocks } from './sigilView.js';

  let { def, level = 0, tier = 1, spec = null, usedBy = [], note = '', onLevel = () => {} } = $props();

  const owned = $derived(level > 0);
  const ancient = $derived(def.rarity === 'Ancient');
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

  {#if ancient}
    <label class="owned-toggle">
      <input type="checkbox" checked={owned} aria-label="{def.name} owned" onchange={(e) => onLevel(def.species, e.currentTarget.checked ? 1 : 0)} />
      <span>{owned ? 'Unlocked (level 1)' : 'Not unlocked'}</span>
    </label>
  {:else}
    <div class="level-row">
      <div class="rank-controls">
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

  <div class="effects">
    {#each blocks as block (block.form ?? 'base')}
      {#if block.rows.length || block.title}
        <div class="effect">
          <span class="micro-label">{block.type}{block.form ? ` · ${block.form}` : ''}{block.title ? ` · ${block.title}` : ''}</span>
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

  {#if note}<p class="notes">{note}</p>{/if}

  <div class="card-foot">
    <span class="used-by">{usedBy.length ? `in ${usedBy.join(', ')}` : 'unequipped'}</span>
  </div>
</div>

<style>
  .sigil-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .sigil-card.unowned {
    opacity: 0.6;
  }
  .rarity-title {
    margin: 0;
  }
  .sigil-art {
    display: block;
    width: 64px;
    height: 64px;
    margin: 0 auto;
    object-fit: contain;
    border-radius: var(--radius-field);
  }
  .level-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .rank-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .level-input {
    width: 42px;
    text-align: center;
    padding: 4px 2px;
  }
  .level-caption {
    font-size: 11px;
    color: var(--color-muted);
  }
  .owned-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--color-soft);
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
  .effects {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .effect {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: var(--color-inset);
    border-radius: var(--radius-field);
    padding: 6px 8px;
  }
  .stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 11.5px;
  }
  .stat-name {
    color: var(--color-muted);
  }
  .derived-stat {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-gold-light);
  }
  .timing {
    font-size: 10.5px;
    color: var(--color-dim);
  }
  .notes {
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--color-muted);
  }
  .card-foot {
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
    font-size: 10px;
  }
  .used-by {
    color: var(--color-muted);
  }
</style>
