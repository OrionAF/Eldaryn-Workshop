<script>
  /**
   * RunProgress.svelte - segmented progress of a search run (design-system §4.17), driven by data:
   * one segment per phase the caller supplies (screen, search, minimise, confirm, attribute), so a
   * run with fewer phases shows fewer segments.
   *
   * segments: [{id, label, state: 'done'|'active'|'queued'|'cancelled', done?, total?, text?}]
   * The caption under a segment is `text`, else "done/total", else the state word. The bar fills
   * to done/total when both are known, fully when done. Each segment is a role=progressbar.
   *
   * In a narrow container (the Jobs tray, a phone) the per-segment labels cannot fit, so a container
   * query hides them and shows one line for the current step instead ("Step 2 of 5 · Search · 4/6").
   */
  import { fmtCount } from '../../lib/ui/statsFormat.js';

  let { segments = [] } = $props();

  // A.9 phases say 'current' for the one running; the segment draws it as 'active'.
  const stateOf = (s) => (s.state === 'current' ? 'active' : s.state);
  const fraction = (s) => {
    if (stateOf(s) === 'done') return 1;
    if (s.total > 0 && s.done != null) return Math.min(1, s.done / s.total);
    return 0;
  };
  const STATE_WORD = { done: 'done', active: 'running', queued: 'queued', cancelled: 'cancelled' };
  // {text, numeric}: counts render in the data face, state words in the UI face
  const caption = (s) => {
    if (s.text) return { text: s.text, numeric: false };
    if (s.total > 0 && s.done != null) return { text: `${fmtCount(s.done)}/${fmtCount(s.total)}`, numeric: true };
    return { text: STATE_WORD[stateOf(s)] ?? '', numeric: false };
  };

  // The one-line summary for narrow containers: the running step, else where it stopped, else done.
  const summary = $derived.by(() => {
    const n = segments.length;
    if (n === 0) return null;
    const at = segments.findIndex((s) => stateOf(s) === 'active');
    if (at >= 0) return { lead: `Step ${at + 1} of ${n}`, label: segments[at].label, cap: caption(segments[at]) };
    const stop = segments.findIndex((s) => stateOf(s) === 'cancelled');
    if (stop >= 0) return { lead: `Cancelled at step ${stop + 1} of ${n}`, label: segments[stop].label, cap: null };
    if (segments.every((s) => stateOf(s) === 'done')) return { lead: `All ${n} steps done`, label: '', cap: null };
    const next = segments.findIndex((s) => stateOf(s) === 'queued');
    return { lead: `Step ${next + 1} of ${n}`, label: segments[next]?.label ?? '', cap: { text: 'queued', numeric: false } };
  });
</script>

<div class="rp">
  <div class="runprog" style="--n: {Math.max(1, segments.length)}">
    {#each segments as s (s.id)}
      {@const f = fraction(s)}
      {@const cap = caption(s)}
      <div class="seg-step is-{stateOf(s)}" title="{s.label}: {cap.text}">
        <div class="lbl"><b>{s.label}</b><span class:num={cap.numeric}>{cap.text}</span></div>
        <div
          class="bar"
          role="progressbar"
          aria-label={s.label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(f * 100)}
          aria-valuetext="{s.label}, {s.total > 0 && s.done != null ? `${s.done} of ${s.total}` : stateOf(s)}"
        >
          <i style="width: {f * 100}%"></i>
        </div>
      </div>
    {/each}
  </div>
  {#if summary}
    <p class="rp-now" aria-hidden="true">
      <span>{summary.lead}</span>
      {#if summary.label}<b>{summary.label}</b>{/if}
      {#if summary.cap}<span class:num={summary.cap.numeric}>{summary.cap.text}</span>{/if}
    </p>
  {/if}
</div>

<style>
  .rp { container-type: inline-size; min-width: 0; }
  .runprog {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: var(--sp-4);
  }
  .seg-step { display: grid; gap: calc(var(--sp-1) * 1.25); min-width: 0; }
  .lbl {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    font-size: var(--fs-12);
    color: var(--text-soft);
    white-space: nowrap;
    min-width: 0;
  }
  .lbl b { color: var(--text-ink); font-weight: var(--fw-bold); overflow: hidden; text-overflow: ellipsis; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .bar { height: calc(var(--sp-1) * 1.25); background: var(--surface-4); border-radius: 1px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--brass-500); }
  .is-active .bar i { background: var(--ember-500); box-shadow: var(--glow-ember); }
  .is-active .lbl b { color: var(--ember-300); }
  .is-queued .bar, .is-cancelled .bar { background: transparent; border: 1px dashed var(--line-control); }
  .is-queued .lbl, .is-queued .lbl b, .is-cancelled .lbl, .is-cancelled .lbl b { color: var(--text-muted); font-weight: var(--fw-medium); }

  .rp-now {
    display: none;
    margin: var(--sp-2) 0 0;
    gap: var(--sp-2);
    align-items: baseline;
    font-size: var(--fs-12);
    color: var(--text-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rp-now b { color: var(--ember-300); font-weight: var(--fw-bold); }
  .rp-now span + b::before, .rp-now b + span::before { content: '·'; margin-right: var(--sp-2); color: var(--text-muted); font-weight: var(--fw-medium); }

  /* Too narrow for a label per segment: thin bars only, one summary line under them. */
  @container (max-width: 560px) {
    .runprog { gap: var(--sp-1); }
    .seg-step { gap: 0; }
    .lbl { display: none; }
    .rp-now { display: flex; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar i { transition: none; }
  }
</style>
