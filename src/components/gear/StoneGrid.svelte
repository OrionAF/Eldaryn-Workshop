<script>
  /**
   * StoneGrid.svelte - one pool of enchant stones as a grid of tiles (adapted from the v1 grid).
   * Display order: socketed first, then rarest type first, then quality descending; the stored
   * array is never reordered. Each tile grades its roll (model/stones.js stoneRollGrade): a letter
   * and mean % of range, plus one bar per stat. Props:
   *   stones          the pool (character.enchantStones or .oblivionEnchantStones)
   *   sets            the sets that draw from this pool: [{ key, label, enchantSlots }]
   *   selectedStoneId, onSelect(id | null), equippedStoneId (stone in the selected slot: gold ring)
   */
  import { STONE_TYPES, oblivionGrade } from '../../lib/game/stones.js';
  import { slotLabel, statLabel, formatStatValue, STONE_COLOR } from './gearFormat.js';
  import { BASE_SLOTS } from '../../lib/game/gear.js';
  import { statRollFraction, stoneRollGrade } from '../../lib/model/stones.js';

  let { stones, sets, cls = null, selectedStoneId = null, onSelect, equippedStoneId = null, typeFilter = '', sortBy = 'default' } = $props();

  const typeRank = new Map(STONE_TYPES.map((t, i) => [t.enum, i]));
  const socketedIds = $derived(new Set(sets.flatMap((s) => BASE_SLOTS.map((slot) => s.enchantSlots[slot]).filter(Boolean))));
  const grades = $derived(new Map(stones.map((s) => [s.id, stoneRollGrade(s)])));
  const sorted = $derived(
    [...stones.filter((x) => !typeFilter || x.type === typeFilter)].sort((a, b) => {
      if (sortBy === 'quality') return (b.quality ?? 0) - (a.quality ?? 0);
      if (sortBy === 'roll') return (grades.get(b.id)?.fraction ?? -1) - (grades.get(a.id)?.fraction ?? -1);
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
  const pct = (f) => `${Math.round(f * 100)}%`;
</script>

<div class="stone-grid">
  {#if stones.length === 0}
    <p class="empty-note">No stones added yet.</p>
  {:else}
    {#each sorted as stone (stone.id)}
      {@const sc = STONE_COLOR[stone.type]}
      {@const roll = grades.get(stone.id)}
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
        {#if roll}
          <span class="stone-roll" title="Mean position of each stat in its possible range">
            <span class="roll-grade grade-{roll.grade}">{roll.grade}</span>
            <span class="roll-pct mono">Roll {pct(roll.fraction)}</span>
          </span>
        {/if}
        {#if stone.amplifyLevel > 0 || stone.oblivionLevel || !stone.activated}
          <span class="stone-tags mono">
            {#if !stone.activated}<span>Inactive</span>{/if}
            {#if stone.oblivionLevel}<span>Grade {stone.oblivionLevel} {oblivionGrade(stone.oblivionLevel)?.grade ?? ''}</span>{/if}
            {#if stone.amplifyLevel > 0}<span>+{stone.amplifyLevel}</span>{/if}
          </span>
        {/if}
        {#each lines(stone) as line (line.type)}
          {@const f = statRollFraction(line.type, line.value)}
          <span class="stone-stat">
            <span class="stat-label">{statLabel(line.type)}</span>
            <span class="stat-value">{formatStatValue(line.type, line.value)}</span>
            {#if f != null}
              <span class="stat-bar" title="{pct(f)} of range"><span class="stat-fill" style="width: {pct(f)}"></span></span>
            {/if}
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
    gap: var(--sp-2);
  }
  .stone-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--sp-2);
    background: var(--surface-1);
    border: 1px solid var(--tile-color, var(--line-rule));
    border-radius: var(--r-2);
    text-align: left;
    color: var(--text-soft);
    min-width: 0;
  }
  .stone-tile:hover,
  .stone-tile.selected {
    background: var(--tile-tint, var(--surface-3));
  }
  .stone-tile.selected {
    box-shadow: 0 0 0 1px var(--tile-color, var(--brass-400));
  }
  .stone-tile.equipped {
    border-color: var(--brass-400);
    box-shadow: 0 0 0 1px var(--brass-400);
  }
  .stone-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--sp-2);
    width: 100%;
  }
  .stone-type {
    font-weight: 600;
    font-size: var(--fs-12);
    color: var(--tile-color, var(--text-soft));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .stone-quality {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .stone-tags {
    display: flex;
    gap: var(--sp-2);
    font-size: var(--fs-11);
    color: var(--brass-200);
  }
  .stone-roll {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--fs-11);
    color: var(--text-muted);
  }
  .roll-grade {
    font-weight: 700;
    font-size: var(--fs-12);
  }
  .grade-S {
    color: var(--brass-200);
  }
  .grade-A {
    color: var(--brass-400);
  }
  .grade-B {
    color: var(--text-ink);
  }
  .grade-C {
    color: var(--text-soft);
  }
  .grade-D {
    color: var(--text-muted);
  }
  .stone-stat {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: var(--sp-2);
    width: 100%;
    font-size: var(--fs-11);
  }
  .stat-bar {
    grid-column: 1 / -1;
    height: 2px;
    margin-bottom: 2px;
    background: var(--line-hairline);
    border-radius: 1px;
    overflow: hidden;
  }
  .stat-fill {
    display: block;
    height: 100%;
    background: var(--tile-color, var(--brass-400));
  }
  .stat-label {
    color: var(--text-muted);
  }
  .stat-value {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--text-soft);
    white-space: nowrap;
  }
  .stone-socketed {
    font-weight: 700;
    font-size: var(--fs-11);
    color: var(--text-ink);
  }
  .empty-note {
    color: var(--text-muted);
  }
</style>
