<script>
  /**
   * MountsScreen.svelte - owned mounts and the character-wide glyph inventory (rebuild-plan §3 mounts/glyphs, B4).
   *
   * Mounts are owned instances (species, rolled base HP/ATK, level 1-5) with six glyph sockets each (3 minor,
   * 2 major, 1 mythic). Only the ridden mount counts and which one a preset rides is per-preset, set here for the
   * active preset. Glyphs are inventory instances: sealed ones cannot be socketed, and major glyphs are limited
   * to the character's class and spec. Game facts: Game/mounts-glyphs.md.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { MOUNT_SPECIES } from '../../lib/game/mountsGlyphs.js';
  import { characterSpecs, glyphTier, glyphTypeInfo } from '../../lib/model/glyphs.js';
  import { TIER_LABELS } from '../mounts/mountsView.js';
  import MountCard from '../mounts/MountCard.svelte';
  import GlyphCard from '../mounts/GlyphCard.svelte';
  import GlyphPickerModal from '../mounts/GlyphPickerModal.svelte';
  import AddGlyphForm from '../mounts/AddGlyphForm.svelte';

  let { setStatus = () => {}, onNavigate = () => {} } = $props();

  const character = $derived(rosterStore.current);
  const mounts = $derived(character?.mounts ?? []);
  const glyphs = $derived(character?.glyphs ?? []);
  const specs = $derived(characterSpecs(character));
  const activePreset = $derived(character?.presets.find((p) => p.id === character.activePresetId) ?? null);
  const mountName = (id) => MOUNT_SPECIES.find((s) => s.species === mounts.find((m) => m.id === id)?.species)?.name ?? null;

  let newSpecies = $state(MOUNT_SPECIES[0].species);
  let picker = $state({ open: false, mountId: null, tier: 'minor', index: 0 });
  const pickerMount = $derived(mounts.find((m) => m.id === picker.mountId) ?? null);

  /** Which mount a glyph is socketed on, or null. */
  function mountOfGlyph(glyphId) {
    return mounts.find((m) => Object.values(m.glyphs).some((row) => row.includes(glyphId))) ?? null;
  }
  const sigilsEquipped = $derived(
    new Set(character?.presets.flatMap((p) => [...p.sigilSpecies, p.utilitySigilSpecies, p.ancientSigilSpecies]).filter(Boolean) ?? []),
  );

  const groups = $derived(
    ['minor', 'major', 'mythic']
      .map((tier) => ({ tier, items: glyphs.filter((g) => glyphTier(g.glyphType) === tier) }))
      .filter((g) => g.items.length > 0),
  );

  function addMount() {
    rosterStore.addMount({ species: newSpecies });
    setStatus(`Added ${MOUNT_SPECIES.find((s) => s.species === newSpecies).name}`);
  }
  function onPick(glyphId) {
    const res = rosterStore.setMountSocket(picker.mountId, picker.tier, picker.index, glyphId);
    if (res && !res.ok) setStatus(`Cannot socket: ${res.reason}`);
  }
</script>

<div class="header-row">
  <h2>Mounts &amp; Glyphs</h2>
  <p class="hint">Mounts unlock at level 40 · sockets: 3 minor, 2 major, 1 mythic · only the ridden mount counts</p>
</div>

{#if !character}
  <p class="hint">No character selected.</p>
{:else}
  <section class="add-mount" aria-label="Add a mount">
    <label>
      <span class="micro-label">Mount</span>
      <select aria-label="Mount species" bind:value={newSpecies}>
        {#each MOUNT_SPECIES as s (s.species)}<option value={s.species}>{s.name} ({s.rarity})</option>{/each}
      </select>
    </label>
    <button type="button" class="btn-gold" onclick={addMount}>Add mount</button>
    <span class="hint">Each mount you own is its own roll: add the same species twice for two mounts.</span>
  </section>

  {#if mounts.length === 0}
    <p class="empty-hint">No mounts yet. Add the ones you own, then set their rolls and glyphs.</p>
  {/if}
  <section class="mount-grid" aria-label="Owned mounts">
    {#each mounts as mount (mount.id)}
      <MountCard
        {mount}
        {glyphs}
        riddenBy={character.presets.filter((p) => p.mountId === mount.id).map((p) => p.name)}
        activePresetName={activePreset?.name ?? null}
        ridingActive={!!activePreset && activePreset.mountId === mount.id}
        onPatch={(patch) => rosterStore.updateMount(mount.id, patch)}
        onRide={() => activePreset && rosterStore.setPresetMount(activePreset.id, activePreset.mountId === mount.id ? null : mount.id)}
        onSocket={(tier, index) => (picker = { open: true, mountId: mount.id, tier, index })}
        onRemove={() => rosterStore.removeMount(mount.id)}
      />
    {/each}
  </section>

  <h3 class="subheading glyph-heading">Glyph inventory</h3>
  <AddGlyphForm playerClass={character.class} {specs} onAdd={(fields) => rosterStore.addGlyph(fields)} />

  {#if glyphs.length === 0}
    <p class="empty-hint">No glyphs yet. Add one above, then socket it on a mount.</p>
  {/if}
  {#each groups as group (group.tier)}
    <div class="glyph-group">
      <h4 class="micro-label">{TIER_LABELS[group.tier]}</h4>
      <div class="glyph-grid">
        {#each group.items as glyph (glyph.id)}
          {@const info = glyphTypeInfo(glyph.glyphType)}
          <GlyphCard
            {glyph}
            mountName={mountName(mountOfGlyph(glyph.id)?.id)}
            sigilEquipped={info?.tier !== 'major' || sigilsEquipped.has(info.def.sigilSpecies)}
            onUpdate={(patch) => rosterStore.updateGlyph(glyph.id, patch)}
            onRemove={() => rosterStore.removeGlyph(glyph.id)}
          />
        {/each}
      </div>
    </div>
  {/each}

  <GlyphPickerModal
    bind:open={picker.open}
    mountName={pickerMount ? mountName(pickerMount.id) : ''}
    tier={picker.tier}
    index={picker.index}
    current={pickerMount?.glyphs[picker.tier]?.[picker.index] ?? null}
    {glyphs}
    playerClass={character.class}
    {specs}
    whereIs={(id) => mountName(mountOfGlyph(id)?.id)}
    {onPick}
  />
{/if}

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
  .add-mount {
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
  .add-mount label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mount-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
    max-width: calc(4 * 300px);
  }
  .glyph-heading {
    margin: var(--space-6) 0 var(--space-2);
  }
  .glyph-group {
    margin-bottom: var(--space-5);
  }
  .glyph-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-2);
    max-width: calc(8 * 190px);
  }
  @media (max-width: 700px) {
    .mount-grid {
      grid-template-columns: 1fr;
    }
    .glyph-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }
  }
</style>
