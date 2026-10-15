<script>
  /**
   * ItemEditor.svelte - edit one gear item (rarity, item level, quality, Attack/Health, class-gated
   * secondaries, conduit). Generic on purpose: Drop Check reuses it for the candidate item.
   *
   * Props: value (Item | null), realm ('base' | 'oblivion'), slot, class (the character class; gates
   * the secondary pool), onchange(item | null). The editor never normalises: it emits the edited
   * item and the receiver (store mutator / model/equipment.js normaliseItem) trims it. Inputs commit
   * on `change` (blur / Enter), so a half-typed number is never clamped under the cursor.
   */
  import { RARITIES, secondaryPoolFor, SECONDARY_STAT_POOL, CONDUIT } from '../../lib/game/gear.js';
  import { emptyItem, maxItemLevel, secondarySlots, conduitAllowed, secondaryStatMaxValue, itemStatLevel, itemWarnings } from '../../lib/model/equipment.js';
  import { slotLabel, toDisplay, fromDisplay, parseFlat, flatFieldText, rarityColor } from './gearFormat.js';

  // `ascension` (optional) is the character's Ascension step: an item above what it drops gets a warning.
  let { value = null, realm = 'base', slot, class: cls = null, ascension = null, onchange } = $props();

  const uid = $props.id();

  // Out-of-range input is clamped, not dropped, and the field says so: { itemLevel, quality, 'sec0'... } -> message.
  let flags = $state({});
  $effect(() => {
    slot;
    flags = {};
  });
  const flag = (key, msg) => (flags = { ...flags, [key]: msg });

  const item = $derived(value ?? emptyItem());
  const pool = $derived(cls ? secondaryPoolFor(cls) : SECONDARY_STAT_POOL);
  const rowCount = $derived(secondarySlots(item.rarity));
  const rows = $derived(
    Array.from({ length: rowCount }, (_, i) => item.secondaryStats[i] ?? { type: '', value: '' }),
  );
  const levelMax = $derived(maxItemLevel(realm));
  const showConduit = $derived(conduitAllowed(item.rarity, realm));

  function emit(patch) {
    onchange?.({ ...item, ...patch });
  }

  function setRows(next) {
    emit({ secondaryStats: next.filter((r) => r.type).map((r) => ({ type: r.type, value: Number(r.value) || 0 })) });
  }
  function setRowType(i, type) {
    const next = rows.map((r) => ({ ...r }));
    next[i] = { type, value: type ? next[i].value || 0 : '' };
    setRows(next);
  }
  /** Highest roll of a secondary at this item's level (gear.md §4), in the unit the field shows. */
  function secondaryMax(type) {
    const max = secondaryStatMaxValue(type, itemStatLevel(item.itemLevel ?? levelMax, realm));
    return max == null ? null : max;
  }
  function setRowValue(i, text) {
    const next = rows.map((r) => ({ ...r }));
    if (!next[i].type) return;
    let v = fromDisplay(next[i].type, text);
    const max = secondaryMax(next[i].type);
    if (max != null && v > max) {
      flag(`sec${i}`, `${toDisplay(next[i].type, v)} is above the highest roll at this item level; set to ${toDisplay(next[i].type, max)}.`);
      v = max;
    } else flag(`sec${i}`, '');
    next[i] = { ...next[i], value: v };
    setRows(next);
  }
  function setBounded(key, text, lo, hi) {
    const n = intOrNull(text);
    if (n == null) {
      flag(key, '');
      return null;
    }
    const clamped = Math.min(hi, Math.max(lo, Math.floor(n)));
    flag(key, clamped !== n ? `${n} is outside ${lo} to ${hi}; set to ${clamped}.` : '');
    return clamped;
  }
  function optionsFor(i) {
    const taken = new Set(rows.filter((_, j) => j !== i).map((r) => r.type));
    return pool.filter((s) => !taken.has(s.type));
  }
  function rangeHint(type) {
    const def = SECONDARY_STAT_POOL.find((s) => s.type === type);
    const max = secondaryMax(type);
    return def && max != null ? `${toDisplay(type, def.minValue)} to ${toDisplay(type, max)} at item level ${item.itemLevel ?? levelMax}` : '';
  }
  const warnings = $derived(itemWarnings(item, { realm, ascension }));
  function intOrNull(text) {
    const t = String(text).trim();
    return t === '' ? null : Number(t);
  }
</script>

