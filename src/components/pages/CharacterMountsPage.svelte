<script>
  /**
   * CharacterMountsPage.svelte (C7) - owned mounts and the character-wide glyph inventory (rebuild-plan §3 mounts/glyphs, B4).
   *
   * Mounts are owned instances (species, rolled base HP/ATK, level 1-5) with six glyph sockets each (3 minor,
   * 2 major, 1 mythic). Only the ridden mount counts; which one a preset rides is per-preset and is set here through each
   * card's "Ridden in" menu (every preset named) and in the Loadout page. Glyphs are inventory instances: sealed ones cannot be socketed, and major glyphs are limited
   * to the character's class and spec. Game facts: Game/mounts-glyphs.md.
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { MOUNT_SPECIES } from '../../lib/game/mountsGlyphs.js';
  import { characterSpecs, glyphTier, glyphTypeInfo, FREE_GLYPH_RARITIES } from '../../lib/model/glyphs.js';
  import { TIER_LABELS } from '../mounts/mountsView.js';
  import MountCard from '../mounts/MountCard.svelte';
  import GlyphCard from '../mounts/GlyphCard.svelte';
  import GlyphPickerModal from '../mounts/GlyphPickerModal.svelte';
  import AddGlyphForm from '../mounts/AddGlyphForm.svelte';
  import Panel from '../ui/Panel.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Banner from '../ui/Banner.svelte';
  import { inertGlyphPresets } from '../../lib/build/usage.js';
  import { mountsUnlocked, UNLOCK_LEVELS } from '../../lib/model/legality.js';

  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  // The hash tab picks the view on arrival and when it changes; the Tabs control owns it after that.
  let view = $state(untrack(() => (tab === 'glyphs' ? 'glyphs' : 'mounts')));
  $effect(() => {
    if (tab === 'glyphs' || tab === 'mounts') view = tab;
  });
  const SHOW = [
    { value: 'all', label: 'All glyphs' },
    { value: 'usable', label: 'Usable (not sealed)' },
    { value: 'sealed', label: 'Sealed' },
  ];
  let show = $state('all');

  const character = $derived(rosterStore.current);
  const mounts = $derived(character?.mounts ?? []);
  const glyphs = $derived(character?.glyphs ?? []);
  const specs = $derived(characterSpecs(character));
  const inert = $derived(inertGlyphPresets(character));
  const mountName = (id) => MOUNT_SPECIES.find((s) => s.species === mounts.find((m) => m.id === id)?.species)?.name ?? null;

  let newSpecies = $state(MOUNT_SPECIES[0].species);
  let picker = $state({ open: false, mountId: null, tier: 'minor', index: 0 });
  const pickerMount = $derived(mounts.find((m) => m.id === picker.mountId) ?? null);

  /** Every mount a glyph is socketed on. */
  const mountsOfGlyph = (glyphId) => mounts.filter((m) => Object.values(m.glyphs).some((row) => row.includes(glyphId)));
  /** 'Night Wolf, Scorpion Hound' or null when empty. */
  const mountList = (list) => (list.length ? list.map((m) => mountName(m.id)).join(', ') : null);

  const groups = $derived(
    ['minor', 'major', 'mythic']
      .map((tier) => ({
        tier,
        items: glyphs
          .filter((g) => glyphTier(g.glyphType) === tier)
          .filter((g) => (show === 'sealed' ? g.sealed : show === 'usable' ? !g.sealed : true))
          .toSorted((a, b) => FREE_GLYPH_RARITIES.indexOf(b.rarity) - FREE_GLYPH_RARITIES.indexOf(a.rarity)),
      }))
      .filter((g) => g.items.length > 0),
  );

  function ride(mountId, presetId) {
    const p = character.presets.find((x) => x.id === presetId);
    if (p) rosterStore.setPresetMount(p.id, p.mountId === mountId ? null : mountId);
  }
  function addMount() {
    rosterStore.addMount({ species: newSpecies });
    setStatus(`Added ${MOUNT_SPECIES.find((s) => s.species === newSpecies).name}`);
  }
  function onPick(glyphId) {
    const res = rosterStore.setMountSocket(picker.mountId, picker.tier, picker.index, glyphId);
    if (res && !res.ok) setStatus(`Cannot socket: ${res.reason}`);
  }
</script>

