<script>
  /**
   * GlyphCard.svelte - one glyph instance in the inventory (Game/mounts-glyphs.md §8-§11).
   *
   * - Sealed glyphs do nothing and cannot be socketed; "Unlock" mirrors the in-game unlock, after which a minor
   *   glyph's rolled secondary (stat + value, as the game shows it) is entered here.
   * - Major glyphs carry no stat. They retune one sigil, so the card says which sigil, and warns when no preset
   *   equips it (the glyph is inert unless the sigil is equipped and the glyph is on the ridden mount, §10).
   */
  import { glyphTypeInfo, glyphSecondaryDef, glyphSecondaryQuality, glyphSecondaryValue, glyphQualityBand, GLYPH_SECONDARY_STATS } from '../../lib/model/glyphs.js';
  import { glyphImage } from '../../lib/assets/glyphs.js';
  import { orderStats } from '../../lib/ui/statOrder.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Button from '../ui/Button.svelte';
  import { TIER_LABELS, glyphText, majorText, rarityClass, secondaryUnit, secondaryDisplayValue, secondaryInputValue, statLabel } from './mountsView.js';

  let { glyph, playerClass = null, mountName = null, inertIn = [], onUpdate, onRemove } = $props();

  const info = $derived(glyphTypeInfo(glyph.glyphType));
  const art = $derived(glyphImage(info?.tier, glyph.rarity));
  const stat = $derived(glyph.secondary?.stat ?? '');
  const value = $derived(glyph.secondary ? glyphSecondaryValue(glyph.secondary) : '');
  const def = $derived(glyphSecondaryDef(stat));
  // Mythic and above roll past the pool's max (up to 120%, Game/updates-2.8.2.md §4)
  const rangeMax = $derived.by(() => {
    const top = glyphQualityBand(glyph.rarity)[1];
    return def && top > 1 ? glyphSecondaryValue({ stat, quality: top }) : def?.maxValue;
  });

  const statOptions = $derived([{ value: '', label: 'None entered' }, ...orderStats(GLYPH_SECONDARY_STATS, playerClass).map((s) => ({ value: s, label: statLabel(s) }))]);

  function setStat(next) {
    onUpdate({ secondary: next ? { stat: next, quality: glyphSecondaryQuality(next, value === '' ? 0 : value) } : null });
  }
  function setValue(n) {
    if (stat && Number.isFinite(n)) onUpdate({ secondary: { stat, quality: glyphSecondaryQuality(stat, secondaryInputValue(stat, n)) } });
  }
</script>

<div class="glyph-card rarity-card {rarityClass(glyph.rarity)}" class:inert={info?.tier === 'major' && inertIn.length > 0} data-glyph-id={glyph.id}>
  <span class="badge">{glyph.rarity}</span>
  {#if art}<img class="glyph-art" src={art} alt="" loading="lazy" />{/if}
  <p class="glyph-name">{info?.name ?? glyph.glyphType} <span class="tier">{info ? TIER_LABELS[info.tier] : ''}</span></p>

  {#if glyph.sealed}
    <p class="effect sealed">Sealed</p>
    <Button variant="ghost" size="small" onclick={() => onUpdate({ sealed: false })}>Unlock</Button>
  {:else if info?.tier === 'minor'}
    <div class="field">
      <Select label="Secondary stat" options={statOptions} value={stat} onchange={setStat} />
    </div>
    {#if def}
      <div class="field">
        <NumberField label="Secondary value" unit={secondaryUnit(stat)} value={secondaryDisplayValue(stat, value)} onchange={setValue} />
        <span class="range">Range {secondaryDisplayValue(stat, def.minValue)}-{secondaryDisplayValue(stat, rangeMax)}{secondaryUnit(stat)}</span>
      </div>
    {/if}
  {:else if info?.tier === 'major'}
    <p class="effect">{majorText(glyph.glyphType, glyph.rarity)}</p>
    {#if inertIn.length}<p class="warn" data-testid="glyph-inert">Does nothing in {inertIn.join(', ')}: its sigil is not equipped</p>{/if}
  {:else}
    <p class="effect">{glyphText(glyph)}</p>
  {/if}

  {#if mountName}<p class="where">On {mountName}</p>{/if}
  {#if info?.tier === 'minor' || info?.tier === 'major'}
    {#if !glyph.sealed}
      <Button variant="quiet" size="small" onclick={() => onUpdate({ sealed: true })}>Mark sealed</Button>
    {/if}
  {/if}
  <ConfirmButton variant="danger" size="small" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
</div>

<style>
  .glyph-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2);
    text-align: center;
    min-width: 0;
  }
  .glyph-card.inert { opacity: 0.7; }
  .badge {
    padding: 1px var(--sp-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-pill);
    color: var(--r-up, var(--text-muted));
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
  }
  .glyph-art { width: 48px; height: 48px; object-fit: contain; border-radius: var(--r-2); }
  .glyph-name { margin: 0; font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--r-up, var(--text-ink)); }
  .tier { display: block; font-size: var(--fs-11); font-weight: var(--fw-regular); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .effect { margin: 0; font-size: var(--fs-12); color: var(--text-soft); }
  .sealed { color: var(--status-warn); }
  .warn { margin: 0; font-size: var(--fs-11); color: var(--status-warn); }
  .where { margin: 0; font-size: var(--fs-11); color: var(--text-muted); }
  .range { font-family: var(--font-data); font-size: var(--fs-11); color: var(--text-muted); }
  .field { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: var(--sp-1); width: 100%; text-align: left; }
</style>