<div class="item-editor" data-slot={slot}>
  <div class="editor-head">
    <p class="micro-label">{slotLabel(cls, slot)}</p>
    <button type="button" class="btn-ghost" disabled={!value} onclick={() => onchange?.(null)}>Clear slot</button>
  </div>

  <div class="grid">
    <label class="field">
      <span class="label">Rarity</span>
      <select
        aria-label="Rarity"
        value={item.rarity ?? ''}
        style="color: {rarityColor(item.rarity)}"
        onchange={(e) => emit({ rarity: e.currentTarget.value || null })}
      >
        <option value="">Unknown</option>
        {#each RARITIES as r (r.id)}
          <option value={r.id}>{r.name}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="label">Item level (1-{levelMax})</span>
      <input
        type="number"
        aria-label="Item level"
        min="1"
        max={levelMax}
        value={item.itemLevel ?? ''}
        aria-describedby="{uid}-il"
        onchange={(e) => emit({ itemLevel: setBounded('itemLevel', e.currentTarget.value, 1, levelMax) })}
      />
      <span class="range" id="{uid}-il">Range 1 to {levelMax}</span>
      {#if flags.itemLevel}<span class="flag" role="alert">{flags.itemLevel}</span>{/if}
    </label>

    <label class="field">
      <span class="label">Quality (1-100)</span>
      <input
        type="number"
        aria-label="Quality"
        min="1"
        max="100"
        value={item.quality ?? ''}
        aria-describedby="{uid}-q"
        onchange={(e) => emit({ quality: setBounded('quality', e.currentTarget.value, 1, 100) })}
      />
      <span class="range" id="{uid}-q">Range 1 to 100</span>
      {#if flags.quality}<span class="flag" role="alert">{flags.quality}</span>{/if}
    </label>

    <label class="field">
      <span class="label">Attack</span>
      <input
        type="text"
        inputmode="decimal"
        aria-label="Attack"
        value={flatFieldText(item.primaryStats.attack)}
        onchange={(e) => emit({ primaryStats: { ...item.primaryStats, attack: parseFlat(e.currentTarget.value) } })}
      />
    </label>

    <label class="field">
      <span class="label">Health</span>
      <input
        type="text"
        inputmode="decimal"
        aria-label="Health"
        value={flatFieldText(item.primaryStats.hp)}
        onchange={(e) => emit({ primaryStats: { ...item.primaryStats, hp: parseFlat(e.currentTarget.value) } })}
      />
    </label>
  </div>

  {#each warnings as w (w.kind)}
    <p class="flag" role="status">Item level {w.itemLevel} is above what your Ascension step drops (up to {w.cap}).</p>
  {/each}

  <h3 class="subheading">Secondary stats ({item.secondaryStats.length}/{rowCount})</h3>
  {#if rowCount === 0}
    <p class="hint">A {item.rarity ? RARITIES.find((r) => r.id === item.rarity)?.name : ''} item has no secondary stats.</p>
  {:else}
    <div class="secondary-rows">
      {#each rows as row, i (i)}
        <div class="secondary-row">
          <select aria-label={`Secondary ${i + 1} stat`} value={row.type} onchange={(e) => setRowType(i, e.currentTarget.value)}>
            <option value="">None</option>
            {#each optionsFor(i) as s (s.type)}
              <option value={s.type}>{s.label}</option>
            {/each}
          </select>
          <input
            type="text"
            inputmode="decimal"
            aria-label={`Secondary ${i + 1} value`}
            title={rangeHint(row.type)}
            disabled={!row.type}
            value={row.type ? toDisplay(row.type, row.value) : ''}
            onchange={(e) => setRowValue(i, e.currentTarget.value)}
          />
          <span class="unit">%</span>
        </div>
        {#if row.type}<span class="range">Range {rangeHint(row.type)}</span>{/if}
        {#if flags[`sec${i}`]}<span class="flag" role="alert">{flags[`sec${i}`]}</span>{/if}
      {/each}
    </div>
  {/if}

  {#if showConduit}
    <h3 class="subheading">Conduit</h3>
    <div class="secondary-row">
      <select
        aria-label="Conduit type"
        value={item.conduit?.type ?? ''}
        onchange={(e) => emit({ conduit: e.currentTarget.value ? { type: e.currentTarget.value, value: item.conduit?.value ?? 0 } : null })}
      >
        <option value="">None</option>
        {#each CONDUIT.types as t (t)}
          <option value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
        {/each}
      </select>
      <input
        type="text"
        inputmode="decimal"
        aria-label="Conduit value"
        disabled={!item.conduit}
        value={item.conduit ? item.conduit.value : ''}
        onchange={(e) => item.conduit && emit({ conduit: { ...item.conduit, value: Number(e.currentTarget.value) || 0 } })}
      />
      <span class="unit"></span>
    </div>
  {/if}
</div>

<style>
  .item-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .editor-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .editor-head .micro-label {
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: var(--space-2) var(--space-4);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .label {
    font-size: 11px;
    color: var(--color-dim);
  }
  .subheading {
    margin: var(--space-3) 0 var(--space-1);
  }
  .secondary-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .secondary-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem 1rem;
    gap: var(--space-2);
    align-items: center;
  }
  .unit {
    color: var(--color-muted);
    font-size: 11px;
  }
  .hint {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .range {
    color: var(--text-muted, var(--color-muted));
    font-size: 11px;
    font-family: var(--font-data);
  }
  .flag {
    color: var(--status-warn, var(--color-gold-light));
    font-size: 11.5px;
    margin: 0;
  }
</style>
