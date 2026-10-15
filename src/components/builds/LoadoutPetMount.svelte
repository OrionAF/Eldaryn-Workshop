<script>
  /**
   * LoadoutPetMount.svelte - B2 Pet and Mount pickers (ia.md §5.7). Art cards; "None" is a choice. The
   * ridden mount's sockets show read-only beneath: they belong to the mount (per-mount scope), so they
   * are edited in Mounts & Glyphs, and a major glyph whose sigil this preset does not run is marked inert.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { petImage } from '../../lib/assets/pets.js';
  import { mountImage } from '../../lib/assets/mounts.js';
  import { mountsUnlocked, UNLOCK_LEVELS, ancientActive, effectiveTranscendencePreset } from '../../lib/model/legality.js';
  import { mountGlyphLoadout, activeMajorGlyphs } from '../../lib/model/mounts.js';
  import { glyphTypeInfo } from '../../lib/model/glyphs.js';
  import { petDisplayName } from '../../lib/game/pets.js';
  import { presetSpec } from '../../lib/build/presetInputs.js';
  import Panel from '../ui/Panel.svelte';
  import PickCard from '../ui/PickCard.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import ScopeChip from '../ui/ScopeChip.svelte';
  import { petLabel, mountLabel } from './presetLabels.js';

  let { character, preset } = $props();

  const evolved = $derived(character.pets.altar.tier >= 2);
  const mount = $derived(character.mounts.find((m) => m.id === preset.mountId) ?? null);
  const spec = $derived(presetSpec(character, preset));
  const sockets = $derived.by(() => {
    if (!mount) return null;
    const load = mountGlyphLoadout(character, mount, spec);
    // The species the Fighter runs: a major glyph acts only with its sigil equipped (mounts-glyphs.md §10).
    const ancient = preset.ancientSigilSpecies;
    const ancientOn = ancient && ancientActive(ancient, effectiveTranscendencePreset(character, preset)) ? ancient : null;
    const equipped = [...preset.sigilSpecies, preset.utilitySigilSpecies, ancientOn].filter((sp) => sp && character.sigils.owned[sp]);
    const { active, inert } = activeMajorGlyphs(character, mount, spec, equipped);
    const name = (g) => glyphTypeInfo(g.glyphType)?.name ?? g.glyphType;
    return {
      minors: load.minors.length,
      active: active.map(name),
      inert: inert.map(name),
      mythics: load.mythics.map(name),
    };
  });
  const others = $derived(
    mount ? character.presets.filter((p) => p.id !== preset.id && p.mountId === mount.id).map((p) => p.name) : [],
  );
</script>

<Panel title="Pet" scope="preset">
  {#if !character.pets.owned.length}
    <EmptyState title="No pets owned yet" text="Add pets in Pets, then pick one here.">
      {#snippet action()}<a href="#/character/pets">Open Pets</a>{/snippet}
    </EmptyState>
  {:else}
    <div class="picks" role="radiogroup" aria-label="Pet">
      <PickCard name="None" checked={!preset.petId} onselect={() => rosterStore.setPresetPet(preset.id, null)} />
      {#each character.pets.owned as pet (pet.id)}
        <PickCard
          name={petLabel(character, pet.id)}
          meta={pet.rarity}
          art={petImage(petDisplayName(pet.species, evolved) ?? pet.species)}
          checked={preset.petId === pet.id}
          onselect={() => rosterStore.setPresetPet(preset.id, pet.id)}
        />
      {/each}
    </div>
    <a class="link" href="#/character/pets">Add or level pets in Pets</a>
  {/if}
</Panel>

<Panel title="Mount" scope="preset">
  {#if !mountsUnlocked(character.level)}
    <p class="hint">Mounts unlock at level {UNLOCK_LEVELS.MOUNTS}.</p>
  {:else if !character.mounts.length}
    <EmptyState title="No mounts owned yet" text="Add mounts in Mounts & Glyphs, then pick one here.">
      {#snippet action()}<a href="#/character/mounts">Open Mounts & Glyphs</a>{/snippet}
    </EmptyState>
  {:else}
    <div class="picks" role="radiogroup" aria-label="Mount">
      <PickCard name="None" checked={!preset.mountId} onselect={() => rosterStore.setPresetMount(preset.id, null)} />
      {#each character.mounts as m (m.id)}
        <PickCard
          name={mountLabel(character, m.id)}
          meta={m.rarity}
          art={mountImage(m.species)}
          checked={preset.mountId === m.id}
          onselect={() => rosterStore.setPresetMount(preset.id, m.id)}
        />
      {/each}
    </div>
  {/if}
  {#if mount && sockets}
    <section class="sockets" aria-label="Mount sockets (read-only)" data-testid="mount-sockets">
      <ScopeChip scope="mount" target={mountLabel(character, mount.id)} sideEffects={others} />
      <ul>
        <li>Minor glyphs: <b class="num">{sockets.minors}</b> of 3 socketed</li>
        <li>
          Major glyphs:
          {#if sockets.active.length}<b>{sockets.active.join(', ')}</b>{:else}none active{/if}
          {#if sockets.inert.length}
            <span class="inert" data-testid="inert-glyphs">Inert, its sigil is not equipped: {sockets.inert.join(', ')}</span>
          {/if}
        </li>
        <li>Mythic glyph: {sockets.mythics.length ? sockets.mythics.join(', ') : 'none'}</li>
      </ul>
      <span class="hint">Sockets belong to the mount. <a href="#/character/mounts">Edit sockets</a> in Mounts & Glyphs.</span>
    </section>
  {/if}
</Panel>

<style>
  .picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--sp-2); }
  .link, .hint { font-size: var(--fs-12); color: var(--text-muted); }
  .sockets { display: grid; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--frame-mount); border-radius: var(--r-1); }
  ul { margin: 0; padding-left: var(--sp-4); font-size: var(--fs-13); color: var(--text-soft); display: grid; gap: var(--sp-1); }
  .inert { display: block; color: var(--status-warn); font-size: var(--fs-12); }
  .num { font-family: var(--font-data); }
</style>
