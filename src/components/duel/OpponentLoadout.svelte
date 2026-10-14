<script>
  /**
   * OpponentLoadout.svelte - the combat loadout of one saved opponent: generic, utility and Ancient
   * sigils with a level and an activation condition each, the major glyphs of its ridden mount (an
   * opponent has no mount to own them), and the sigil altar tier. The stat block is in OpponentEditor.
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
    <span class="micro-label">Sigils - {opponent.sigils.length}/{OPPONENT_SIGIL_CAP} generic</span>
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
      <span class="micro-label sub">Utility</span>
      <div class="chip-list">
        {#each utility as def (def.species)}
          <Chip label={def.name} size="compact" selected={opponent.utility?.species === def.species} onClick={() => pickSlot('utility', def.species)} />
        {/each}
      </div>
    {/if}
    {#if ancient.length}
      <span class="micro-label sub">Ancient</span>
      <div class="chip-list">
        {#each ancient as def (def.species)}
          <Chip label={def.name} size="compact" selected={opponent.ancient?.species === def.species} onClick={() => pickSlot('ancient', def.species)} />
        {/each}
      </div>
    {/if}
  </div>

  {#if equipped.length}
    <div class="group">
      <span class="micro-label">Level and condition</span>
      {#each equipped as e (e.species)}
        <div class="equipped-row">
          <span class="name">{e.name}</span>
          <input
            type="number"
            class="mono lvl"
            min="1"
            max={MAX_SIGIL_LEVEL}
            aria-label={`${e.name} level`}
            value={e.level}
            disabled={e.slot === 'ancient'}
            onchange={(ev) => setLevel(e, ev.currentTarget.value)}
          />
          <select aria-label={`${e.name} condition`} value={opponent.conditions[e.species]} onchange={(ev) => setCondition(e.species, ev.currentTarget.value)}>
            {#each sigilConditionOptions(e.species, opponent.spec) as c (c)}
              <option value={c}>{conditionLabel(c)}</option>
            {/each}
          </select>
        </div>
      {/each}
    </div>
  {/if}

  <div class="group">
    <span class="micro-label">Major glyphs - {opponent.majorGlyphs.length}/{MOUNT_GLYPH_SOCKETS.major} (inert without their sigil)</span>
    <div class="chip-list">
      {#each majors as def (def.id)}
        <Chip label={def.name} size="compact" selected={!!glyph(def.id)} onClick={() => toggleGlyph(def.id)} />
      {/each}
    </div>
    {#each opponent.majorGlyphs as g (g.glyphType)}
      <div class="equipped-row">
        <span class="name">{majors.find((d) => d.id === g.glyphType)?.name ?? g.glyphType}</span>
        <select aria-label="Glyph rarity" value={g.rarity} onchange={(ev) => setRarity(g.glyphType, ev.currentTarget.value)}>
          {#each FREE_GLYPH_RARITIES as r (r)}<option value={r}>{r}</option>{/each}
        </select>
      </div>
    {/each}
  </div>

  <div class="group">
    <label class="micro-label" for={`altar-${opponent.id}`}>Sigil altar tier</label>
    <select id={`altar-${opponent.id}`} value={opponent.altarTier} onchange={(ev) => patch({ altarTier: Number(ev.currentTarget.value) })}>
      {#each Array.from({ length: MAX_ALTAR_TIER }, (_, i) => i + 1) as t (t)}<option value={t}>Tier {t}</option>{/each}
    </select>
  </div>
</div>

<style>
  .loadout { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 22px; }
  .group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .micro-label.sub { margin-top: var(--space-2); }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .equipped-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .equipped-row .name { flex: 1; min-width: 100px; font-size: 12px; color: var(--color-soft); }
  .lvl { width: 56px; }
</style>
