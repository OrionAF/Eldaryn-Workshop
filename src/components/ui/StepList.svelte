<script>
  /**
   * StepList.svelte - the expandable step list under a RunProgress (design-system §4.17): one row
   * per step, in order, each with a glyph and a state word (never colour alone) and a plain-text detail.
   *
   * steps: [{id, label, state: 'done'|'active'|'queued'|'skipped', detail?}]
   * The disclosure button names how far along the run is ("Search steps, 3 of 4 done") and is a real
   * <button> with aria-expanded / aria-controls, so keyboard and screen-reader users reach the list.
   * The list is not a live region (progress ticks would be noisy); the Jobs tray announces status.
   */
  let { steps = [], title = 'Steps', open = $bindable(false), id = `steplist-${Math.random().toString(36).slice(2, 8)}` } = $props();

  const GLYPH = { done: '✓', active: '●', queued: '◌', skipped: '–' };
  const WORD = { done: 'done', active: 'in progress', queued: 'queued', skipped: 'skipped' };
  const worked = $derived(steps.filter((s) => s.state !== 'skipped'));
  const doneCount = $derived(worked.filter((s) => s.state === 'done').length);
</script>

{#if steps.length}
  <div class="steplist">
    <button type="button" class="toggle" aria-expanded={open} aria-controls="{id}-list" onclick={() => (open = !open)}>
      <span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      {title}
      <span class="num count">{doneCount} of {worked.length} done</span>
    </button>
    {#if open}
      <ol id="{id}-list" class="steps" aria-label={title}>
        {#each steps as s, i (s.id)}
          <li class="is-{s.state}" aria-current={s.state === 'active' ? 'step' : undefined}>
            <span class="glyph" aria-hidden="true">{GLYPH[s.state]}</span>
            <span class="what"><span class="n num">{i + 1}.</span> <b>{s.label}</b>: {WORD[s.state]}</span>
            {#if s.detail}<span class="detail num">{s.detail}</span>{/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .steplist { margin-top: var(--sp-2); min-width: 0; }
  .toggle {
    display: inline-flex;
    align-items: baseline;
    gap: var(--sp-2);
    background: none;
    border: 0;
    padding: var(--sp-1) 0;
    color: var(--text-soft);
    font: inherit;
    font-size: var(--fs-12);
    cursor: pointer;
  }
  .toggle:hover { color: var(--text-ink); }
  .chev { width: 1ch; color: var(--text-muted); }
  .count { color: var(--text-muted); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .steps { list-style: none; margin: var(--sp-1) 0 0; padding: 0; display: grid; gap: var(--sp-1); }
  li {
    display: grid;
    grid-template-columns: 1.5ch minmax(0, 1fr);
    column-gap: var(--sp-2);
    font-size: var(--fs-12);
    color: var(--text-soft);
  }
  .detail { grid-column: 2; color: var(--text-muted); overflow-wrap: anywhere; }
  .what b { color: var(--text-ink); font-weight: var(--fw-bold); }
  .glyph { color: var(--brass-500); text-align: center; }
  .is-active .glyph, .is-active .what b { color: var(--ember-300); }
  .is-queued .glyph, .is-queued .what, .is-queued .what b, .is-skipped .glyph, .is-skipped .what, .is-skipped .what b { color: var(--text-muted); font-weight: var(--fw-medium); }
</style>
