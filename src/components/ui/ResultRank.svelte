<script>
  /**
   * ResultRank.svelte - one expandable optimiser result row (design-system §4.16) over an A.9 Row.
   *
   * The toggle is a button[aria-expanded] controlling the body region. Collapsed it shows the
   * rank mark, the ranked value with its CI, a change summary, the forest mark, the paired delta
   * and a VerdictChip. Expanded it lists one ablation row per change (own effect on the table's
   * shared axis, what dropping it costs, ScopeChip with side effects) and the interaction
   * remainder, which is never coloured and never a verdict. A provisional row (confirm not yet
   * finished) is neutral, never up/down. `footer` carries Apply and friends.
   *
   * Props: row, unit, domain (the table's forestDomain), presetName, expanded ($bindable),
   * onrunmore(row), footer snippet, unmeasured (per-change effects were never measured for this
   * row: a run saved before the attribution pass, or a row not yet confirmed; the cells say so).
   */
  import CIForest from './CIForest.svelte';
  import VerdictChip from './VerdictChip.svelte';
  import ScopeChip from './ScopeChip.svelte';
  import { changeSummary, bundleText, dimensionLabel } from '../../lib/ui/optimiserView.js';
  import {
    fmtEstimate, fmtContrast, fmtContrastCi, fmtSigned, verdictText, nNeededText, verdictTone, fmtCount,
  } from '../../lib/ui/statsFormat.js';

  let {
    row,
    unit = 'dps',
    domain,
    presetName = 'this build',
    expanded = $bindable(false),
    onrunmore = null,
    unmeasured = false,
    footer,
  } = $props();
  const id = $props.id();

  const vs = $derived(row.vsBaseline);
  const pending = $derived(row.provisional && !row.isBaseline);
  const tone = $derived(row.isBaseline ? 'base' : pending ? 'side' : verdictTone(vs));
  const chipVerdict = $derived(pending ? 'pending' : (vs?.verdict ?? 'unresolved'));
  const rankText = $derived(row.isBaseline ? 'NOW' : row.tieGroup != null ? `${row.rank}=` : String(row.rank));
  const summary = $derived(
    row.isBaseline
      ? 'Current build'
      : changeSummary(row.changes),
  );

  function sentence(c, name) {
    if (!c) return name;
    const bits = [fmtContrast(unit, c), fmtContrastCi(unit, c), verdictText(c)].filter(Boolean);
    return `${name}: ${bits.join(', ')}`;
  }
  const targetOf = (c) => (c.scope === 'preset' ? `${presetName} only` : dimensionLabel(c.dimension));
</script>

