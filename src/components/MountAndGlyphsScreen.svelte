<script>
  /**
   * MountAndGlyphsScreen.svelte - the fixed mount catalogue (mountsData.js)
   * plus the character-wide glyph inventory.
   *
   * Two things moved in BigReworkV1:
   *  - a mount is owned exactly when it has a star level (star 0 = not owned);
   *    the old "owned" checkbox is gone.
   *  - glyphs are equipped per MOUNT, not per character. The inventory is
   *    still character-wide, but each mount carries its own 3 Minor / 2 Major
   *    / 1 Mythic loadout, and one glyph may sit on any number of mounts. That
   *    makes the choice strategic: the preset riding the high-HP mount can run
   *    defensive glyphs while another preset's mount runs offensive ones.
   *
   * Which mount a preset rides is still chosen in the Presets editor.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { GLYPH_RARITIES, STAT_FIELDS, SOURCE_DEFS, RARITIES } from '../lib/constants.js';
  import { MAJOR_GLYPH_FAMILIES, majorGlyphById, majorGlyphVariants } from '../lib/glyphsData.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import { glyphImage } from '../lib/assets.js';
  import { formatPct, parsePct } from '../lib/format.js';
  import MountCard from './MountCard.svelte';
  import GlyphCard from './GlyphCard.svelte';
  import GlyphPickerModal from './GlyphPickerModal.svelte';
  import EquippedInModal from './EquippedInModal.svelte';

  const TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;
  const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };
  const MOUNT_STAR_SLOTS = 5; // every mount shows five stars; data caps which are usable

  const character = $derived(rosterStore.current);
  const mounts = $derived(character.mounts.entries);
  const glyphs = $derived(character.glyphs.entries);

  // Add-glyph form state.
  let newTier = $state('minor');
  let newRarity = $state('Common');
  let newStatKey = $state('attack_pct');
  let newValue = $state('');
  let newMajorKey = $state(MAJOR_GLYPH_FAMILIES[0].key);
  let glyphError = $state('');

  // Modal state.
  let pickerMountId = $state(null);
  let equippedInGlyphId = $state(null);
  const pickerOpen = $derived(pickerMountId !== null);
  const equippedInOpen = $derived(equippedInGlyphId !== null);
  const pickerMount = $derived(mounts.find((m) => m.id === pickerMountId) ?? null);
  const equippedInGlyph = $derived(glyphs.find((g) => g.id === equippedInGlyphId) ?? null);

  const statFields = $derived(STAT_FIELDS.filter((f) => f.kind === 'pct'));
  // Across ALL classes, not just this character's: a glyph's target sigil is
  // fixed by the catalogue, so its name should render even before a class is
  // chosen (otherwise the card falls back to showing a raw slug).
  const SIGIL_NAMES = new Map(Object.values(SIGILS_BY_CLASS).flat().map((d) => [d.id, d.name]));
  const sigilNames = SIGIL_NAMES;
  /** Sigils equipped on ANY preset - a major glyph is only live if its sigil is. */
  const equippedSigilIds = $derived(new Set(character.presets.flatMap((p) => p.sigilIds || [])));

  /** Inventory grouped by tier, each sorted highest rarity first (BigReworkV1). */
  const glyphGroups = $derived(
    Object.keys(TIER_CAPS)
      .map((tier) => ({
        tier,
        items: glyphs
          .filter((g) => g.tier === tier)
          .toSorted((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity)),
      }))
      .filter((group) => group.items.length > 0),
  );

  function glyphSlotsFor(mount) {
    return (mount.glyphIds || []).map((id) => {
      const glyph = glyphs.find((g) => g.id === id);
      if (!glyph) return null;
      const major = majorGlyphById(glyph.special);
      return {
        art: glyphImage(glyph.tier, glyph.rarity),
        label: major ? `${major.name} (${glyph.rarity})` : `+${formatPct(glyph.value)}% ${glyph.statKey}`,
      };
    });
  }

  function mountCountFor(glyphId) {
    return mounts.filter((m) => (m.glyphIds || []).includes(glyphId)).length;
  }

  function addGlyph() {
    glyphError = '';
    if (newTier === 'major') {
      const variant = majorGlyphVariants(newMajorKey).find((v) => v.rarity === newRarity);
      if (!variant) {
        glyphError = 'That glyph has no such rarity.';
        return;
      }
      rosterStore.addMountGlyph('major', 'attack_pct', 0, { rarity: variant.rarity, special: variant.id });
    } else {
      rosterStore.addMountGlyph(newTier, newStatKey, parsePct(newValue), { rarity: newRarity });
    }
    newValue = '';
  }

  function toggleOnMount(mountId, glyphId, equipped) {
    if (!rosterStore.setMountGlyph(mountId, glyphId, equipped)) {
      const glyph = glyphs.find((g) => g.id === glyphId);
      glyphError = `That mount already has ${TIER_CAPS[glyph.tier]} ${TIER_LABELS[glyph.tier]} glyph(s) — remove one first.`;
    } else {
      glyphError = '';
    }
  }
</script>

