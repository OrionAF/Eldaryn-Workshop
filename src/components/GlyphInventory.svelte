<script>
  /**
   * GlyphInventory.svelte - owned Mount Glyphs (unlimited to own; up to 3
   * Minor/2 Major/1 Mythic equipped at once - see rosterStore's
   * setGlyphEquipped for the tier-cap enforcement this UI surfaces).
   * Each glyph grants exactly one stat (assumption: higher rarity = bigger
   * numbers on the same stat pool, not multiple stats - unconfirmed, see
   * the Phase 1 plan). Stat dropdown is percentage fields only - every
   * observed glyph example is a %, no flat-stat glyph seen yet.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS, SOURCE_DEFS } from '../lib/constants.js';
  import { formatPct, parsePct } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';

  const PCT_FIELDS = STAT_FIELDS.filter((f) => f.kind === 'pct');
  const TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'mountGlyphs').tierCaps;
  const TIERS = ['minor', 'major', 'mythic'];
  const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

  let newTier = $state('minor');
  let newStatKey = $state(PCT_FIELDS[0].key);
  let newValue = $state('');
  let equipError = $state('');

  const glyphs = $derived(rosterStore.current.sources.mountGlyphs);

  function equippedCount(tier) {
    return glyphs.entries.filter((g) => g.tier === tier && g.equipped).length;
  }

  function addGlyph() {
    rosterStore.addMountGlyph(newTier, newStatKey, parsePct(newValue));
    newValue = '';
  }

  function toggleEquip(glyph) {
    equipError = '';
    const ok = rosterStore.setGlyphEquipped(glyph.id, !glyph.equipped);
    if (!ok) {
      equipError = `Already have ${TIER_CAPS[glyph.tier]} ${TIER_LABELS[glyph.tier]} glyph(s) equipped - unequip one first.`;
    }
  }

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }
</script>

<div class="glyph-inventory">
  <div class="add-form">
    <select bind:value={newTier}>
      {#each TIERS as t (t)}<option value={t}>{TIER_LABELS[t]}</option>{/each}
    </select>
    <select bind:value={newStatKey}>
      {#each PCT_FIELDS as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
    </select>
    <input type="text" placeholder="Value (e.g. 4.1)" bind:value={newValue} />
    <button type="button" onclick={addGlyph}>Save to Inventory</button>
  </div>

  <div class="tier-counters">
    {#each TIERS as t (t)}
      <span>{TIER_LABELS[t]}: {equippedCount(t)}/{TIER_CAPS[t]} equipped</span>
    {/each}
  </div>

  {#if equipError}
    <p class="equip-error" role="alert">{equipError}</p>
  {/if}

  {#if glyphs.entries.length === 0}
    <p class="empty-hint">No glyphs added yet.</p>
  {:else}
    <ul class="entry-list">
      {#each glyphs.entries as glyph (glyph.id)}
        <li class:equipped={glyph.equipped}>
          <span class="glyph-label">{TIER_LABELS[glyph.tier]} - +{formatPct(glyph.value)}% {statLabel(glyph.statKey)}</span>
          <label class="equip-checkbox">
            <input type="checkbox" checked={glyph.equipped} onchange={() => toggleEquip(glyph)} />
            Equipped
          </label>
          <ConfirmButton
            label="Remove"
            confirmLabel="Confirm remove"
            onConfirm={() => rosterStore.removeMountGlyph(glyph.id)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .add-form {
    display: flex;
    gap: var(--space-2, 0.5rem);
    margin-bottom: var(--space-3, 0.75rem);
    flex-wrap: wrap;
  }
  .tier-counters {
    display: flex;
    gap: var(--space-6, 1.5rem);
    color: var(--color-muted, #999);
    font-size: 0.85rem;
    margin-bottom: var(--space-3, 0.75rem);
  }
  .equip-error {
    color: var(--color-danger, #e05252);
  }
  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.4rem);
  }
  .entry-list li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.4rem);
    border: 1px solid var(--color-border, #444);
    border-radius: var(--radius, 4px);
  }
  .entry-list li.equipped {
    border-color: var(--color-accent, #7aa2f7);
  }
  .glyph-label {
    flex: 1;
    font-family: var(--font-data, monospace);
  }
  .equip-checkbox {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .empty-hint {
    color: var(--color-muted, #999);
  }
</style>
