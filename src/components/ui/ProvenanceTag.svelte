<script>
  /**
   * ProvenanceTag.svelte - where a number came from (design-system §4.12). Never a verdict colour.
   * SHEET = entered from the in-game sheet, MODEL = engine computed, ESTIMATE = instant, no
   * interval, STALE = a sheet the build has moved on from.
   */
  import Tooltip from './Tooltip.svelte';

  let { kind = 'model' } = $props();
  const INFO = {
    sheet: ['In-game', 'Entered from your in-game stats.'],
    model: ['App', 'Worked out by the app from your build.'],
    estimate: ['Estimate', 'A quick estimate with no likely range. It never ranks anything.'],
    stale: ['Out of date', 'These in-game stats were entered for an older build and may no longer match.'],
  };
  const info = $derived(INFO[kind] ?? INFO.model);
</script>

<Tooltip text={info[1]}>
  <span class="prov {kind}">{info[0]}</span>
</Tooltip>

<style>
  .prov {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--r-1);
    font-size: var(--fs-11);
    font-weight: var(--fw-heavy);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--text-soft);
  }
  .sheet { color: var(--brass-200); border: 1px solid var(--brass-500); }
  .model { border: 1px dashed var(--line-control); }
  .estimate { color: var(--status-estimate); border: 1px dotted var(--line-control); }
  .stale { color: var(--status-warn); border: 1px solid var(--status-warn); }
</style>
