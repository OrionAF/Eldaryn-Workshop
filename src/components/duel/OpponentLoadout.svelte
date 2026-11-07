<script>
  /**
   * OpponentLoadout.svelte - the combat loadout of one saved opponent: generic, utility and Ancient
   * sigils with a level and an activation condition each, the major glyphs of its ridden mount (an
   * opponent has no mount to own them), and the sigil altar tier. The stat block is in the OpponentPanel, which renders this loadout under it.
   * Every write goes through rosterStore.updateOpponent, which re-normalises (illegal picks vanish).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { majorGlyphsForClassSpec } from '../../lib/game/mountsGlyphs.js';
  import { sigilBySpecies } from '../../lib/game/sigils.js';
  import {
    MAX_SIGIL_LEVEL,
    MAX_ALTAR_TIER,
    genericSigils,
    utilitySigils,
    ancientSigils,
    sigilConditionOptions,
  } from '../../lib/model/sigils.js';
  import { OPPONENT_SIGIL_CAP } from '../../lib/model/opponents.js';
  import { FREE_GLYPH_RARITIES, MOUNT_GLYPH_SOCKETS } from '../../lib/model/glyphs.js';
  import Chip from '../Chip.svelte';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';

  let { opponent } = $props();

  const generic = $derived(genericSigils(opponent.class, opponent.spec));
  const utility = $derived(utilitySigils(opponent.class, opponent.spec));
  const ancient = $derived(ancientSigils(opponent.class));
  const majors = $derived(majorGlyphsForClassSpec(opponent.class, opponent.spec));

  const equipped = $derived(
    [
      ...opponent.sigils.map((s) => ({ ...s, slot: 'generic' })),
      ...(opponent.utility ? [{ ...opponent.utility, slot: 'utility' }] : []),
      ...(opponent.ancient ? [{ ...opponent.ancient, slot: 'ancient' }] : []),
    ].map((s) => ({ ...s, name: sigilBySpecies(s.species)?.name ?? s.species })),
  );

  const patch = (p) => rosterStore.updateOpponent(opponent.id, p);
  const conditionLabel = (c) => c.replace(/_/g, ' ').toLowerCase();
  const conditionOptions = (e) => sigilConditionOptions(e.species, opponent.spec).map((c) => ({ value: c, label: conditionLabel(c) }));
  const rarityOptions = FREE_GLYPH_RARITIES.map((r) => ({ value: r, label: r }));
  const tierOptions = Array.from({ length: MAX_ALTAR_TIER }, (_, i) => ({ value: i + 1, label: `Tier ${i + 1}` }));

  function toggleGeneric(species) {
    const has = opponent.sigils.some((s) => s.species === species);
    if (has) return patch({ sigils: opponent.sigils.filter((s) => s.species !== species) });
    if (opponent.sigils.length < OPPONENT_SIGIL_CAP) patch({ sigils: [...opponent.sigils, { species, level: 1 }] });
  }
  const pickSlot = (slot, species) => patch({ [slot]: opponent[slot]?.species === species ? null : { species, level: 1 } });

  function setLevel(e, level) {
    const n = Math.floor(Number(level));
    if (!Number.isFinite(n)) return;
    if (e.slot === 'generic') patch({ sigils: opponent.sigils.map((s) => (s.species === e.species ? { ...s, level: n } : s)) });
    else patch({ [e.slot]: { species: e.species, level: n } });
  }
  const setCondition = (species, c) => patch({ conditions: { ...opponent.conditions, [species]: c } });

  const glyph = (id) => opponent.majorGlyphs.find((g) => g.glyphType === id);
  function toggleGlyph(id) {
    if (glyph(id)) return patch({ majorGlyphs: opponent.majorGlyphs.filter((g) => g.glyphType !== id) });
    if (opponent.majorGlyphs.length < MOUNT_GLYPH_SOCKETS.major) {
      patch({ majorGlyphs: [...opponent.majorGlyphs, { glyphType: id, rarity: 'Legendary' }] });
    }
  }
  const setRarity = (id, rarity) => patch({ majorGlyphs: opponent.majorGlyphs.map((g) => (g.glyphType === id ? { ...g, rarity } : g)) });
</script>

<div class="loadout" data-testid="opponent-loadout">
  <div class="group">
    <span class="cap-label">Sigils · {opponent.sigils.length}/{OPPONENT_SIGIL_CAP} generic</span>
    <div class="chip-list">
      {#each generic as def (def.species)}
        <Chip
          label={def.name}
          size="compact"
          selected={opponent.sigils.some((s) => s.species === def.species)}
          onClick={() => toggleGeneric(def.species)}
        />
      {/each}
    </div>
    {#if utility.length}
      <span class="cap-label sub">Utility</span>
      <div class="chip-list">
        {#each utility as def (def.species)}
          <Chip label={def.name} size="compact" selected={opponent.utility?.species === def.species} onClick={() => pickSlot('utility', def.species)} />
        {/each}
      </div>
    {/if}
    {#if ancient.length}
      <span class="cap-label sub">Ancient</span>
      <div class="chip-list">
        {#each ancient as def (def.species)}
          <Chip label={def.name} size="compact" selected={opponent.ancient?.species === def.species} onClick={() => pickSlot('ancient', def.species)} />
        {/each}
      </div>
    {/if}
  </div>

  {#if equipped.length}
    <div class="group">
      <span class="cap-label">Level and condition</span>
      <div class="eq-grid">
        <span class="col-head" aria-hidden="true">Sigil</span>
        <span class="col-head" aria-hidden="true">Level</span>
        <span class="col-head" aria-hidden="true">Condition</span>
        {#each equipped as e (e.species)}
          <div class="equipped-row" role="group" aria-label={e.name}>
            <span class="name">{e.name}</span>
            <NumberField label="{e.name} level" hideLabel value={e.level} min={1} max={MAX_SIGIL_LEVEL} disabled={e.slot === 'ancient'} onchange={(n) => setLevel(e, n)} />
            <Select label="{e.name} condition" hideLabel options={conditionOptions(e)} value={opponent.conditions[e.species]} onchange={(v) => setCondition(e.species, v)} />
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="group">
    <span class="cap-label">Major glyphs · {opponent.majorGlyphs.length}/{MOUNT_GLYPH_SOCKETS.major} <span class="aside">do nothing without their sigil</span></span>
    <div class="chip-list">
      {#each majors as def (def.id)}
        <Chip label={def.name} size="compact" selected={!!glyph(def.id)} onClick={() => toggleGlyph(def.id)} />
      {/each}
    </div>
    {#if opponent.majorGlyphs.length}
      <div class="glyph-grid">
        {#each opponent.majorGlyphs as g (g.glyphType)}
          {@const gName = majors.find((d) => d.id === g.glyphType)?.name ?? g.glyphType}
          <div class="glyph-row">
            <span class="name">{gName}</span>
            <Select label="{gName} rarity" hideLabel options={rarityOptions} value={g.rarity} onchange={(v) => setRarity(g.glyphType, v)} />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="group altar">
    <Select label="Sigil altar tier" options={tierOptions} value={opponent.altarTier} onchange={(v) => patch({ altarTier: Number(v) })} />
  </div>
</div>

<style>
  .loadout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--sp-4) var(--sp-6); min-width: 0; }
  .group { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
  .cap-label.sub { margin-top: var(--sp-2); }
  .chip-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .aside { margin-left: var(--sp-1); text-transform: none; letter-spacing: normal; font-weight: var(--fw-regular); color: var(--text-muted); }
  /* Sigil | Level | Condition: headed once, one row per equipped sigil */
  .eq-grid { display: grid; grid-template-columns: minmax(7rem, 14rem) 4.5rem minmax(8rem, 11rem); gap: var(--sp-2) var(--sp-3); align-items: center; justify-content: start; }
  .equipped-row, .glyph-row { display: contents; }
  .col-head { font-size: var(--fs-11); font-weight: var(--fw-bold); color: var(--text-muted); }
  .name { font-size: var(--fs-13); color: var(--text-soft); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .glyph-grid { display: grid; grid-template-columns: minmax(7rem, 14rem) minmax(8rem, 10rem); gap: var(--sp-2) var(--sp-3); align-items: center; justify-content: start; }
  .altar { max-width: 12rem; }
</style>