{#if !character}
  <p class="hint">No character selected.</p>
{:else}
  <div class="page">
  <Panel title="Mounts &amp; Glyphs" scope="character">
    {#snippet meta()}<span class="sub">unlock at level {UNLOCK_LEVELS.MOUNTS} · sockets: 3 minor, 2 major, 1 mythic · only the ridden mount counts</span>{/snippet}
    {#if !mountsUnlocked(character.level)}
      <Banner variant="info">Mounts unlock at level {UNLOCK_LEVELS.MOUNTS}; this character is level {character.level}, so no mount counts yet.</Banner>
    {/if}
    <Tabs
      label="Mounts and glyphs"
      idPrefix="mg"
      bind:value={view}
      items={[{ id: 'mounts', label: 'Mounts', count: mounts.length }, { id: 'glyphs', label: 'Glyph inventory', count: glyphs.length }]}
    />

    {#if view === 'mounts'}
      <div role="tabpanel" id="mg-panel-mounts" aria-labelledby="mg-tab-mounts">
        <section class="add-mount" aria-label="Add a mount">
          <Select label="Mount species" options={MOUNT_SPECIES.map((s) => ({ value: s.species, label: `${s.name} (${s.rarity})` }))} bind:value={newSpecies} />
          <Button variant="primary" onclick={addMount}>+ Add mount</Button>
          <span class="hint">Each mount you own is its own roll: add the same species twice for two mounts.</span>
        </section>

        {#if mounts.length === 0}
          <EmptyState title="No mounts yet" text="Add the ones you own, then set their rolls and glyphs." />
        {/if}
        <section class="mount-grid" aria-label="Owned mounts">
          {#each mounts as mount (mount.id)}
            <MountCard
              {mount}
              {glyphs}
              presets={character.presets}
              onPatch={(patch) => rosterStore.updateMount(mount.id, patch)}
              onRide={(presetId) => ride(mount.id, presetId)}
              onSocket={(tier, index) => (picker = { open: true, mountId: mount.id, tier, index })}
              onRemove={() => rosterStore.removeMount(mount.id)}
            />
          {/each}
        </section>
      </div>
    {:else}
      <div role="tabpanel" id="mg-panel-glyphs" aria-labelledby="mg-tab-glyphs">
        <AddGlyphForm playerClass={character.class} {specs} onAdd={(fields) => rosterStore.addGlyph(fields)} />

        {#if glyphs.length === 0}
          <EmptyState title="No glyphs yet" text="Add one above, then socket it on a mount." />
        {:else}
          <div class="filter"><Select label="Show" options={SHOW} bind:value={show} /></div>
        {/if}
        {#each groups as group (group.tier)}
          <div class="glyph-group">
            <h4 class="group-label">{TIER_LABELS[group.tier]}</h4>
            <div class="glyph-grid">
              {#each group.items as glyph (glyph.id)}
                <GlyphCard
                  {glyph}
                  mountName={mountList(mountsOfGlyph(glyph.id))}
                  inertIn={inert.get(glyph.id) ?? []}
                  onUpdate={(patch) => rosterStore.updateGlyph(glyph.id, patch)}
                  onRemove={() => rosterStore.removeGlyph(glyph.id)}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
  </div>

  <GlyphPickerModal
    bind:open={picker.open}
    mountName={pickerMount ? mountName(pickerMount.id) : ''}
    tier={picker.tier}
    index={picker.index}
    current={pickerMount?.glyphs[picker.tier]?.[picker.index] ?? null}
    {glyphs}
    playerClass={character.class}
    {specs}
    whereIs={(id) => mountList(mountsOfGlyph(id).filter((m) => m.id !== picker.mountId))}
    {onPick}
  />
{/if}

<style>
  /* Panels size to their own width, never to the grids inside them. An auto-fill grid under a max-width is
     measured as that many columns of its minimum, which pushed the page past 1440 (the fifth mount card was
     cut off); min-width: 0 on every wrapper stops it, and the page scrolls inside itself as a last resort. */
  .page { display: grid; gap: var(--sp-4); min-width: 0; overflow-x: auto; }
  .page [role='tabpanel'] { min-width: 0; }
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .add-mount { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; margin: var(--sp-4) 0; }
  .add-mount :global(.field) { min-width: min(16rem, 100%); }
  .filter { max-width: 14rem; margin: var(--sp-3) 0; }
  .mount-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: var(--sp-3); min-width: 0; }
  .glyph-group { margin: var(--sp-4) 0; min-width: 0; }
  .group-label {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .glyph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: var(--sp-2); margin-top: var(--sp-2); min-width: 0; }
</style>
