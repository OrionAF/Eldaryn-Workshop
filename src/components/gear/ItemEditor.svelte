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
  import { emptyItem, maxItemLevel, secondarySlots, conduitAllowed } from '../../lib/model/equipment.js';
  import { slotLabel, toDisplay, fromDisplay, parseFlat, formatFlat, rarityColor } from './gearFormat.js';

  let { value = null, realm = 'base', slot, class: cls = null, onchange } = $props();

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
  function setRowValue(i, text) {
    const next = rows.map((r) => ({ ...r }));
    if (!next[i].type) return;
    next[i] = { ...next[i], value: fromDisplay(next[i].type, text) };
    setRows(next);
  }
  function optionsFor(i) {
    const taken = new Set(rows.filter((_, j) => j !== i).map((r) => r.type));
    return pool.filter((s) => !taken.has(s.type));
  }
  function rangeHint(type) {
    const def = SECONDARY_STAT_POOL.find((s) => s.type === type);
    return def ? `Range ${toDisplay(type, def.minValue)} to ${toDisplay(type, def.maxValue)}` : '';
  }
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
        onchange={(e) => emit({ itemLevel: intOrNull(e.currentTarget.value) })}
      />
    </label>

    <label class="field">
      <span class="label">Quality (1-100)</span>
      <input
        type="number"
        aria-label="Quality"
        min="1"
        max="100"
        value={item.quality ?? ''}
        onchange={(e) => emit({ quality: intOrNull(e.currentTarget.value) })}
      />
    </label>

    <label class="field">
      <span class="label">Attack</span>
      <input
        type="text"
        inputmode="decimal"
        aria-label="Attack"
        value={formatFlat(item.primaryStats.attack)}
        onchange={(e) => emit({ primaryStats: { ...item.primaryStats, attack: parseFlat(e.currentTarget.value) } })}
      />
    </label>

    <label class="field">
      <span class="label">Health</span>
      <input
        type="text"
        inputmode="decimal"
        aria-label="Health"
        value={formatFlat(item.primaryStats.hp)}
        onchange={(e) => emit({ primaryStats: { ...item.primaryStats, hp: parseFlat(e.currentTarget.value) } })}
      />
    </label>
  </div>

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
</style>
