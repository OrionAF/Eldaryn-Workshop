<script>
  /**
   * LevelRange.svelte - Stat Priorities' level picker: the preset brackets as chips, a field that
   * takes one level or a range ("74", "60-64"), and a players-per-level strip (linear bars from zero)
   * where a click picks one level, a drag a range and Shift+click extends the current range.
   * `value` is a range key (statPriority.js rangeKey); `onchange(key)` reports a new one.
   */
  import { MAX_LEVEL, parseLevelRange, playersIn, rangeKey } from '../../lib/features/statPriority.js';

  let { data, spec, presets, value, onchange } = $props();
  const id = $props.id();

  // the strip starts at the lowest level any spec was captured at
  const first = $derived(Math.min(...Object.values(data.levels).flatMap((lv) => Object.keys(lv).map(Number))));
  const n = $derived(MAX_LEVEL - first + 1);
  const counts = $derived(Array.from({ length: n }, (_, i) => data.levels[spec]?.[first + i]?.n ?? 0));
  const max = $derived(Math.max(1, ...counts));
  const ticks = $derived(Array.from({ length: 10 }, (_, i) => (i + 1) * 10).filter((t) => t >= first));

  let drag = $state(null); // { anchor, lo, hi } while a pointer is down on the strip
  let hover = $state(null); // level under the pointer
  let invalid = $state(false);
  let bars;

  const sel = $derived(drag ? [drag.lo, drag.hi] : (parseLevelRange(value) ?? [0, -1]));
  const shown = $derived(drag ? rangeKey(sel) : value);
  const count = $derived(playersIn(data, spec, sel[0], sel[1]));

  function commit(text) {
    const r = parseLevelRange(text);
    invalid = !r;
    if (r) onchange(rangeKey(r));
  }

  function levelAt(e) {
    const r = bars.getBoundingClientRect();
    return Math.max(first, Math.min(MAX_LEVEL, first + Math.floor(((e.clientX - r.left) / r.width) * n)));
  }
  function down(e) {
    if (e.button !== 0) return;
    const l = levelAt(e);
    const anchor = e.shiftKey ? (parseLevelRange(value)?.[0] ?? l) : l;
    drag = { anchor, lo: Math.min(anchor, l), hi: Math.max(anchor, l) };
    bars.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function move(e) {
    const l = levelAt(e);
    hover = l;
    if (drag) drag = { ...drag, lo: Math.min(drag.anchor, l), hi: Math.max(drag.anchor, l) };
  }
  function up() {
    if (!drag) return;
    const r = [drag.lo, drag.hi];
    drag = null;
    invalid = false;
    onchange(rangeKey(r));
  }
</script>

<div class="level-range">
  <div class="chips" role="group" aria-label="Level bracket">
    {#each presets as b (b.key)}
      <button type="button" class="chip" aria-pressed={b.key === value} onclick={() => onchange(b.key)}>
        Lv {b.key}<span class="n">{b.players}</span>
      </button>
    {/each}
  </div>
  <div class="custom">
    <div class="field">
      <label class="micro-label" for="{id}-range">Levels</label>
      <div class="field-row">
        <input
          id="{id}-range"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="74 or 60-64"
          aria-describedby="{id}-hint"
          aria-invalid={invalid ? 'true' : undefined}
          value={shown}
          onchange={(e) => commit(e.currentTarget.value)}
          onkeydown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
        />
        <span class="count num" aria-live="polite">{count.toLocaleString('en-US')} player{count === 1 ? '' : 's'}</span>
      </div>
    </div>
    <div class="strip">
      {#if hover != null && !drag}
        <span class="peek" style="left: {((hover - first + 0.5) / n) * 100}%">
          Lv <b class="num">{hover}</b>: <span class="num">{counts[hover - first]}</span>
        </span>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bars"
        style="grid-template-columns: repeat({n}, 1fr)"
        aria-hidden="true"
        bind:this={bars}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={() => (drag = null)}
        onpointerleave={() => (hover = null)}
      >
        {#each counts as c, i (i)}
          <span class:on={first + i >= sel[0] && first + i <= sel[1]}><i style="height: {(c / max) * 100}%"></i></span>
        {/each}
      </div>
      <div class="axis" aria-hidden="true">
        {#each ticks as t (t)}<span class="num" style="left: {((t - first + 0.5) / n) * 100}%">{t}</span>{/each}
      </div>
    </div>
    <p class="hint" id="{id}-hint">
      Type one level or a range and press Enter, or click a bar for one level and drag across bars for a range. Bars are players per level.
    </p>
  </div>
</div>

<style>
  .level-range { display: grid; gap: var(--sp-3); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-pill);
    color: var(--text-soft);
    font-size: var(--fs-13);
    cursor: pointer;
  }
  .chip:hover { border-color: var(--line-control-hover); color: var(--text-ink); }
  .chip[aria-pressed='true'] { background: var(--ember-500); border-color: var(--ember-500); color: var(--on-ember); font-weight: var(--fw-bold); }
  .chip[aria-pressed='true'] .n { color: var(--on-ember); }
  .custom { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-1) var(--sp-5); align-items: end; }
  .field { display: grid; gap: var(--sp-1); }
  .field-row { display: flex; align-items: center; gap: var(--sp-2); }
  input {
    width: 7.5rem;
    min-height: var(--control-h);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  input[aria-invalid='true'] { border-color: var(--verdict-down); }
  .count { font-size: var(--fs-12); color: var(--text-muted); white-space: nowrap; }
  .strip { position: relative; min-width: 0; }
  .bars {
    display: grid;
    gap: 1px;
    height: 40px;
    cursor: pointer;
    touch-action: pan-y;
    user-select: none;
    border-bottom: 1px solid var(--line-rule);
  }
  .bars span { display: flex; align-items: flex-end; border-radius: var(--r-1) var(--r-1) 0 0; }
  .bars span.on { background: var(--ember-tint); }
  .bars i { display: block; width: 100%; background: var(--line-control); border-radius: var(--r-1) var(--r-1) 0 0; }
  .bars span.on i { background: var(--ember-500); }
  .axis { position: relative; height: 16px; font-size: var(--fs-11); color: var(--text-muted); }
  .axis span { position: absolute; top: 1px; transform: translateX(-50%); }
  .peek {
    position: absolute;
    bottom: calc(100% - 4px);
    transform: translateX(-50%);
    padding: 2px var(--sp-2);
    background: var(--surface-4);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
    font-size: var(--fs-12);
    color: var(--text-soft);
    white-space: nowrap;
    pointer-events: none;
  }
  .hint { grid-column: 1 / -1; margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
  @media (max-width: 700px) {
    .custom { grid-template-columns: minmax(0, 1fr); }
  }
</style>
