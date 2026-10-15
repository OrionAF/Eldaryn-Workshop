<script>
  /**
   * DropSetCard.svelte - the verdict of one drop in one equipment set (design-system §4.28).
   *
   * The set verdict (VerdictChip in the header) is the Holm-judged verdict of every preset wearing the
   * set. Under it the coverage line says what was measured ("DPS only: defence not measured") and which
   * changed stats nothing judged. Per-preset metric rows show value, delta, 95% interval and N. The
   * closed-form figure sits last, labelled ESTIMATE, in muted text: never a verdict, never coloured.
   * Apply is scoped: the first press names the scope and the presets it changes, the second writes.
   *
   * Props: card (features/dropView.js setCards entry), phase ('idle'|'queued'|'running'),
   * onapply(setKey), onrunmore() (null hides Run more).
   */
  import VerdictChip from '../ui/VerdictChip.svelte';
  import ScopeChip from '../ui/ScopeChip.svelte';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';
  import Button from '../ui/Button.svelte';
  import { chipFor, pctInterval } from '../../lib/features/dropView.js';
  import { fmtContrast, fmtContrastCi, fmtCount, fmtScalar, nNeededText, verdictText } from '../../lib/ui/statsFormat.js';
  import { signedPct } from './dropFormat.js';

  let { card, phase = 'idle', onapply, onrunmore = null } = $props();
  const id = $props.id();

  let confirming = $state(false);
  const chip = $derived(chipFor(card.verdict, card.basis, phase));
  const pending = $derived(card.basis !== 'sim' && phase !== 'idle');
  const names = $derived(card.presetNames);

  /** Delta figure of one metric: DPS as percent of the starting DPS, win rate and survival in points. */
  function figure(m) {
    if (m.unit === 'dps') {
      const p = pctInterval(m.m);
      return p ? { text: signedPct(p.est, 2), ci: `95% CI ${signedPct(p.lo, 2)} to ${signedPct(p.hi, 2)}` } : { text: 'n/a', ci: '' };
    }
    return { text: fmtContrast('p', m.m.delta), ci: fmtContrastCi('p', m.m.delta) };
  }
  const tone = (m) => (m.m.delta.verdict === 'better' ? 'up' : m.m.delta.verdict === 'worse' ? 'down' : 'side');

  function apply() {
    confirming = false;
    onapply(card.setKey);
  }
</script>

<article class="card" class:inconclusive={card.basis === 'sim' && card.verdict === 'inconclusive'} aria-labelledby="{id}-t" data-set={card.setKey} data-verdict={chip.verdict}>
  <header class="head">
    <h3 id="{id}-t">{card.setLabel}</h3>
    <span class="used">worn by {#each names as n (n)}<span class="pchip">{n}</span>{/each}</span>
    <span class="spacer"></span>
    <VerdictChip verdict={chip.verdict} label={chip.label} />
  </header>

  <p class="coverage" data-coverage={card.basis}>
    {card.basis === 'sim' ? card.coverageLabel : pending ? 'Simulation not finished' : 'Not simulated yet'}
    {#if card.notJudged.length}. Not judged: {card.notJudged.join(', ')}{/if}
    {#if card.unresolved}. Too close to call at the largest run size.{/if}
  </p>

  {#if card.basis === 'sim'}
    <div class="body">
      {#each card.presets as p (p.presetId)}
        <div class="preset">
          <span class="pname">{p.name}</span>
          <span class="basis">{p.method === 'anchored' ? (p.approx ? 'anchored on your sheet, approximate' : 'anchored on your sheet') : 'recomputed from gear'}</span>
        </div>
        {#each p.metrics as m (m.id)}
          {@const f = figure(m)}
          <div class="met" data-metric={m.id}>
            <span class="lbl">{m.label}</span>
            <span class="val num">{fmtScalar(m.unit === 'dps' ? 'dps' : 'p', m.m.before.mean)} → {fmtScalar(m.unit === 'dps' ? 'dps' : 'p', m.m.after.mean)}</span>
            <span class="d num {tone(m)}">{f.text}</span>
            <span class="ci num">{f.ci} · N {fmtCount(m.m.delta.n)} · {verdictText(m.m.delta)}</span>
          </div>
        {/each}
      {/each}
    </div>
  {/if}

  <p class="estimate">
    <ProvenanceTag kind="estimate" />
    {#if card.estimatePct != null}
      Instant estimate (auto-attacks only, no interval): <span class="num est">{signedPct(card.estimatePct, 1)}</span> on {card.setLabel}. Shown for reference; the verdict uses the simulation.
    {:else}
      No instant estimate for this item.
    {/if}
  </p>

  <footer class="foot">
    <ScopeChip scope="character" target={`Gear ${card.setLabel}`} sideEffects={names} />
    <span class="spacer"></span>
    {#if card.unresolved && card.nNeeded}<span class="hint">{nNeededText({ nNeeded: card.nNeeded })}</span>{/if}
    {#if onrunmore && card.unresolved}
      <Button variant="secondary" size="small" onclick={onrunmore}>Run more</Button>
    {/if}
    {#if !confirming}
      <Button variant={card.verdict === 'upgrade' && card.basis === 'sim' ? 'primary' : 'secondary'} size="small" onclick={() => (confirming = true)}>
        Apply to {card.setLabel}…
      </Button>
    {:else}
      <span class="confirm" role="group" aria-label="Confirm apply to {card.setLabel}">
        <span class="hint">Writes {card.setLabel}; changes {names.join(', ')}.{card.verdict === 'mixed' ? ' This helps some presets and hurts others.' : ''}</span>
        <Button variant="primary" size="small" confirming onclick={apply}>Confirm apply</Button>
        <Button variant="ghost" size="small" onclick={() => (confirming = false)}>Cancel</Button>
      </span>
    {/if}
  </footer>
</article>

<style>
  .card {
    background: var(--surface-1);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    padding: var(--sp-3) var(--sp-4);
    display: grid;
    gap: var(--sp-2);
    min-width: 0;
  }
  /* Too close to call: the neutral verdict colour on the card's edge, never up or down. */
  .card.inconclusive { border-left: var(--sp-1) solid var(--verdict-side); }
  .head,
  .foot,
  .preset {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  .foot { align-items: center; padding-top: var(--sp-2); border-top: 1px solid var(--line-hairline); }
  .spacer { flex: 1; }
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-14);
    color: var(--text-ink);
  }
  .used,
  .coverage,
  .hint,
  .basis,
  .estimate {
    font-size: var(--fs-12);
    color: var(--text-soft);
  }
  .coverage,
  .estimate { margin: 0; }
  .pchip {
    margin-left: var(--sp-1);
    padding: 0 var(--sp-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-ink);
  }
  .body { display: grid; gap: var(--sp-1); }
  .pname { font-weight: var(--fw-bold); font-size: var(--fs-13); color: var(--text-ink); }
  .met {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) auto auto minmax(0, 1.6fr);
    gap: var(--sp-3);
    align-items: baseline;
    font-size: var(--fs-12);
    color: var(--text-soft);
  }
  .d { font-weight: var(--fw-bold); text-align: right; color: var(--text-ink); }
  .d.up { color: var(--verdict-up); }
  .d.down { color: var(--verdict-down); }
  .ci { text-align: right; }
  .est { color: var(--text-soft); }
  .confirm { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
  @media (max-width: 700px) {
    .met { grid-template-columns: 1fr auto; }
    .val,
    .ci { grid-column: 1 / -1; text-align: left; }
  }
</style>
