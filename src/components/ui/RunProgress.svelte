<script>
  /**
   * RunProgress.svelte - segmented progress of a search run (design-system §4.17), driven by data:
   * one segment per phase the caller supplies (screen, search, minimise, confirm, attribute), so a
   * run with fewer phases shows fewer segments.
   *
   * segments: [{id, label, state: 'done'|'active'|'queued'|'cancelled', done?, total?, text?}]
   * The caption under a segment is `text`, else "done/total", else the state word. The bar fills
   * to done/total when both are known, fully when done. Each segment is a role=progressbar.
   */
  import { fmtCount } from '../../lib/ui/statsFormat.js';

  let { segments = [] } = $props();

  const fraction = (s) => {
    if (s.state === 'done') return 1;
    if (s.total > 0 && s.done != null) return Math.min(1, s.done / s.total);
    return 0;
  };
  const caption = (s) => {
    if (s.text) return s.text;
    if (s.total > 0 && s.done != null) return `${fmtCount(s.done)}/${fmtCount(s.total)}`;
    return { done: 'done', active: 'running', queued: 'queued', cancelled: 'cancelled' }[s.state] ?? '';
  };
</script>

<div class="runprog" style="--n: {Math.max(1, segments.length)}">
  {#each segments as s (s.id)}
    {@const f = fraction(s)}
    <div class="seg-step is-{s.state}">
      <div class="lbl"><b>{s.label}</b><span class="num">{caption(s)}</span></div>
      <div
        class="bar"
        role="progressbar"
        aria-label={s.label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(f * 100)}
        aria-valuetext="{s.label}, {s.total > 0 && s.done != null ? `${s.done} of ${s.total}` : s.state}"
      >
        <i style="width: {f * 100}%"></i>
      </div>
    </div>
  {/each}
</div>

<style>
  .runprog {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: var(--sp-4);
  }
  .seg-step { display: grid; gap: 5px; min-width: 0; }
  .lbl {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    font-size: var(--fs-12);
    color: var(--text-soft);
    white-space: nowrap;
  }
  .lbl b { color: var(--text-ink); font-weight: var(--fw-bold); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .bar { height: 5px; background: var(--surface-4); border-radius: 1px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--brass-500); }
  .is-active .bar i { background: var(--ember-500); box-shadow: var(--glow-ember); }
  .is-active .lbl b { color: var(--ember-300); }
  .is-queued .bar, .is-cancelled .bar { background: transparent; border: 1px dashed var(--line-control); }
  .is-queued .lbl, .is-queued .lbl b, .is-cancelled .lbl, .is-cancelled .lbl b { color: var(--text-muted); font-weight: var(--fw-medium); }
  @media (max-width: 700px) {
    .runprog { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar i { transition: none; }
  }
</style>
