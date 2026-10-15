<script>
  /**
   * PushLadder.svelte - the Push result (backlog §10 item 1, simulation.md §Push): a ladder strip from the
   * start rung (rungs the current build clears, rungs only the suggested build clears, the first rung not
   * reached, rungs climbed past without a confirmed claim), how far each build goes, where the suggested
   * build was measured and why the climb stopped. `push` is a result's `push` block or a saved run's
   * (optimiserView.js viewResult / viewRun).
   */
  import { ladderStrip, pushStopText } from '../../lib/ui/optimiserView.js';

  let { push } = $props();

  const cells = $derived(ladderStrip(push));
  const unit = $derived(push.ladder?.unit ?? 'step');
  const STATE = {
    now: { glyph: '●', word: 'current build clears' },
    new: { glyph: '▲', word: 'suggested build clears' },
    stop: { glyph: '✕', word: 'not reached' },
    open: { glyph: '?', word: 'not confirmed' },
  };
  const pct = (p) => `${Math.round((p ?? 0) * 1000) / 10}%`;
  const present = $derived(new Set(cells.map((c) => c.state)));
</script>

<section class="push" data-testid="push-ladder" aria-label="Push ladder">
  <p class="lead">
    <span class="micro">{push.ladder?.label}</span>
    <span class="hint">Target {pct(push.target)}, from {push.start?.label}</span>
  </p>
  <ol class="strip" data-testid="push-strip">
    {#each cells as c (c.index)}
      <li class="cell {c.state}" data-state={c.state} aria-label="{c.label}: {STATE[c.state].word}" title="{c.label}: {STATE[c.state].word}">
        <span class="g" aria-hidden="true">{STATE[c.state].glyph}</span>
        <span class="num">{c.label.replace(/^[a-z ]+/i, '')}</span>
      </li>
    {/each}
  </ol>
  <ul class="legend" aria-label="Legend">
    {#each ['now', 'new', 'stop', 'open'] as s (s)}
      {#if present.has(s)}<li class={s}><span class="g" aria-hidden="true">{STATE[s].glyph}</span> {STATE[s].word}</li>{/if}
    {/each}
  </ul>
  <dl class="facts">
    <div><dt>Now</dt><dd data-testid="push-now">{push.baseline?.label ?? `below ${push.start?.label}`}</dd></div>
    <div><dt>With changes</dt><dd data-testid="push-reached">{push.status === 'pushed' ? push.reached.label : `no deeper ${unit} found`}</dd></div>
  </dl>
  {#if push.status === 'pushed' && push.reached?.foundLabel}
    <p class="hint" data-testid="push-found">The changes below were found and measured on {push.reached.foundLabel}, the first {unit} that build was searched for.</p>
  {/if}
  <p class="hint" data-testid="push-stop">{pushStopText(push)}</p>
</section>

<style>
  .push { display: grid; gap: var(--sp-2); }
  .lead { margin: 0; display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; }
  .micro { font-size: var(--fs-11); font-weight: var(--fw-bold); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .hint { margin: 0; color: var(--text-muted); font-size: var(--fs-12); overflow-wrap: anywhere; }
  .strip { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .cell {
    --c: var(--line-control);
    display: inline-flex; align-items: center; gap: var(--sp-1);
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--c); border-radius: var(--r-1);
    background: var(--surface-2); color: var(--text-soft); font-size: var(--fs-12);
  }
  .cell.now { --c: var(--brass-500); }
  .cell.new { --c: var(--verdict-up); background: var(--verdict-up-tint); color: var(--text-ink); }
  .cell.stop { --c: var(--verdict-down); background: var(--verdict-down-tint); }
  .cell.open { border-style: dashed; color: var(--text-muted); }
  .g { color: var(--c); }
  .cell.open .g { color: var(--text-muted); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-3); font-size: var(--fs-12); color: var(--text-muted); }
  .legend .now .g { color: var(--brass-500); }
  .legend .new .g { color: var(--verdict-up); }
  .legend .stop .g { color: var(--verdict-down); }
  .facts { margin: 0; display: flex; flex-wrap: wrap; gap: var(--sp-4); }
  .facts div { display: grid; gap: 2px; }
  .facts dt { font-size: var(--fs-11); font-weight: var(--fw-bold); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .facts dd { margin: 0; font-size: var(--fs-14); color: var(--text-ink); }
</style>
