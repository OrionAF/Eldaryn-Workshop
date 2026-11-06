<script>
  /**
   * ItemEditor.svelte - edit one gear item (rarity, material, item level, Attack/Health, class-gated
   * secondaries, conduit). Generic on purpose: Drop Check reuses it for the candidate item.
   * Quality is shown, never entered: the game derives it from the secondaries (gear.md §5).
   * `score` (features/gearScore.js, scored for `specName`) adds a grade line, a roll bar per secondary
   * and marks each secondary's priority for that spec.
   *
   * Props: value (Item | null), realm ('base' | 'oblivion'), slot, class (the character class; gates
   * the secondary pool), onchange(item | null). The editor never normalises: it emits the edited
   * item and the receiver (store mutator / model/equipment.js normaliseItem) trims it. Inputs commit
   * on blur / Enter (ui/NumberField), so a half-typed number is never clamped under the cursor.
   * Lowering the item level lowers every secondary's highest roll, and the model clamps to it; the
   * editor names each stat that will drop before it happens.
   *
   * Layout: a container (container queries), so one editor serves the wide Gear panel (each secondary
   * is one line: stat, value, RangeMeter) and the narrow Drop Check column (the meter drops under).
   */
  import { RARITIES, secondaryPoolFor, SECONDARY_STAT_POOL, CONDUIT, calculateItemQuality, itemTypesFor } from '../../lib/game/gear.js';
  import { emptyItem, maxItemLevel, secondarySlots, conduitAllowed, secondaryStatMaxValue, itemStatLevel, itemWarnings } from '../../lib/model/equipment.js';
  import { slotLabel, statLabel, toDisplay, fromDisplay } from './gearFormat.js';
  import { orderStats } from '../../lib/ui/statOrder.js';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Button from '../ui/Button.svelte';
  import RangeMeter from '../ui/RangeMeter.svelte';

  // `ascension` (optional) is the character's Ascension step: an item above what it drops gets a warning.
  // `showSlotLabel` false when the surrounding panel already titles the slot (Gear page).
  let { value = null, realm = 'base', slot, class: cls = null, ascension = null, score = null, specName = '', showSlotLabel = true, onchange } = $props();

  // Out-of-range input is clamped, not dropped, and the field says so: { itemLevel, 'sec0'... } -> message.
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
  const pool = $derived(orderStats(cls ? secondaryPoolFor(cls) : SECONDARY_STAT_POOL, cls, (stat) => stat.type));
  const rowCount = $derived(secondarySlots(item.rarity));
  const typeOptions = (i) => [{ value: '', label: 'None' }, ...optionsFor(i).map((s) => ({ value: s.type, label: s.label }))];
  const rarityOptions = [{ value: '', label: 'Unknown' }, ...RARITIES.map((r) => ({ value: r.id, label: r.name }))];
  const conduitOptions = [{ value: '', label: 'None' }, ...CONDUIT.types.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))];
  const rows = $derived(
    Array.from({ length: rowCount }, (_, i) => item.secondaryStats[i] ?? { type: '', value: '' }),
  );
  const levelMax = $derived(maxItemLevel(realm));
  const levelShown = $derived(item.itemLevel ?? levelMax);
  const quality = $derived(item.itemLevel == null ? null : calculateItemQuality({ secondaryStats: item.secondaryStats, itemLevel: item.itemLevel, realm }));
  const typeChoices = $derived(itemTypesFor(item.rarity));
  const materialOptions = $derived(typeChoices.map((t) => ({ value: t.type, label: t.displayName })));
  const pct = (f) => `${Math.round(f * 100)}%`;
  const scoreTitle = $derived(
    !score
      ? ''
      : score.grade
        ? `Scored for ${specName}. Stats ${pct(score.fit)}: its secondaries' priority against the best ${rowCount} this rarity can hold. Roll ${pct(score.roll)}: how far each secondary sits up its range at this item level.`
        : 'Mean position of each secondary in its range at this item level. No stat priorities for this class, so no score.',
  );
  const secTitle = (sc) =>
    [sc?.weight != null ? `${pct(sc.weight)} priority for ${specName}` : null, sc?.roll != null ? `${pct(sc.roll)} of range` : null].filter(Boolean).join(', ');
  /** Stat priority as the meter's tone: gold for a high-priority secondary, faded for a low one. */
  const toneOf = (sc) => (sc?.weight == null ? null : sc.weight >= 2 / 3 ? 'high' : sc.weight < 1 / 3 ? 'low' : null);
  const showConduit = $derived(conduitAllowed(item.rarity, realm));
  const qualityCaption = $derived(
    quality != null ? 'From the rolls' : rowCount === 0 ? 'No secondaries' : item.itemLevel == null ? 'Set the item level' : 'Add a secondary',
  );
  const qualityWhy = $derived(
    quality != null
      ? "From the secondaries' rolls at this item level. The game works it out, so it is not typed in."
      : rowCount === 0
        ? 'No secondaries, so no quality.'
        : item.itemLevel == null
          ? 'Set the item level to work it out.'
          : 'Add a secondary to work it out.',
  );

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
  /** A secondary's roll range at this item level, in the unit the field shows (gear.md §4). */
  function rangeOf(type) {
    const def = SECONDARY_STAT_POOL.find((s) => s.type === type);
    const max = secondaryMax(type);
    return def && max != null ? { min: Number(toDisplay(type, def.minValue)), max: Number(toDisplay(type, max)) } : null;
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
  const warnings = $derived(itemWarnings(item, { realm, ascension }));
</script>

<div class="item-editor" data-slot={slot}>
  <div class="editor-head">
    {#if showSlotLabel}<p class="head-label">{slotLabel(cls, slot)}</p>{/if}
    {#if score}
      <p class="item-score" title={scoreTitle} data-testid="gear-score">
        {#if score.grade}
          <span class="roll-grade grade-{score.grade}">{score.grade}</span>
          <span class="num">Score {pct(score.score)}</span>
        {/if}
        <span class="score-parts">{#if score.grade}Stats <span class="num">{pct(score.fit)}</span>{' · '}{/if}Roll <span class="num">{pct(score.roll)}</span></span>
      </p>
    {/if}
    <span class="grow"></span>
    <Button variant="ghost" size="small" disabled={!value} onclick={() => onchange?.(null)}>Clear slot</Button>
  </div>

  <div class="grid">
    <Select label="Rarity" options={rarityOptions} value={item.rarity ?? ''} onchange={(v) => emit({ rarity: v || null, itemType: null })} />
    {#if typeChoices.length > 1}
      <Select label="Material" options={materialOptions} value={item.itemType ?? typeChoices[0].type} onchange={(v) => emit({ itemType: v })} />
    {/if}

    {#key epoch.itemLevel}
      <div class="cell">
        <NumberField label="Item level (1-{levelMax})" nullable value={item.itemLevel} onchange={setItemLevel} />
        {#if flags.itemLevel}<span class="flag" role="alert">{flags.itemLevel}</span>{/if}
      </div>
    {/key}

    <!-- Quality is a readout in the same box shape as the fields, so the row stays level. -->
    <div class="cell" data-testid="item-quality" title={qualityWhy}>
      <span class="readout-label">Quality</span>
      <span class="readout" class:is-empty={quality == null}>
        <span class="num">{quality ?? '–'}</span>
        {#if quality != null}<span class="q-bar" aria-hidden="true"><span style:width="{Math.min(100, quality)}%"></span></span>{/if}
      </span>
      <span class="caption">{qualityCaption}<span class="visually-hidden">. {qualityWhy}</span></span>
    </div>

    <NumberField label="Attack" statKey="totalAttack" value={item.primaryStats.attack} onchange={(n) => emit({ primaryStats: { ...item.primaryStats, attack: n } })} />
    <NumberField label="Health" statKey="totalHp" value={item.primaryStats.hp} onchange={(n) => emit({ primaryStats: { ...item.primaryStats, hp: n } })} />
  </div>

  {#each warnings as w (w.kind)}
    <p class="flag" role="status">Item level {w.itemLevel} is above what your Ascension step drops (up to {w.cap}).</p>
  {/each}
  {#if flags.itemLevelSec}<p class="flag" role="status">{flags.itemLevelSec}</p>{/if}

  <div class="sec-head">
    <h3 class="sub-head">Secondary stats ({item.secondaryStats.length}/{rowCount})</h3>
    {#if rowCount > 0}<span class="sec-note">Ranges at item level <span class="num">{levelShown}</span></span>{/if}
  </div>
  {#if rowCount === 0}
    <p class="hint">A {item.rarity ? RARITIES.find((r) => r.id === item.rarity)?.name : ''} item has no secondary stats.</p>
  {:else}
    <!-- One line per secondary: stat, value, and where the value sits in its range (RangeMeter). -->
    <div class="secondary-rows">
      <div class="sec-cols" aria-hidden="true"><span>Stat</span><span class="r">Value</span><span class="c-roll">Roll in range</span></div>
      {#each rows as row, i (i)}
        {@const sc = score?.secondaries.find((x) => x.type === row.type)}
        {@const rg = row.type ? rangeOf(row.type) : null}
        <div class="secondary-row">
          <Select hideLabel label="Secondary {i + 1} stat" options={typeOptions(i)} value={row.type} onchange={(v) => setRowType(i, v)} />
          {#key epoch[`sec${i}`]}
            <NumberField
              hideLabel
              label="Secondary {i + 1} value"
              unit="%"
              disabled={!row.type}
              value={row.type ? Number(toDisplay(row.type, row.value)) : null}
              onchange={(n) => setRowValue(i, n)}
            />
          {/key}
          <div class="c-meter">
            {#if rg}
              <RangeMeter
                min={rg.min}
                max={rg.max}
                value={Number(toDisplay(row.type, row.value))}
                fraction={sc?.roll ?? null}
                tone={toneOf(sc)}
                unit="%"
                label="{statLabel(row.type)} roll"
                title={secTitle(sc)}
              />
            {:else}
              <span class="meter-empty">Pick a stat</span>
            {/if}
          </div>
          {#if flags[`sec${i}`]}<span class="flag row-flag" role="alert">{flags[`sec${i}`]}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if showConduit}
    <h3 class="sub-head sec-head">Conduit</h3>
    <div class="conduit-row">
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
  /* A container, so the same editor lays out for the wide Gear panel and the narrow Drop Check column. */
  .item-editor { container-type: inline-size; display: flex; flex-direction: column; gap: var(--sp-3); }
  .editor-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); min-height: var(--control-h); }
  .grow { flex: 1; }
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
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 11rem)); gap: var(--sp-3) var(--sp-4); align-items: start; }
  .cell { display: grid; gap: var(--field-gap); min-width: 0; align-content: start; }
  .readout-label { font-size: var(--fs-12); line-height: var(--field-label-h); font-weight: var(--fw-bold); color: var(--text-soft); }
  .readout {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-2);
    border: 1px dashed var(--line-control);
    border-radius: var(--r-1);
    font-size: var(--fs-13);
    color: var(--text-ink);
    cursor: help;
  }
  .readout.is-empty { color: var(--text-muted); }
  .q-bar { position: absolute; left: 3px; right: 3px; bottom: 3px; height: 2px; border-radius: 1px; background: var(--line-hairline); overflow: hidden; }
  .q-bar span { display: block; height: 100%; background: var(--brass-400); }
  .caption { font-size: var(--fs-11); color: var(--text-muted); }
  .sec-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); margin-top: var(--sp-2); }
  .sec-note { font-size: var(--fs-12); color: var(--text-muted); }
  .secondary-rows { display: grid; gap: var(--sp-2); max-width: 52rem; }
  .sec-cols,
  .secondary-row,
  .conduit-row {
    display: grid;
    grid-template-columns: minmax(8rem, 15rem) minmax(5.5rem, 7rem) minmax(10rem, 1fr);
    gap: var(--sp-1) var(--sp-3);
    align-items: center;
  }
  .conduit-row { align-items: start; max-width: 52rem; }
  .sec-cols { font-size: var(--fs-11); font-weight: var(--fw-bold); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .sec-cols .r { text-align: right; }
  .c-meter { min-width: 0; }
  .meter-empty { font-size: var(--fs-12); color: var(--text-disabled); }
  .row-flag { grid-column: 1 / -1; }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .flag { color: var(--status-warn); font-size: var(--fs-12); margin: 0; }
  .item-score { margin: 0; display: inline-flex; align-items: baseline; gap: var(--sp-2); font-size: var(--fs-12); color: var(--text-muted); cursor: help; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  /* Narrow (Drop Check column, phone): stat and value side by side, the meter on its own line under them. */
  @container (max-width: 32rem) {
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sec-cols, .secondary-row, .conduit-row { grid-template-columns: minmax(0, 1fr) 6.5rem; }
    .sec-cols .c-roll { display: none; }
    .c-meter { grid-column: 1 / -1; padding-bottom: var(--sp-1); }
  }
</style>
