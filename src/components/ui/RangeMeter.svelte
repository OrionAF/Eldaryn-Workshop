<script>
  /**
   * RangeMeter.svelte - where a rolled value sits in its range, on one line: `min [━━━●───] max  54%`.
   * One widget for every "roll" in the app (gear secondaries, stones, glyphs, Pet Core secondaries),
   * replacing a separate "Range a to b" line plus a bar under it. The ends are visible text, so the
   * range is never only a tooltip.
   *
   * Props: min, max, value (all in the unit shown), `fraction` (0..1) overrides the position worked out
   * from value (a score's own roll), `tone` 'high' | 'low' | null (stat priority: gold or faded),
   * `unit` ('%' after the max), `showPct` (the position as a percent after the bar), `label` (names
   * the meter for assistive tech), `compact` (no ends; just the bar and percent), `format` (n => text for
   * the ends and the spoken value, e.g. format.js formatFlat for flat stats; plain decimals otherwise).
   */
  let { min = 0, max = 1, value = null, fraction = null, tone = null, unit = '', showPct = true, label = '', compact = false, title = '', format = null } = $props();

  const plain = (n) => String(+Number(n).toFixed(2));
  const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? '–' : (format ?? plain)(Number(n)));
  const pos = $derived.by(() => {
    if (fraction != null && Number.isFinite(fraction)) return Math.min(1, Math.max(0, fraction));
    if (value == null || !(max > min)) return null;
    return Math.min(1, Math.max(0, (Number(value) - min) / (max - min)));
  });
  const pct = $derived(pos == null ? null : Math.round(pos * 100));
</script>

<span
  class="range-meter"
  class:tone-high={tone === 'high'}
  class:tone-low={tone === 'low'}
  class:compact
  class:no-pct={!showPct}
  role="meter"
  aria-label={label || undefined}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value ?? undefined}
  aria-valuetext={value == null ? undefined : `${fmt(value)}${unit} in ${fmt(min)} to ${fmt(max)}${unit}${pct == null ? '' : `, ${pct}% of the range`}`}
  title={title || undefined}
>
  {#if !compact}<span class="end num lo">{fmt(min)}</span>{/if}
  <span class="track">
    {#if pct != null}
      <span class="stat-fill" style:width="{pct}%"></span>
      <span class="knob" style:left="{pct}%"></span>
    {/if}
  </span>
  {#if !compact}<span class="end num hi">{fmt(max)}{unit}</span>{/if}
  {#if showPct}<span class="pct num">{pct == null ? '' : `${pct}%`}</span>{/if}
</span>

<style>
  .range-meter {
    --meter-c: var(--brass-400);
    display: inline-grid;
    /* fixed end widths, so the bars of stacked meters start and stop at the same x; a parent whose ends
       are longer (flat stats such as "2.070") widens them with --meter-lo / --meter-hi */
    grid-template-columns: var(--meter-lo, 4.5ch) minmax(3rem, 1fr) var(--meter-hi, 6.5ch) 4ch;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    min-width: 0;
    font-family: var(--font-data); /* ch, the end widths' unit, is then a digit */
    font-size: var(--fs-11);
    color: var(--text-muted);
  }
  .range-meter.compact { grid-template-columns: minmax(2rem, 1fr) 4ch; }
  /* no percent column: the bar takes its width instead of leaving it empty */
  .range-meter.no-pct { grid-template-columns: var(--meter-lo, 4.5ch) minmax(3rem, 1fr) var(--meter-hi, 6.5ch); }
  .range-meter.compact.no-pct { grid-template-columns: minmax(2rem, 1fr); }
  .range-meter.tone-high { --meter-c: var(--brass-200); }
  .range-meter.tone-low { --meter-c: var(--text-muted); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .end.lo { text-align: right; }
  .track {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: var(--line-hairline);
  }
  .stat-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 2px;
    background: color-mix(in srgb, var(--meter-c) 70%, transparent);
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--meter-c);
    box-shadow: 0 0 0 2px var(--surface-2);
    transform: translate(-50%, -50%);
  }
  .pct { text-align: right; color: var(--text-soft); }
  .tone-high .pct { color: var(--brass-200); }
</style>
