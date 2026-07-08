<script>
  /**
   * StoneGrid.svelte - the "Socketed Stones" inventory: an auto-expanding
   * grid of tiles (not a list), one per Character.stoneInventory entry,
   * color-coded by stonesData.js's STONE_TYPES. Tiles are display-sorted:
   * socketed stones (in either loadout) first, then by stone type (rarest
   * first: Mythic > Eldaryn > Azure > Crimson > Verdant), then quality
   * descending - the underlying stoneInventory array is never reordered.
   * `equippedStoneId` (the stone in the parent's currently selected slot)
   * gets a gold "this is the one in that slot" ring, separate from the
   * click-selection highlight. Clicking a tile selects it
   * (clicking the already-selected tile deselects) - the parent
   * (GearLoadoutsScreen) uses that selection to drive StoneForm's Details
   * mode and the socketing flow. This component is purely a picker/summary;
   * add/edit/remove/socket actions all live in StoneForm.
   */
  import { STAT_FIELDS, SLOTS } from '../lib/constants.js';
  import { formatStat } from '../lib/format.js';
  import { STONE_TYPES, stoneTypeDef } from '../lib/stonesData.js';

  let { stoneInventory, loadouts, selectedStoneId, onSelect, equippedStoneId = null } = $props();

  const PVP_KEYS = ['pvp_attack', 'pvp_defense'];
  /* PVP Attack, then PVP Defense, then every other field in STAT_FIELDS order. */
  const STONE_STAT_ORDER = [
    ...PVP_KEYS.map((key) => STAT_FIELDS.find((f) => f.key === key)),
    ...STAT_FIELDS.filter((f) => !PVP_KEYS.includes(f.key)),
  ];

  /* Rarest type first: Mythic > Eldaryn > Azure > Crimson > Verdant (reverse
     STONE_TYPES order); unknown types sink to the bottom. */
  const typeRank = new Map(STONE_TYPES.map((t, i) => [t.key, i]));
  /** Every stone id currently socketed in any slot of any loadout. */
  const socketedIds = $derived(
    new Set(loadouts.flatMap((l) => SLOTS.map((slot) => l.socketedStones[slot]).filter(Boolean)))
  );
  const sortedInventory = $derived(
    [...stoneInventory].sort((a, b) => {
      const bySocketed = (socketedIds.has(b.id) ? 1 : 0) - (socketedIds.has(a.id) ? 1 : 0);
      if (bySocketed !== 0) return bySocketed;
      const byType = (typeRank.get(b.type) ?? -1) - (typeRank.get(a.type) ?? -1);
      return byType !== 0 ? byType : b.quality - a.quality;
    })
  );

  /** One display line per non-zero stat: full label + signed value ("%" lives on the value, not the label). */
  function statLines(stone) {
    return STONE_STAT_ORDER.filter((f) => (stone.stats[f.key] || 0) !== 0).map((f) => {
      const raw = stone.stats[f.key];
      const value = (raw > 0 ? '+' : '') + formatStat(f.key, raw) + (f.kind === 'pct' ? '%' : '');
      return { key: f.key, label: f.label.replace(/\s*%$/, ''), value };
    });
  }

  /** Which slot (if any) this stone occupies in one loadout - "No" if none. */
  function socketedSlot(loadout, stoneId) {
    return SLOTS.find((slot) => loadout.socketedStones[slot] === stoneId) || 'No';
  }

  /** "L1: Head | L2: No" - positionally Loadout 1 | Loadout 2. */
  function socketStatus(stoneId) {
    return loadouts.map((l, i) => `L${i + 1}: ${socketedSlot(l, stoneId)}`).join(' | ');
  }
</script>

<div class="stone-grid">
  {#if stoneInventory.length === 0}
    <p class="empty-hint">No stones added yet.</p>
  {:else}
    {#each sortedInventory as stone (stone.id)}
      {@const def = stoneTypeDef(stone.type)}
      <button
        type="button"
        class="stone-tile"
        class:selected={selectedStoneId === stone.id}
        class:equipped={equippedStoneId === stone.id}
        style="--tile-color: {def?.color}; --tile-tint: {def?.tint}"
        onclick={() => onSelect(selectedStoneId === stone.id ? null : stone.id)}
        aria-pressed={selectedStoneId === stone.id}
      >
        {#if selectedStoneId === stone.id}
          <span class="selected-dot"></span>
        {/if}
        <span class="stone-head">
          <span class="stone-type">{def?.label ?? stone.type}</span>
          <span class="stone-quality">Q{stone.quality}</span>
        </span>
        {#each statLines(stone) as line (line.key)}
          <span class="stone-stat">
            <span class="stat-label">{line.label}</span>
            <span class="stat-value">{line.value}</span>
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
    /* 172px min fits the longest name ("Mythic Soulstone") + "Q100" on one
       line - the head row below never wraps. */
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
    border-radius: var(--radius-field, 7px);
    text-align: left;
    color: var(--color-soft);
    min-width: 0;
  }
  .stone-tile:hover {
    background: var(--tile-tint, var(--color-field));
  }
  .stone-tile.selected {
    background: var(--tile-tint, var(--color-field));
    box-shadow: 0 0 0 1px var(--tile-color, var(--color-gold));
  }
  /* The stone socketed in the parent's currently selected gear slot - gold
     (the app-wide "active" signal), overriding the type-colored selection
     ring when a tile is both. */
  .stone-tile.equipped {
    border-color: var(--color-gold);
    box-shadow: 0 0 0 1px var(--color-gold);
  }
  /* Which tile is currently selected - separate from the type-colored border
     above, so "selected" reads clearly even for the greener/bluer stone types. */
  .selected-dot {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: #facc15;
  }
  .stone-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    /* Keep the selected-dot from overlapping the quality badge. */
    padding-right: 0.6rem;
  }
  .stone-type {
    font-weight: 600;
    font-size: 11.5px;
    color: var(--tile-color, var(--color-soft));
    /* Never wrap under the quality badge; ellipsize in the extreme case
       (very narrow phone) rather than break to a second line. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .stone-quality {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
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
