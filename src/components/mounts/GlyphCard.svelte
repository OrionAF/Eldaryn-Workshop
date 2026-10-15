<script>
  /**
   * GlyphCard.svelte - one glyph instance in the inventory (Game/mounts-glyphs.md §8-§11).
   *
   * - Sealed glyphs do nothing and cannot be socketed; "Unlock" mirrors the in-game unlock, after which a minor
   *   glyph's rolled secondary (stat + value, as the game shows it) is entered here.
   * - Major glyphs carry no stat. They retune one sigil, so the card says which sigil, and warns when no preset
   *   equips it (the glyph is inert unless the sigil is equipped and the glyph is on the ridden mount, §10).
   */
  import { glyphTypeInfo, glyphSecondaryDef, glyphSecondaryQuality, glyphSecondaryValue, GLYPH_SECONDARY_STATS } from '../../lib/model/glyphs.js';
  import { glyphImage } from '../../lib/assets/glyphs.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import { TIER_LABELS, glyphText, majorText, rarityClass, secondaryUnit, statLabel } from './mountsView.js';

  let { glyph, mountName = null, inertIn = [], onUpdate, onRemove } = $props();

  const info = $derived(glyphTypeInfo(glyph.glyphType));
  const art = $derived(glyphImage(info?.tier, glyph.rarity));
  const stat = $derived(glyph.secondary?.stat ?? '');
  const value = $derived(glyph.secondary ? glyphSecondaryValue(glyph.secondary) : '');
  const def = $derived(glyphSecondaryDef(stat));

  function setStat(e) {
    const next = e.currentTarget.value;
    onUpdate({ secondary: next ? { stat: next, quality: glyphSecondaryQuality(next, value === '' ? 0 : value) } : null });
  }
  function setValue(e) {
    const n = Number(String(e.currentTarget.value).replace(',', '.'));
    if (stat && Number.isFinite(n)) onUpdate({ secondary: { stat, quality: glyphSecondaryQuality(stat, n) } });
  }
</script>

<div class="glyph-card rarity-card {rarityClass(glyph.rarity)}" class:inert={info?.tier === 'major' && inertIn.length > 0} data-glyph-id={glyph.id}>
  <span class="rarity-badge">{glyph.rarity}</span>
  {#if art}<img class="glyph-art" src={art} alt="" loading="lazy" />{/if}
  <p class="glyph-name">{info?.name ?? glyph.glyphType} <span class="tier">{info ? TIER_LABELS[info.tier] : ''}</span></p>

  {#if glyph.sealed}
    <p class="effect sealed">Sealed</p>
    <button type="button" class="btn-ghost" onclick={() => onUpdate({ sealed: false })}>Unlock</button>
  {:else if info?.tier === 'minor'}
    <label class="field">
      <span class="micro-label">Stat</span>
      <select aria-label="Secondary stat" value={stat} onchange={setStat}>
        <option value="">None entered</option>
        {#each GLYPH_SECONDARY_STATS as s (s)}<option value={s}>{statLabel(s)}</option>{/each}
      </select>
    </label>
    {#if def}
      <label class="field">
        <span class="micro-label">Value {secondaryUnit(stat)} ({def.minValue}-{def.maxValue})</span>
        <input type="text" inputmode="decimal" aria-label="Secondary value" {value} onchange={setValue} />
      </label>
    {/if}
  {:else if info?.tier === 'major'}
    <p class="effect">{majorText(glyph.glyphType, glyph.rarity)}</p>
    {#if inertIn.length}<p class="warn" data-testid="glyph-inert">Inert in {inertIn.join(', ')}: its sigil is not equipped</p>{/if}
  {:else}
    <p class="effect">{glyphText(glyph)}</p>
  {/if}

  {#if mountName}<p class="where">On {mountName}</p>{/if}
  {#if info?.tier === 'minor' || info?.tier === 'major'}
    {#if !glyph.sealed}
      <button type="button" class="btn-ghost small" onclick={() => onUpdate({ sealed: true })}>Mark sealed</button>
    {/if}
  {/if}
  <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
</div>

<style>
  .glyph-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: var(--space-2);
    text-align: center;
  }
  .glyph-card.inert {
    opacity: 0.7;
  }
  .glyph-art {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: var(--radius-field);
  }
  .glyph-name {
    margin: 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--rarity-fg-strong, var(--color-ink));
  }
  .tier {
    display: block;
    font-size: 9.5px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-dim);
  }
  .effect {
    margin: 0;
    font-size: 11px;
    color: var(--color-soft);
  }
  .sealed {
    color: var(--color-warning);
  }
  .warn {
    margin: 0;
    font-size: 10px;
    color: var(--color-warning);
  }
  .where {
    margin: 0;
    font-size: 10px;
    color: var(--color-muted);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }
  .field select,
  .field input {
    width: 100%;
    box-sizing: border-box;
  }
  .small {
    font-size: 10px;
    padding: 3px 6px;
  }
</style>
