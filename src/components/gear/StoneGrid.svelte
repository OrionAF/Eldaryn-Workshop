<script>
  /**
   * StoneGrid.svelte - one pool of enchant stones as a grid of tiles (adapted from the v1 grid).
   * Display order: socketed first, then rarest type first, then quality descending; the stored
   * array is never reordered. Props:
   *   stones          the pool (character.enchantStones or .oblivionEnchantStones)
   *   sets            the sets that draw from this pool: [{ key, label, enchantSlots }]
   *   selectedStoneId, onSelect(id | null), equippedStoneId (stone in the selected slot: gold ring)
   */
  import { STONE_TYPES, oblivionGrade } from '../../lib/game/stones.js';
  import { slotLabel, statLabel, formatStatValue, STONE_COLOR } from './gearFormat.js';
  import { BASE_SLOTS } from '../../lib/game/gear.js';

  let { stones, sets, cls = null, selectedStoneId = null, onSelect, equippedStoneId = null } = $props();

  const typeRank = new Map(STONE_TYPES.map((t, i) => [t.enum, i]));
  const socketedIds = $derived(new Set(sets.flatMap((s) => BASE_SLOTS.map((slot) => s.enchantSlots[slot]).filter(Boolean))));
  const sorted = $derived(
    [...stones].sort((a, b) => {
      const bySocketed = (socketedIds.has(b.id) ? 1 : 0) - (socketedIds.has(a.id) ? 1 : 0);
      if (bySocketed !== 0) return bySocketed;
      const byType = (typeRank.get(b.type) ?? -1) - (typeRank.get(a.type) ?? -1);
      return byType !== 0 ? byType : (b.quality ?? 0) - (a.quality ?? 0);
    }),
  );

  function typeName(t) {
    return STONE_TYPES.find((x) => x.enum === t)?.name ?? t;
  }
  /** PVP stats first, then the rest in stored order. */
  function lines(stone) {
    const pvp = (s) => (s.type.startsWith('PVP') ? 0 : 1);
    return [...stone.stats].sort((a, b) => pvp(a) - pvp(b));
  }
  function socketStatus(stoneId) {
    return sets
      .map((s) => {
        const slot = BASE_SLOTS.find((x) => s.enchantSlots[x] === stoneId);
        return `${s.label}: ${slot ? slotLabel(cls, slot) : 'No'}`;
      })
      .join(' | ');
  }
</script>

<div class="stone-grid">
  {#if stones.length === 0}
    <p class="empty-hint">No stones added yet.</p>
  {:else}
    {#each sorted as stone (stone.id)}
      {@const sc = STONE_COLOR[stone.type]}
      <button
        type="button"
        class="stone-tile"
        class:selected={selectedStoneId === stone.id}
        class:equipped={equippedStoneId === stone.id}
        style="--tile-color: {sc?.color}; --tile-tint: {sc?.tint}"
        onclick={() => onSelect(selectedStoneId === stone.id ? null : stone.id)}
        aria-pressed={selectedStoneId === stone.id}
      >
        <span class="stone-head">
          <span class="stone-type">{typeName(stone.type)}</span>
          <span class="stone-quality mono">{stone.quality != null ? `Q${stone.quality}` : 'Q?'}</span>
        </span>
        {#if stone.amplifyLevel > 0 || stone.oblivionLevel}
          <span class="stone-tags mono">
            {#if stone.oblivionLevel}<span>Grade {stone.oblivionLevel} {oblivionGrade(stone.oblivionLevel)?.grade ?? ''}</span>{/if}
            {#if stone.amplifyLevel > 0}<span>+{stone.amplifyLevel}</span>{/if}
          </span>
        {/if}
        {#each lines(stone) as line (line.type)}
          <span class="stone-stat">
            <span class="stat-label">{statLabel(line.type)}</span>
            <span class="stat-value">{formatStatValue(line.type, line.value)}</span>
          </span>
        {/each}
        <span class="stone-socketed">{socketStatus(stone.id)}</span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .stone-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
    gap: var(--space-2);
  }
  .stone-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-2);
    background: var(--color-inset);
    border: 1px solid var(--tile-color, var(--color-border));
    border-radius: 7px;
    text-align: left;
    color: var(--color-soft);
    min-width: 0;
  }
  .stone-tile:hover,
  .stone-tile.selected {
    background: var(--tile-tint, var(--color-field));
  }
  .stone-tile.selected {
    box-shadow: 0 0 0 1px var(--tile-color, var(--color-gold));
  }
  .stone-tile.equipped {
    border-color: var(--color-gold);
    box-shadow: 0 0 0 1px var(--color-gold);
  }
  .stone-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
  }
  .stone-type {
    font-weight: 600;
    font-size: 11.5px;
    color: var(--tile-color, var(--color-soft));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .stone-quality {
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .stone-tags {
    display: flex;
    gap: var(--space-2);
    font-size: 10.5px;
    color: var(--color-gold-light);
  }
  .stone-stat {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    font-size: 10.5px;
  }
  .stat-label {
    color: var(--color-dim);
  }
  .stat-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-soft);
    white-space: nowrap;
  }
  .stone-socketed {
    font-weight: 700;
    font-size: 10px;
    color: var(--color-ink);
  }
  .empty-hint {
    color: var(--color-muted);
  }
</style>
