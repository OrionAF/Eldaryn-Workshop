<script>
  /**
   * AddGlyphForm.svelte - add one glyph instance to the inventory.
   * Minor types have a fixed rarity; major and mythic types pick a rarity per instance (§8). Majors are listed only
   * if the character's class (and talent-set specs, when known) can use them (§10).
   */
  import { MAJOR_GLYPHS, MINOR_GLYPH_TYPES, MYTHIC_GLYPH_TYPES } from '../../lib/game/mountsGlyphs.js';
  import { FREE_GLYPH_RARITIES, glyphRarityOptions, majorGlyphAllowed } from '../../lib/model/glyphs.js';
  import { TIER_LABELS } from './mountsView.js';

  let { playerClass = null, specs = [], onAdd } = $props();

  let tier = $state('minor');
  let glyphType = $state('');
  let rarityPick = $state('Common');
  let sealed = $state(false);

  const types = $derived.by(() => {
    if (tier === 'minor') return MINOR_GLYPH_TYPES.map((t) => ({ id: t.id, label: `${t.name} (${t.rarity})` }));
    if (tier === 'mythic') return MYTHIC_GLYPH_TYPES.map((t) => ({ id: t.id, label: t.name }));
    return MAJOR_GLYPHS.filter((g) => majorGlyphAllowed(g.id, playerClass, specs)).map((g) => ({ id: g.id, label: `${g.name} - ${g.sigilName}` }));
  });
  const selected = $derived(types.some((t) => t.id === glyphType) ? glyphType : (types[0]?.id ?? ''));
  const rarities = $derived(selected ? glyphRarityOptions(selected) : FREE_GLYPH_RARITIES);
  const rarity = $derived(rarities.includes(rarityPick) ? rarityPick : rarities[0]);

  function add() {
    if (!selected) return;
    onAdd({ glyphType: selected, rarity, sealed });
  }
</script>

<div class="add-form">
  <label>
    <span class="micro-label">Tier</span>
    <select aria-label="Glyph tier" bind:value={tier}>
      {#each Object.entries(TIER_LABELS) as [key, label] (key)}<option value={key}>{label}</option>{/each}
    </select>
  </label>
  <label class="grow">
    <span class="micro-label">Glyph</span>
    <select aria-label="Glyph type" value={selected} onchange={(e) => (glyphType = e.currentTarget.value)}>
      {#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
    </select>
  </label>
  <label>
    <span class="micro-label">Rarity</span>
    <select aria-label="Glyph rarity" value={rarity} disabled={rarities.length < 2} onchange={(e) => (rarityPick = e.currentTarget.value)}>
      {#each rarities as r (r)}<option value={r}>{r}</option>{/each}
    </select>
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={sealed} />
    <span>Sealed</span>
  </label>
  <button type="button" class="btn-gold" disabled={!selected} onclick={add}>Add to inventory</button>
</div>

{#if tier === 'major' && types.length === 0}
  <p class="hint">No major glyphs exist for this class. Choose a class on the Character screen.</p>
{/if}

<style>
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
  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  label.grow {
    flex: 1;
    min-width: 180px;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: var(--space-1);
    font-size: 12px;
    color: var(--color-soft);
  }
  .hint {
    margin: 0 0 var(--space-2);
    font-size: 11.5px;
    color: var(--color-muted);
  }
</style>
