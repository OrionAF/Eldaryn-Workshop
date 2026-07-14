<script>
  /**
   * MountAndGlyphsScreen.svelte - one screen, two sections (no nested tabs):
   * Mounts (fixed catalogue - the player only enters each mount's base
   * HP%/ATK% here; which mount is ridden is chosen per preset in the Presets
   * editor) and Glyph Inventory (tier-capped equip, character-wide).
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { GLYPH_RARITIES, SPECIAL_GLYPHS, STAT_FIELDS, SOURCE_DEFS } from '../lib/constants.js';
  import { formatPct, parsePct } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';

  const character = $derived(rosterStore.current);
  const mounts = $derived(character.mounts);
  const glyphs = $derived(character.glyphs);

  const PCT_FIELDS = STAT_FIELDS.filter((f) => f.kind === 'pct');
  const TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;
  const TIERS = ['minor', 'major', 'mythic'];
  const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

  // Special glyph options are encoded as 'special:<id>' values in the stat
  // select, offered only for their own tier (Ember Curse is a Major glyph).
  const SPECIAL_PREFIX = 'special:';

  let newGlyphTier = $state('minor');
  let newGlyphRarity = $state('Common');
  let newGlyphStatKey = $state(PCT_FIELDS[0].key);
  let newGlyphValue = $state('');
  let glyphError = $state('');

  const tierSpecials = $derived(SPECIAL_GLYPHS.filter((s) => s.tier === newGlyphTier));
  const newGlyphIsSpecial = $derived(newGlyphStatKey.startsWith(SPECIAL_PREFIX));

  // Changing tier away from a special's tier invalidates a selected special option.
  $effect(() => {
    if (newGlyphIsSpecial && !tierSpecials.some((s) => SPECIAL_PREFIX + s.id === newGlyphStatKey)) {
      newGlyphStatKey = PCT_FIELDS[0].key;
    }
  });

  function equippedCount(tier) {
    return glyphs.entries.filter((g) => g.tier === tier && g.equipped).length;
  }

  function addGlyph() {
    if (newGlyphIsSpecial) {
      rosterStore.addMountGlyph(newGlyphTier, PCT_FIELDS[0].key, 0, {
        rarity: newGlyphRarity,
        special: newGlyphStatKey.slice(SPECIAL_PREFIX.length),
      });
    } else {
      rosterStore.addMountGlyph(newGlyphTier, newGlyphStatKey, parsePct(newGlyphValue), { rarity: newGlyphRarity });
    }
    newGlyphValue = '';
  }

  function specialName(id) {
    return SPECIAL_GLYPHS.find((s) => s.id === id)?.name ?? id;
  }

  function specialDescription(id) {
    return SPECIAL_GLYPHS.find((s) => s.id === id)?.description ?? '';
  }

  function toggleGlyphEquip(glyph) {
    glyphError = '';
    const ok = rosterStore.setGlyphEquipped(glyph.id, !glyph.equipped);
    if (!ok) {
      glyphError = `Already have ${TIER_CAPS[glyph.tier]} ${TIER_LABELS[glyph.tier]} glyph(s) socketed — unsocket one first.`;
    }
  }

  function statLabel(key) {
    return STAT_FIELDS.find((f) => f.key === key)?.label ?? key;
  }
</script>

<div class="header-row">
  <h2>Mount &amp; Glyphs</h2>
  <p class="hint">mount stats entered once per character — each preset picks its own ridden mount; glyph sockets shared by all presets</p>
</div>

<section class="mounts-section">
  <p class="mounts-hint">Enter each mount's base HP%/ATK% as shown in-game — pick which mount each preset rides in the Presets editor.</p>
  <ul class="entry-list">
    {#each mounts.entries as mount (mount.id)}
      <li>
        <span class="row-name">{mount.name}</span>
        <span class="rarity-label">{mount.rarity}</span>
        <label class="base-stat">
          HP%
          <input type="text" inputmode="decimal" value={formatPct(mount.baseHpPct)} onblur={(e) => rosterStore.updateMount(mount.id, 'baseHpPct', parsePct(e.target.value))} />
        </label>
        <label class="base-stat">
          ATK%
          <input type="text" inputmode="decimal" value={formatPct(mount.baseAtkPct)} onblur={(e) => rosterStore.updateMount(mount.id, 'baseAtkPct', parsePct(e.target.value))} />
        </label>
      </li>
    {/each}
  </ul>
</section>

<h3 class="glyphs-heading subheading">Glyph Inventory</h3>
<section class="glyphs-section">
  <div class="add-form">
    <select aria-label="Tier" bind:value={newGlyphTier}>
      {#each TIERS as t (t)}<option value={t}>{TIER_LABELS[t]}</option>{/each}
    </select>
    <select aria-label="Rarity" bind:value={newGlyphRarity}>
      {#each GLYPH_RARITIES as r (r)}<option value={r}>{r}</option>{/each}
    </select>
    <select aria-label="Stat" bind:value={newGlyphStatKey}>
      {#each PCT_FIELDS as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
      {#each tierSpecials as s (s.id)}<option value={SPECIAL_PREFIX + s.id}>{s.name} (special)</option>{/each}
    </select>
    {#if !newGlyphIsSpecial}
      <input type="text" inputmode="decimal" placeholder="Value (e.g. 4.1)" aria-label="Value" bind:value={newGlyphValue} />
    {/if}
    <button type="button" class="btn-gold" onclick={addGlyph}>Save to Inventory</button>
  </div>

  <div class="tier-counters">
    {#each TIERS as t (t)}
      <span>{TIER_LABELS[t]} {equippedCount(t)}/{TIER_CAPS[t]}</span>
    {/each}
  </div>

  {#if glyphError}
    <p class="glyph-error" role="alert">{glyphError}</p>
  {/if}

  {#if glyphs.entries.length === 0}
    <p class="empty-hint">No glyphs added yet.</p>
  {:else}
    <ul class="entry-list">
      {#each glyphs.entries as glyph (glyph.id)}
        <li class:equipped={glyph.equipped}>
          {#if glyph.special}
            <span class="glyph-label">{TIER_LABELS[glyph.tier]} · {glyph.rarity} — {specialName(glyph.special)} <span class="glyph-special-note">{specialDescription(glyph.special)}</span></span>
          {:else}
            <span class="glyph-label">{TIER_LABELS[glyph.tier]} · {glyph.rarity} — +{formatPct(glyph.value)}% {statLabel(glyph.statKey)}</span>
          {/if}
          <label class="equip-checkbox">
            <input type="checkbox" checked={glyph.equipped} onchange={() => toggleGlyphEquip(glyph)} />
            Socketed
          </label>
          <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" onConfirm={() => rosterStore.removeMountGlyph(glyph.id)} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .header-row {
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    margin: 0;
  }
  .hint {
    font-size: 11px;
    color: var(--color-dim);
    margin: 2px 0 0;
  }
  .glyphs-heading {
    margin-top: var(--space-6);
  }
  .add-form {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .tier-counters {
    display: flex;
    gap: 18px;
    color: var(--color-muted);
    font-family: var(--font-data);
    font-size: 11.5px;
    margin-bottom: var(--space-3);
  }
  .glyph-error {
    color: var(--color-downgrade);
    font-size: 12px;
  }
  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .entry-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    flex-wrap: wrap;
  }
  .entry-list li.equipped {
    border-color: var(--color-gold);
  }
  .mounts-hint {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0 0 var(--space-2);
  }
  .row-name {
    flex: 1;
    min-width: 6rem;
    font-size: 13px;
  }
  .rarity-label {
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
    min-width: 5.5rem;
  }
  .base-stat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 11px;
    color: var(--color-muted);
  }
  .base-stat input {
    width: 56px;
    text-align: right;
    font-size: 12.5px;
    font-family: var(--font-data);
  }
  .glyph-label {
    flex: 1;
    font-family: var(--font-data);
    font-size: 12px;
  }
  .glyph-special-note {
    display: block;
    color: var(--color-muted);
    font-family: var(--font-ui);
    font-size: 11px;
  }
  .equip-checkbox {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .empty-hint {
    color: var(--color-muted);
  }
</style>
