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
    <span class="cap-label">Sigils - {opponent.sigils.length}/{OPPONENT_SIGIL_CAP} generic</span>
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
      {#each equipped as e (e.species)}
        <div class="equipped-row" role="group" aria-label={e.name}>
          <span class="name">{e.name}</span>
          <div class="lvl">
            <NumberField label="Level" value={e.level} min={1} max={MAX_SIGIL_LEVEL} disabled={e.slot === 'ancient'} onchange={(n) => setLevel(e, n)} />
          </div>
          <div class="cond">
            <Select label="Condition" options={conditionOptions(e)} value={opponent.conditions[e.species]} onchange={(v) => setCondition(e.species, v)} />
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="group">
    <span class="cap-label">Major glyphs - {opponent.majorGlyphs.length}/{MOUNT_GLYPH_SOCKETS.major} (inert without their sigil)</span>
    <div class="chip-list">
      {#each majors as def (def.id)}
        <Chip label={def.name} size="compact" selected={!!glyph(def.id)} onClick={() => toggleGlyph(def.id)} />
      {/each}
    </div>
    {#each opponent.majorGlyphs as g (g.glyphType)}
      <div class="equipped-row">
        <span class="name">{majors.find((d) => d.id === g.glyphType)?.name ?? g.glyphType}</span>
        <div class="cond">
          <Select label="Glyph rarity" options={rarityOptions} value={g.rarity} onchange={(v) => setRarity(g.glyphType, v)} />
        </div>
      </div>
    {/each}
  </div>

  <div class="group">
    <Select label="Sigil altar tier" options={tierOptions} value={opponent.altarTier} onchange={(v) => patch({ altarTier: Number(v) })} />
  </div>
</div>

<style>
  .loadout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: var(--sp-4) var(--sp-5); min-width: 0; }
  .group { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
  .cap-label.sub { margin-top: var(--sp-2); }
  .chip-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .equipped-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .equipped-row .name { flex: 1 1 100%; font-size: var(--fs-12); color: var(--text-soft); }
  .lvl { flex: 0 0 calc(var(--sp-10) * 2); min-width: 0; }
  .cond { flex: 1 1 0; min-width: 0; }
</style>
