<script>
  /**
   * PriorityCard.svelte - one spec at one level range in the build-guide format: Priority (every
   * stat kept above drop odds, ≈ within 10% of its group's first), Avoid (the Attunement block
   * list), Below drop odds, Awakening, typical sheet totals and the same card as text.
   * `b` is a scored range (statPriority.js scoreSpecRange); `near` the preset bracket around it.
   */
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';
  import { blockText, keepStep } from '../../lib/features/statPriority.js';

  let { data, spec, b, custom = false, near = null, oncopy } = $props();

  const WEAK_SIGNAL = 0.15;
  const SMALL_SAMPLE = 40;
  const m = $derived(data.method);
  const L = (t) => data.labels[t];
  const byType = $derived(Object.fromEntries(b.stats.map((s) => [s.type, s])));
  const tiny = $derived(b.players < m.MIN_PLAYERS);
  const variants = $derived(data.specs.filter((s) => s.variantOf === spec.spec));
  const typical = $derived(b.typical.map((t) => byType[t]).filter((s) => s.median != null));
  const text = $derived(blockText(data.labels, b));
  const fmt = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
</script>

<Panel title="{spec.specName} · Level {b.key}" level="primary">
  {#snippet meta()}
    <Button variant="secondary" size="small" onclick={() => oncopy(text)}>Copy as text</Button>
  {/snippet}
  <div class="card" data-testid="priority-card">
    <p class="sub">
      {spec.className} · <span class="num">{b.players.toLocaleString('en-US')}</span> players ·
      <span class="num">{b.items.toLocaleString('en-US')}</span> gear pieces with stats
    </p>
    {#if custom || b.signal < WEAK_SIGNAL || b.players < SMALL_SAMPLE}
      <div class="flags">
        {#if custom}<span class="flag">Custom range</span>{/if}
        {#if b.signal < WEAK_SIGNAL}<span class="flag">Weak signal</span>{/if}
        {#if b.players < SMALL_SAMPLE}<span class="flag">{tiny ? 'Very small sample' : 'Small sample'}</span>{/if}
      </div>
    {/if}
    {#if variants.length}
      <p class="note">
        Mixes {variants.map((v) => v.specName.split(' · ').pop()).join(' and ')} builds, which want different stats. Pick a form above
        where it has enough players.
      </p>
    {/if}
    {#if b.signal < WEAK_SIGNAL}
      <p class="note">
        Gear at this level sits close to plain drop odds: most players wear whatever their newest rarity drops, so the order below is a
        light lean, not a rule.
      </p>
    {/if}
    {#if custom && tiny}
      <p class="note">
        Only <span class="num">{b.players}</span> player{b.players === 1 ? '' : 's'} in this range, so one or two builds can reorder
        the lists. Widen the range{near ? ` or compare with level ${near.key}` : ''}.
      </p>
    {:else if b.players < SMALL_SAMPLE}
      <p class="note">
        Only <span class="num">{b.players}</span> players of this spec are in this {custom ? 'range; a wider range is' : 'bracket; neighbouring brackets are'} steadier.
      </p>
    {/if}

    <div class="row">
      <div class="row-label micro-label">Priority</div>
      <div>
        {#if b.priority.length}
          <div class="chain" data-testid="priority">
            {#each b.priority as t, i (t)}
              {#if i > 0}
                {#if b.priorityTies[i]}<span class="sep tie" title="Within 10% of the first stat in its group">≈</span>
                {:else}<span class="sep" aria-label="then">›</span>{/if}
              {/if}
              <span class="chip k{keepStep(byType[t].keepRate, m)}">{L(t)}<span class="kr num">×{byType[t].keepRate.toFixed(2)}</span></span>
            {/each}
          </div>
          <p class="hint">Every stat kept more often than it drops, best first. Pale chips (under ×{m.STRONG_MIN}) are light leans.</p>
        {:else}
          <span class="none">No stat is kept above drop odds yet.</span>
        {/if}
      </div>
    </div>

    <div class="row">
      <div class="row-label micro-label">Avoid<span class="row-hint">Block list</span></div>
      <div>
        {#if b.ban.length}
          <div class="chain" data-testid="ban">
            {#each b.ban as t, i (t)}
              <span class="chip ban"><span class="slot num">{i + 1}</span>{L(t)}<span class="kr num">×{byType[t].keepRate.toFixed(2)}</span></span>
            {/each}
          </div>
        {:else}
          <span class="none">Every stat is kept at least as often as it drops.</span>
        {/if}
        <p class="hint">
          Attunement bans, in this order: {spec.className} has {m.BAN_SLOTS[spec.class]} slots at max level. Fill yours from the top;
          changing bans is free.
        </p>
      </div>
    </div>

    {#if b.belowOdds.length}
      <div class="row">
        <div class="row-label micro-label">Below drop odds</div>
        <div>
          <div class="chain">
            {#each b.belowOdds as t (t)}
              <span class="chip" class:avoid={byType[t].keepRate <= m.AVOID_MAX} class:below={byType[t].keepRate > m.AVOID_MAX}>
                {L(t)}<span class="kr num">×{byType[t].keepRate.toFixed(2)}</span>
              </span>
            {/each}
          </div>
          <p class="hint">
            The rest, kept less often than they drop, worst first. Marked ones (×{m.AVOID_MAX} or less) are clearly dropped: reroll or
            replace pieces that carry them.
          </p>
        </div>
      </div>
    {/if}

    <div class="row">
      <div class="row-label micro-label">Awakening</div>
      <div>
        {#if b.awakening}
          <div class="awk">
            <span class="awk-name">{b.awakening.path}</span>
            <span class="awk-bar" aria-hidden="true"><i style="width: {(b.awakening.count / b.awakening.of) * 100}%"></i></span>
            <span class="n">{b.awakening.count} of {b.awakening.of} who picked a path</span>
          </div>
        {:else}
          <span class="none">Awakening opens at level 40.</span>
        {/if}
      </div>
    </div>

    <div class="row">
      <div class="row-label micro-label">Typical</div>
      <div>
        {#if typical.length}
          <div class="tiles">
            {#each typical as s (s.type)}
              <div class="tile">
                <div class="t">{s.label.replace(/ %$/, '')}</div>
                <div class="v num">{fmt(s.median)}%</div>
                <div class="p">top 25%: <span class="num">{fmt(s.p75)}%</span></div>
                {#if s.softCap != null && s.median > s.softCap}<div class="cap">past soft cap {s.softCap}%</div>{/if}
              </div>
            {/each}
          </div>
          <p class="hint">Median sheet totals from every source, not targets.</p>
        {:else}
          <span class="none">–</span>
        {/if}
      </div>
    </div>

    <div class="row">
      <div class="row-label micro-label">As text</div>
      <pre class="block" data-testid="block-text">{text}</pre>
    </div>
  </div>
</Panel>

<style>
  .card { display: grid; }
  .sub { margin: 0; font-size: var(--fs-13); color: var(--text-muted); }
  .flags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
  .flag { font-size: var(--fs-12); color: var(--text-soft); border: 1px dashed var(--line-control); border-radius: var(--r-1); padding: 1px var(--sp-2); }
  .note {
    margin: var(--sp-3) 0 0;
    padding: var(--sp-2) var(--sp-3);
    font-size: var(--fs-13);
    color: var(--text-soft);
    background: var(--brass-tint);
    border-left: 3px solid var(--brass-500);
  }
  .row {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    gap: var(--sp-3);
    padding: var(--sp-3) 0;
    border-top: 1px solid var(--line-hairline);
    margin-top: var(--sp-3);
  }
  .row-label { padding-top: 6px; color: var(--brass-400); }
  .row-hint { display: block; margin-top: 2px; font-size: var(--fs-11); font-weight: normal; letter-spacing: 0; text-transform: none; color: var(--text-muted); }
  .chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 4px; }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px var(--sp-2);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    font-size: var(--fs-14);
    font-weight: var(--fw-bold);
    color: var(--text-ink);
    background: var(--surface-3);
  }
  .kr { font-size: var(--fs-12); font-weight: normal; color: var(--text-soft); }
  .k3 { background: color-mix(in oklab, var(--div-kept) 34%, var(--surface-2)); border-color: color-mix(in oklab, var(--div-kept) 70%, var(--surface-2)); }
  .k2 { background: color-mix(in oklab, var(--div-kept) 22%, var(--surface-2)); border-color: color-mix(in oklab, var(--div-kept) 50%, var(--surface-2)); }
  .k1 { background: color-mix(in oklab, var(--div-kept) 12%, var(--surface-2)); border-color: color-mix(in oklab, var(--div-kept) 34%, var(--surface-2)); }
  .k0 { font-weight: normal; color: var(--text-soft); background: color-mix(in oklab, var(--div-kept) 5%, var(--surface-2)); }
  .below, .avoid { font-weight: normal; color: var(--text-soft); }
  .below .kr, .avoid .kr, .k0 .kr { color: var(--text-muted); }
  .avoid { background: color-mix(in oklab, var(--div-dropped) 10%, var(--surface-2)); border-color: color-mix(in oklab, var(--div-dropped) 40%, var(--surface-2)); }
  .avoid::before { content: '✕'; font-size: var(--fs-11); color: var(--div-dropped); }
  .ban { background: color-mix(in oklab, var(--div-dropped) 18%, var(--surface-2)); border-color: color-mix(in oklab, var(--div-dropped) 60%, var(--surface-2)); }
  .slot {
    display: inline-grid;
    place-items: center;
    align-self: center;
    min-width: 18px;
    height: 18px;
    border-radius: var(--r-pill);
    background: var(--div-dropped);
    color: var(--surface-1);
    font-size: var(--fs-11);
  }
  .sep { padding: 0 2px; font-family: var(--font-data); font-size: var(--fs-16); color: var(--brass-400); }
  .sep.tie { color: var(--text-muted); }
  .hint { margin: var(--sp-2) 0 0; font-size: var(--fs-12); color: var(--text-muted); }
  .none { display: inline-block; padding-top: 5px; font-style: italic; color: var(--text-muted); }
  .awk { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); padding-top: 4px; }
  .awk-name { font-weight: var(--fw-bold); }
  .awk-bar { width: 160px; height: 8px; border-radius: var(--r-2); background: var(--surface-4); overflow: hidden; }
  .awk-bar i { display: block; height: 100%; background: var(--brass-400); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--sp-2); }
  .tile { padding: var(--sp-2) var(--sp-3); background: var(--surface-3); border: 1px solid var(--line-rule); border-radius: var(--r-2); }
  .tile .t, .tile .p { font-size: var(--fs-12); color: var(--text-muted); }
  .tile .v { font-size: var(--fs-20); color: var(--text-ink); }
  .tile .cap { font-size: var(--fs-12); color: var(--ember-300); }
  .block {
    margin: 0;
    padding: var(--sp-3);
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--surface-1);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    font-family: var(--font-data);
    font-size: var(--fs-13);
    line-height: 1.6;
    color: var(--text-soft);
  }
  @media (max-width: 700px) {
    .row { grid-template-columns: minmax(0, 1fr); gap: var(--sp-2); }
    .row-label { padding-top: 0; }
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
