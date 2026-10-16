<script>
  /**
   * ItemEditor.svelte - edit one gear item (rarity, item level, quality, Attack/Health, class-gated
   * secondaries, conduit). Generic on purpose: Drop Check reuses it for the candidate item.
   *
   * Props: value (Item | null), realm ('base' | 'oblivion'), slot, class (the character class; gates
   * the secondary pool), onchange(item | null). The editor never normalises: it emits the edited
   * item and the receiver (store mutator / model/equipment.js normaliseItem) trims it. Inputs commit
   * on blur / Enter (ui/NumberField), so a half-typed number is never clamped under the cursor.
   * Lowering the item level lowers every secondary's highest roll, and the model clamps to it; the
   * editor names each stat that will drop before it happens.
   */
  import { RARITIES, secondaryPoolFor, SECONDARY_STAT_POOL, CONDUIT } from '../../lib/game/gear.js';
  import { emptyItem, maxItemLevel, secondarySlots, conduitAllowed, secondaryStatMaxValue, itemStatLevel, itemWarnings } from '../../lib/model/equipment.js';
  import { slotLabel, statLabel, toDisplay, fromDisplay } from './gearFormat.js';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Button from '../ui/Button.svelte';

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
  // A clamped value leaves the field showing what was typed; remounting it shows the stored value again.
  let epoch = $state({});
  const bump = (key) => (epoch = { ...epoch, [key]: (epoch[key] ?? 0) + 1 });

  const item = $derived(value ?? emptyItem());
  const pool = $derived(cls ? secondaryPoolFor(cls) : SECONDARY_STAT_POOL);
  const rowCount = $derived(secondarySlots(item.rarity));
  const typeOptions = (i) => [{ value: '', label: 'None' }, ...optionsFor(i).map((s) => ({ value: s.type, label: s.label }))];
  const rarityOptions = [{ value: '', label: 'Unknown' }, ...RARITIES.map((r) => ({ value: r.id, label: r.name }))];
  const conduitOptions = [{ value: '', label: 'None' }, ...CONDUIT.types.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))];
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
  function setRowValue(i, shown) {
    const next = rows.map((r) => ({ ...r }));
    if (!next[i].type) return;
    let v = fromDisplay(next[i].type, String(shown));
    const max = secondaryMax(next[i].type);
    if (max != null && v > max) {
      flag(`sec${i}`, `${toDisplay(next[i].type, v)} is above the highest roll at this item level; set to ${toDisplay(next[i].type, max)}.`);
      v = max;
      bump(`sec${i}`);
    } else flag(`sec${i}`, '');
    next[i] = { ...next[i], value: v };
    setRows(next);
  }
  function setBounded(key, n, lo, hi) {
    if (n == null) {
      flag(key, '');
      return null;
    }
    const clamped = Math.min(hi, Math.max(lo, Math.floor(n)));
    flag(key, clamped !== n ? `${n} is outside ${lo} to ${hi}; set to ${clamped}.` : '');
    if (clamped !== n) bump(key);
    return clamped;
  }
  /** Secondaries whose current roll is above the highest roll at `level`: the model will clamp them. */
  function clampedByLevel(level) {
    return item.secondaryStats
      .map((s) => {
        const max = secondaryStatMaxValue(s.type, itemStatLevel(level, realm));
        return max != null && s.value > max ? `${statLabel(s.type)} ${toDisplay(s.type, s.value)} to ${toDisplay(s.type, max)}` : null;
      })
      .filter(Boolean);
  }
  function setItemLevel(n) {
    const level = setBounded('itemLevel', n, 1, levelMax);
    const drops = level == null ? [] : clampedByLevel(level);
    flag('itemLevelSec', drops.length ? `Item level ${level} lowers the highest roll: ${drops.join('; ')}.` : '');
    emit({ itemLevel: level });
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
</script>

<div class="item-editor" data-slot={slot}>
  <div class="editor-head">
    <p class="head-label">{slotLabel(cls, slot)}</p>
    <Button variant="ghost" size="small" disabled={!value} onclick={() => onchange?.(null)}>Clear slot</Button>
  </div>

  <div class="grid">
    <Select label="Rarity" options={rarityOptions} value={item.rarity ?? ''} onchange={(v) => emit({ rarity: v || null })} />

    {#key epoch.itemLevel}
      <div class="cell">
        <NumberField label="Item level (1-{levelMax})" nullable value={item.itemLevel} onchange={setItemLevel} />
        <span class="range" id="{uid}-il">Range 1 to {levelMax}</span>
        {#if flags.itemLevel}<span class="flag" role="alert">{flags.itemLevel}</span>{/if}
      </div>
    {/key}

    {#key epoch.quality}
      <div class="cell">
        <NumberField label="Quality (1-100)" nullable value={item.quality} onchange={(n) => emit({ quality: setBounded('quality', n, 1, 100) })} />
        <span class="range" id="{uid}-q">Range 1 to 100</span>
        {#if item.quality == null}
          <span class="range" data-testid="quality-unknown">Unknown (not in the profile). Left blank: the app's numbers do not use item quality, but the game's Total Power counts it as 0.</span>
        {/if}
        {#if flags.quality}<span class="flag" role="alert">{flags.quality}</span>{/if}
      </div>
    {/key}

    <NumberField label="Attack" statKey="totalAttack" value={item.primaryStats.attack} onchange={(n) => emit({ primaryStats: { ...item.primaryStats, attack: n } })} />
    <NumberField label="Health" statKey="totalHp" value={item.primaryStats.hp} onchange={(n) => emit({ primaryStats: { ...item.primaryStats, hp: n } })} />
  </div>

  {#each warnings as w (w.kind)}
    <p class="flag" role="status">Item level {w.itemLevel} is above what your Ascension step drops (up to {w.cap}).</p>
  {/each}
  {#if flags.itemLevelSec}<p class="flag" role="status">{flags.itemLevelSec}</p>{/if}

  <h3 class="sub-head">Secondary stats ({item.secondaryStats.length}/{rowCount})</h3>
  {#if rowCount === 0}
    <p class="hint">A {item.rarity ? RARITIES.find((r) => r.id === item.rarity)?.name : ''} item has no secondary stats.</p>
  {:else}
    <div class="secondary-rows">
      {#each rows as row, i (i)}
        <div class="secondary-row">
          <Select label="Secondary {i + 1} stat" options={typeOptions(i)} value={row.type} onchange={(v) => setRowType(i, v)} />
          {#key epoch[`sec${i}`]}
            <NumberField
              label="Secondary {i + 1} value"
              unit="%"
              disabled={!row.type}
              value={row.type ? Number(toDisplay(row.type, row.value)) : null}
              onchange={(n) => setRowValue(i, n)}
            />
          {/key}
        </div>
        {#if row.type}<span class="range">Range {rangeHint(row.type)}</span>{/if}
        {#if flags[`sec${i}`]}<span class="flag" role="alert">{flags[`sec${i}`]}</span>{/if}
      {/each}
    </div>
  {/if}

  {#if showConduit}
    <h3 class="sub-head">Conduit</h3>
    <div class="secondary-row">
      <Select
        label="Conduit type"
        options={conduitOptions}
        value={item.conduit?.type ?? ''}
        onchange={(v) => emit({ conduit: v ? { type: v, value: item.conduit?.value ?? 0 } : null })}
      />
      <NumberField
        label="Conduit value"
        disabled={!item.conduit}
        value={item.conduit ? item.conduit.value : null}
        onchange={(n) => item.conduit && emit({ conduit: { ...item.conduit, value: n } })}
      />
    </div>
  {/if}
</div>

<style>
  .item-editor { display: flex; flex-direction: column; gap: var(--sp-2); }
  .editor-head { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2); }
  .head-label,
  .sub-head {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .sub-head { margin: var(--sp-3) 0 var(--sp-1); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr)); gap: var(--sp-2) var(--sp-4); }
  .cell { display: grid; gap: 3px; min-width: 0; align-content: start; }
  .secondary-rows { display: flex; flex-direction: column; gap: var(--sp-2); }
  .secondary-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(6rem, 8rem); gap: var(--sp-2); align-items: end; }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .range { color: var(--text-muted); font-size: var(--fs-11); font-family: var(--font-data); }
  .flag { color: var(--status-warn); font-size: var(--fs-12); margin: 0; }
</style>
