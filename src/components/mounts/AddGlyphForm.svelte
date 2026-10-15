<script>
  /**
   * AddGlyphForm.svelte - add one glyph instance to the inventory.
   * Minor types have a fixed rarity; major and mythic types pick a rarity per instance (§8). Majors are listed only
   * if the character's class (and talent-set specs, when known) can use them (§10).
   */
  import { MAJOR_GLYPHS, MINOR_GLYPH_TYPES, MYTHIC_GLYPH_TYPES } from '../../lib/game/mountsGlyphs.js';
  import { FREE_GLYPH_RARITIES, glyphRarityOptions, majorGlyphAllowed } from '../../lib/model/glyphs.js';
  import { TIER_LABELS } from './mountsView.js';
  import Select from '../ui/Select.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Button from '../ui/Button.svelte';

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

  const tierOptions = Object.entries(TIER_LABELS).map(([value, label]) => ({ value, label }));
  const typeOptions = $derived(types.map((t) => ({ value: t.id, label: t.label })));
  const rarityOptions = $derived(rarities.map((r) => ({ value: r, label: r })));

  function add() {
    if (!selected) return;
    onAdd({ glyphType: selected, rarity, sealed });
  }
</script>

<div class="add-form">
  <Select label="Tier" options={tierOptions} bind:value={tier} />
  <div class="grow"><Select label="Glyph" options={typeOptions} value={selected} onchange={(v) => (glyphType = v)} /></div>
  <Select label="Rarity" options={rarityOptions} value={rarity} disabled={rarities.length < 2} onchange={(v) => (rarityPick = v)} />
  <Checkbox bind:checked={sealed} label="Sealed" />
  <Button variant="primary" disabled={!selected} onclick={add}>Add to inventory</Button>
</div>

{#if tier === 'major' && types.length === 0}
  <p class="hint">No major glyphs exist for this class. Choose a class on the Character screen.</p>
{/if}

<style>
  .add-form {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-2);
    flex-wrap: wrap;
    padding: var(--sp-3);
    background: var(--surface-1);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    margin-bottom: var(--sp-3);
    min-width: 0;
  }
  .grow { flex: 1; min-width: min(180px, 100%); }
  .hint { margin: 0 0 var(--sp-2); font-size: var(--fs-12); color: var(--text-muted); }
</style>
