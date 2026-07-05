<script>
  /**
   * MountAndGlyphsScreen.svelte - one screen, two sections (no nested tabs):
   * Mounts (character-scoped, one "riding" at a time) and Glyph Inventory
   * (tier-capped equip). Both character-wide, shared by every preset.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { RARITIES, STAT_FIELDS, SOURCE_DEFS } from '../lib/constants.js';
  import { formatPct, parsePct } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';
  import AddMountModal from './AddMountModal.svelte';

  const character = $derived(rosterStore.current);
  const mounts = $derived(character.mounts);
  const glyphs = $derived(character.glyphs);

  let showAddMountModal = $state(false);

  function addMount({ name, rarity, baseHpPct, baseAtkPct }) {
    rosterStore.addMount(name, rarity, baseHpPct, baseAtkPct);
    showAddMountModal = false;
  }

  const PCT_FIELDS = STAT_FIELDS.filter((f) => f.kind === 'pct');
  const TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;
  const TIERS = ['minor', 'major', 'mythic'];
  const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

  let newGlyphTier = $state('minor');
  let newGlyphStatKey = $state(PCT_FIELDS[0].key);
  let newGlyphValue = $state('');
  let glyphError = $state('');

  function equippedCount(tier) {
    return glyphs.entries.filter((g) => g.tier === tier && g.equipped).length;
  }

  function addGlyph() {
    rosterStore.addMountGlyph(newGlyphTier, newGlyphStatKey, parsePct(newGlyphValue));
    newGlyphValue = '';
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
  <p class="hint">character-wide — one mount ridden, glyph sockets shared by all presets</p>
</div>

<section class="mounts-section">
  <div class="add-form">
    <button type="button" class="btn-gold" onclick={() => (showAddMountModal = true)}>Add Mount</button>
  </div>

  {#if showAddMountModal}
    <AddMountModal onSave={addMount} onClose={() => (showAddMountModal = false)} />
  {/if}

  {#if mounts.entries.length === 0}
    <p class="empty-hint">No mounts added yet.</p>
  {:else}
    <ul class="entry-list">
      {#each mounts.entries as mount (mount.id)}
        <li class:selected={mounts.activeId === mount.id}>
          <label class="active-radio">
            <input type="radio" name="active-mount" checked={mounts.activeId === mount.id} onchange={() => rosterStore.setActiveMount(mount.id)} />
            Riding
          </label>
          <input type="text" class="row-name" value={mount.name} onblur={(e) => rosterStore.updateMount(mount.id, 'name', e.target.value)} />
          <select value={mount.rarity} onchange={(e) => rosterStore.updateMount(mount.id, 'rarity', e.target.value)}>
            {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
          </select>
          <label class="base-stat">
            HP%
            <input type="text" value={formatPct(mount.baseHpPct)} onblur={(e) => rosterStore.updateMount(mount.id, 'baseHpPct', parsePct(e.target.value))} />
          </label>
          <label class="base-stat">
            ATK%
            <input type="text" value={formatPct(mount.baseAtkPct)} onblur={(e) => rosterStore.updateMount(mount.id, 'baseAtkPct', parsePct(e.target.value))} />
          </label>
          <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" prompt={`Remove "${mount.name}"?`} onConfirm={() => rosterStore.removeMount(mount.id)} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<h3 class="glyphs-heading subheading">Glyph Inventory</h3>
<section class="glyphs-section">
  <div class="add-form">
    <select aria-label="Tier" bind:value={newGlyphTier}>
      {#each TIERS as t (t)}<option value={t}>{TIER_LABELS[t]}</option>{/each}
    </select>
    <select aria-label="Stat" bind:value={newGlyphStatKey}>
      {#each PCT_FIELDS as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
    </select>
    <input type="text" inputmode="decimal" placeholder="Value (e.g. 4.1)" aria-label="Value" bind:value={newGlyphValue} />
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
          <span class="glyph-label">{TIER_LABELS[glyph.tier]} — +{formatPct(glyph.value)}% {statLabel(glyph.statKey)}</span>
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
  .entry-list li.selected,
  .entry-list li.equipped {
    border-color: var(--color-gold);
  }
  .active-radio {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .row-name {
    flex: 1;
    min-width: 6rem;
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
