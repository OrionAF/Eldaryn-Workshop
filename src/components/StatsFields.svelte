<script>
  /**
   * StatsFields.svelte - generic reusable numeric field list. The one
   * implementation of format.js's parse/format rules, shared across the
   * Profile Stats tab, the Gear Panel's Stats Summary Row, and the Item
   * Stat Input Form.
   *
   * Local per-field text "drafts" so the "." thousands-vs-decimal formatter
   * doesn't fight the user mid-keystroke: while a field is focused its draft
   * is left alone; on blur/Enter the raw text is parsed and committed via
   * onChange, then reformatted. Drafts resync from `values` for any
   * non-focused field whenever `values` changes externally (Apply, Import,
   * loadout switch).
   *
   * `otherValues`, if given, drives the grilled "bold whichever loadout is
   * numerically larger" comparison highlight - pure numeric, no per-stat
   * "which direction is better" semantics.
   *
   * `rawValues`, if given, are the PRE-soft-cap-curve raw totals matching
   * `values` (which are effective). A field whose raw exceeds its effective
   * renders "RAW <raw> · N% GAIN" under the value - the same three figures
   * the in-game stat sheet shows for a capped stat (combat-model.md §2), in
   * the game's own wording. Only meaningful with readOnly (Calculated
   * totals); Manual entry is already effective and passes none.
   *
   * GAIN answers "is another point of this worth taking?", which is the whole
   * reason a player looks at this line.
   */
  import { formatStat, parseStat } from '../lib/format.js';
  import { pvpEffect } from '../lib/dps.js';
  import { marginalGain } from '../lib/statCaps.js';

  let { values, fields, onChange = null, readOnly = false, otherValues = null, rawValues = null } = $props();

  // Strictly-over check with a display-rounding guard so float noise from the
  // curve at exactly the soft cap never shows a spurious RAW line.
  function softLine(key) {
    if (!rawValues) return null;
    const raw = Number(rawValues[key]);
    return raw - Number(values[key]) > 0.05 ? formatStat(key, raw) : null;
  }

  /** "57% GAIN" for an overcapped field, or null where the RAW line is absent. */
  function gainLine(f) {
    if (!softLine(f.key) || f.softCap == null || f.cap == null) return null;
    return `${Math.round(marginalGain(Number(rawValues[f.key]), f.softCap, f.cap) * 100)}% GAIN`;
  }

  const PVP_RATING_KEYS = new Set(['pvp_attack', 'pvp_defense']);

  let drafts = $state({});
  let focusedKey = $state(null);

  $effect(() => {
    for (const f of fields) {
      if (f.key !== focusedKey) {
        drafts[f.key] = formatStat(f.key, values[f.key]);
      }
    }
  });

  function commit(key, raw) {
    onChange?.(key, parseStat(key, raw));
  }

  function onBlur(key, e) {
    focusedKey = null;
    commit(key, e.target.value);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') e.target.blur();
  }

  function isHigher(key) {
    if (!otherValues) return false;
    return Number(values[key]) > Number(otherValues[key]);
  }
</script>

<div class="stats-fields">
  {#each fields as f (f.key)}
    <label class:highlight={isHigher(f.key)}>
      <span class="field-label">{f.label}</span>
      {#if readOnly}
        {#if softLine(f.key)}
          <span class="value-col">
            <span class="field-value">{formatStat(f.key, values[f.key])}</span>
            <span class="field-soft">RAW {softLine(f.key)}{#if gainLine(f)}{' · '}{gainLine(f)}{/if}</span>
          </span>
        {:else}
          <span class="field-value">{formatStat(f.key, values[f.key])}</span>
        {/if}
      {:else}
        <input
          type="text"
          inputmode="decimal"
          value={drafts[f.key] ?? formatStat(f.key, values[f.key])}
          oninput={(e) => (drafts[f.key] = e.target.value)}
          onfocus={() => (focusedKey = f.key)}
          onblur={(e) => onBlur(f.key, e)}
          onkeydown={onKeydown}
        />
      {/if}
      {#if PVP_RATING_KEYS.has(f.key)}
        <span class="field-derived">({pvpEffect(values[f.key]).toFixed(1)}%)</span>
      {/if}
    </label>
  {/each}
</div>

<style>
  .stats-fields {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .stats-fields label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
    padding: 0.25rem 0.4rem;
    border-radius: var(--radius, 4px);
    border-bottom: 1px solid var(--color-border-hairline, #444);
  }
  .stats-fields label:last-child {
    border-bottom: none;
  }
  .stats-fields label:hover {
    background: var(--color-field);
  }
  .stats-fields label.highlight .field-value,
  .stats-fields label.highlight input {
    font-weight: 700;
  }
  .field-label {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .stats-fields input {
    width: 7rem;
    text-align: right;
  }
  .field-derived {
    color: var(--color-muted, #999);
    font-size: 0.85rem;
  }
  .value-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .field-soft {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 9.5px;
    letter-spacing: 0.04em;
    color: var(--color-muted, #999);
    opacity: 0.8;
  }
</style>