<div class="header-row">
  <h2>Mounts &amp; Glyphs</h2>
  <p class="hint">
    a mount is owned once it has a star level · glyphs equip per mount ({TIER_CAPS.minor} minor /
    {TIER_CAPS.major} major / {TIER_CAPS.mythic} mythic each)
  </p>
</div>

<section class="mounts-section">
  <div class="mount-grid">
    {#each mounts as mount (mount.id)}
      <MountCard
        {mount}
        glyphs={glyphSlotsFor(mount)}
        totalStars={MOUNT_STAR_SLOTS}
        onStar={(star) => rosterStore.setMountStar(mount.id, star)}
        onValue={(field, value) => rosterStore.setMountValue(mount.id, field, value)}
        onOpenGlyphs={() => (pickerMountId = mount.id)}
      />
    {/each}
  </div>
</section>

<h3 class="subheading glyph-heading">Glyph Inventory</h3>

<section class="glyphs-section">
  <div class="add-form">
    <label>
      <span class="micro-label">TIER</span>
      <select bind:value={newTier}>
        {#each Object.keys(TIER_CAPS) as tier (tier)}<option value={tier}>{TIER_LABELS[tier]}</option>{/each}
      </select>
    </label>

    {#if newTier === 'major'}
      <label class="grow">
        <span class="micro-label">GLYPH</span>
        <select bind:value={newMajorKey}>
          {#each MAJOR_GLYPH_FAMILIES as family (family.key)}
            <option value={family.key}>{family.name} — {sigilNames.get(family.sigilId) ?? family.sigilId}</option>
          {/each}
        </select>
      </label>
    {:else}
      <label class="grow">
        <span class="micro-label">STAT</span>
        <select bind:value={newStatKey}>
          {#each statFields as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      </label>
      <label>
        <span class="micro-label">VALUE %</span>
        <input type="text" inputmode="decimal" bind:value={newValue} placeholder="0" aria-label="Glyph value" />
      </label>
    {/if}

    <label>
      <span class="micro-label">RARITY</span>
      <select bind:value={newRarity}>
        {#each GLYPH_RARITIES as r (r)}<option value={r}>{r}</option>{/each}
      </select>
    </label>

    <button type="button" class="btn-gold" onclick={addGlyph}>Add to Inventory</button>
  </div>

  {#if glyphError}
    <p class="glyph-error" role="status">{glyphError}</p>
  {/if}

  {#if !glyphs.length}
    <p class="empty-hint">No glyphs yet — add one above, then equip it on a mount.</p>
  {/if}

  {#each glyphGroups as group (group.tier)}
    <div class="glyph-group">
      <h4 class="micro-label">{TIER_LABELS[group.tier]}</h4>
      <div class="glyph-grid">
        {#each group.items as glyph (glyph.id)}
          {@const major = majorGlyphById(glyph.special)}
          <GlyphCard
            {glyph}
            {major}
            sigilName={major ? (sigilNames.get(major.sigilId) ?? major.sigilId) : null}
            sigilEquipped={!major || equippedSigilIds.has(major.sigilId)}
            mountCount={mountCountFor(glyph.id)}
            onEquippedIn={() => (equippedInGlyphId = glyph.id)}
            onRemove={() => rosterStore.removeMountGlyph(glyph.id)}
          />
        {/each}
      </div>
    </div>
  {/each}
</section>

<GlyphPickerModal
  open={pickerOpen}
  mount={pickerMount}
  {glyphs}
  onToggle={(glyphId, equipped) => toggleOnMount(pickerMountId, glyphId, equipped)}
/>
<EquippedInModal
  open={equippedInOpen}
  glyph={equippedInGlyph}
  {mounts}
  onToggle={(mountId, equipped) => toggleOnMount(mountId, equippedInGlyphId, equipped)}
/>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    pickerMountId = null;
    equippedInGlyphId = null;
  }}
/>

<style>
  .header-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
  h2 {
    font-family: var(--font-heading);
    margin: 0;
  }
  .hint {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .empty-hint {
    color: var(--color-muted);
    font-size: 12px;
  }

  .mount-grid {
    display: grid;
    /* Max 4 columns on wide screens, down to 1 (BigReworkV1). */
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
    max-width: calc(4 * 300px);
  }

  .glyph-heading {
    margin: var(--space-6) 0 var(--space-2);
  }

  .add-form {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding: var(--space-3);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    margin-bottom: var(--space-3);
  }
  .add-form label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .add-form label.grow {
    flex: 1;
    min-width: 180px;
  }
  .add-form input {
    width: 80px;
  }

  .glyph-error {
    color: var(--color-warning);
    font-size: 11.5px;
    margin: 0 0 var(--space-2);
  }

  .glyph-group {
    margin-bottom: var(--space-5);
  }
  .glyph-grid {
    display: grid;
    /* Up to 8 columns for the denser glyph tiles. */
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-2);
    max-width: calc(8 * 190px);
  }

  @media (max-width: 700px) {
    .mount-grid {
      grid-template-columns: 1fr;
    }
    .glyph-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }
</style>