<div class="rank" class:expanded>
  <div class="line">
    <button
      type="button"
      class="toggle"
      aria-expanded={expanded}
      aria-controls="{id}-body"
      onclick={() => (expanded = !expanded)}
    >
      <span class="mark" class:base={row.isBaseline}><span>{rankText}</span></span>
      <span class="value">
        <span class="v">{fmtEstimate(unit, row.value)}</span>
        <span class="meta">{summary}</span>
      </span>
    </button>
    <CIForest
      {domain}
      est={row.isBaseline ? 0 : (vs?.delta ?? null)}
      lo={row.isBaseline ? null : (vs?.lo ?? null)}
      hi={row.isBaseline ? null : (vs?.hi ?? null)}
      {tone}
      label={row.isBaseline ? 'Current build, reference' : sentence(vs, `Rank ${rankText}`)}
    />
    <span class="delta">
      {#if !row.isBaseline && vs}
        <span class="v {tone}">{fmtContrast(unit, vs)}</span>
        <span class="ci">{fmtContrastCi(unit, vs)}</span>
      {/if}
    </span>
    <span class="verdict">
      {#if !row.isBaseline}
        <VerdictChip verdict={chipVerdict} />
        {#if vs?.verdict === 'unresolved' && !pending}
          <span class="n">{verdictText(vs)}</span>
        {/if}
        {#if row.runMore && onrunmore}
          <button type="button" class="link-btn" onclick={() => onrunmore(row)}>Run more</button>
        {/if}
      {/if}
    </span>
  </div>

  {#if expanded}
    <div id="{id}-body" class="body" role="region" aria-label="Changes in rank {rankText}">
      {#if row.changes.length}
        <p class="cap">Change · own effect (added alone to the current build, paired seeds) · same axis as above</p>
        {#each row.changes as c (c.id)}
          <div class="abl">
            <span class="chg">{c.label}: {c.from} <span class="arrow">→</span> <b>{c.to}</b></span>
            <CIForest
              {domain}
              est={c.own?.delta ?? null}
              lo={c.own?.lo ?? null}
              hi={c.own?.hi ?? null}
              tone={c.own ? verdictTone(c.own) : 'est'}
              label={sentence(c.own, c.label)}
            />
            <span class="delta">
              {#if c.own}
                <span class="v {verdictTone(c.own)}">{fmtContrast(unit, c.own)}</span>
                <span class="ci">{fmtContrastCi(unit, c.own)}</span>
              {:else}
                <span class="ci">{unmeasured ? 'not measured' : 'no solo effect'}</span>
              {/if}
            </span>
            <span class="verdict">{#if c.own}<VerdictChip verdict={c.own.verdict} />{/if}</span>
            <span class="why">
              <ScopeChip scope={c.scope} target={targetOf(c)} sideEffects={c.sideEffects ?? []} />
              {#if c.needed}
                <span>Without it: {fmtContrast(unit, c.needed)} {fmtContrastCi(unit, c.needed)}</span>
              {/if}
              {#if c.keptBecause}<span>{c.keptBecause === 'interaction' ? 'Kept for its interaction with other changes' : 'Kept for its own effect'}</span>{/if}
              {#if c.bundle?.length}<span>Comes with: {bundleText(c.bundle, row.changes)}</span>{/if}
            </span>
          </div>
        {/each}
        {#if row.remainder}
          {@const r = row.remainder}
          <div class="abl remainder">
            <span class="chg"><i>Interaction remainder</i></span>
            <CIForest {domain} est={r.delta} tone="est" label="Interaction remainder {fmtSigned(unit, r.delta)}, no interval" />
            <span class="delta">
              <span class="v side">{fmtSigned(unit, r.delta)}</span>
              <span class="ci">no interval</span>
            </span>
            <span class="verdict"><VerdictChip verdict="remainder" /></span>
          </div>
        {/if}
      {/if}
      {#if vs?.verdict === 'unresolved' && nNeededText(vs)}
        <p class="cap">{nNeededText(vs)}{row.runMore ? ` · target N ${fmtCount(row.runMore.targetN)}` : ''}</p>
      {/if}
      {@render footer?.(row)}
    </div>
  {/if}
</div>

<style>
  .rank { border-bottom: 1px solid var(--line-hairline); }
  .line, .abl {
    display: grid;
    grid-template-columns: minmax(calc(var(--sp-10) * 3.25), 1.9fr) minmax(calc(var(--sp-10) * 3.75), 1.3fr) calc(var(--sp-10) * 2.4) calc(var(--sp-10) * 3.75);
    column-gap: calc(var(--sp-1) * 2.5);
    align-items: center;
    padding: 0 var(--sp-4);
    min-height: calc(var(--sp-1) * 13);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    background: none;
    border: 0;
    padding: 0;
    min-height: calc(var(--sp-1) * 13);
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .line:hover { background: var(--surface-3); }
  .expanded .line { background: var(--surface-4); box-shadow: inset var(--sp-1) 0 0 var(--ember-500); }
  .mark {
    flex: none;
    width: var(--sp-6);
    height: var(--sp-6);
    display: grid;
    place-items: center;
    transform: rotate(45deg);
    border: 1px solid var(--line-control);
    border-radius: 2px;
    margin-left: var(--sp-1);
    font-family: var(--font-data);
    font-size: var(--fs-12);
    color: var(--text-ink);
  }
  .mark > span { transform: rotate(-45deg); }
  .mark.base {
    transform: none;
    width: auto;
    height: var(--sp-5);
    padding: 0 calc(var(--sp-1) * 0.75);
    margin-left: -2px;
    border-color: var(--brass-500);
    color: var(--brass-200);
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-heavy);
  }
  .mark.base > span { transform: none; }
  .value { display: grid; min-width: 0; line-height: 1.2; }
  .v { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .value .v { font-size: var(--fs-16); font-weight: var(--fw-medium); color: var(--text-ink); }
  .meta { font-size: var(--fs-12); color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .delta { display: grid; justify-items: end; line-height: 1.2; }
  .delta .v { font-size: var(--fs-14); font-weight: var(--fw-medium); color: var(--text-ink); }
  .delta .v.up { color: var(--verdict-up); }
  .delta .v.down { color: var(--verdict-down); }
  .ci { font-size: var(--fs-12); color: var(--text-soft); font-family: var(--font-data); font-variant-numeric: tabular-nums; text-align: right; }
  .verdict { display: grid; justify-items: start; gap: calc(var(--sp-1) * 0.75); }
  .n { font-size: var(--fs-12); color: var(--text-soft); }
  .link-btn {
    background: none; border: 0; padding: 0 calc(var(--sp-1) * 0.5); min-height: var(--sp-6); cursor: pointer;
    color: var(--brass-400); font-size: var(--fs-12); font-weight: var(--fw-bold);
    text-decoration: underline; text-underline-offset: calc(var(--sp-1) * 0.75);
  }
  .link-btn:hover { color: var(--brass-200); }
  .body { background: var(--surface-1); box-shadow: inset var(--sp-1) 0 0 var(--ember-700); border-top: 1px solid var(--line-rule); }
  .cap { margin: 0; padding: var(--sp-2) var(--sp-4) calc(var(--sp-1) * 1.5) var(--sp-8); font-size: var(--fs-11); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  .abl { min-height: 0; padding-block: var(--sp-2); row-gap: var(--sp-1); border-bottom: 1px solid var(--line-hairline); }
  .abl .chg { padding-left: var(--sp-8); font-size: var(--fs-14); color: var(--text-soft); min-width: 0; }
  .abl .chg b { color: var(--text-ink); }
  .arrow { color: var(--text-muted); }
  .why {
    grid-column: 1 / -1;
    padding-left: var(--sp-8);
    font-size: var(--fs-12);
    color: var(--text-soft);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
  }
  .remainder .chg { font-style: italic; }
  @media (max-width: 700px) {
    .line, .abl { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'main delta' 'forest forest' 'vd vd'; padding: var(--sp-3); row-gap: calc(var(--sp-1) * 1.5); }
    .line > .toggle, .abl > .chg { grid-area: main; padding-left: 0; }
    .line > :nth-child(2), .abl > :nth-child(2) { grid-area: forest; }
    .line > .delta, .abl > .delta { grid-area: delta; }
    .line > .verdict, .abl > .verdict { grid-area: vd; }
    .why, .cap { padding-left: var(--sp-3); }
  }
</style>
