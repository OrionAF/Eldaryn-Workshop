<script>
  /**
   * ApplyReview.svelte - the scoped review before an optimiser row is written (plan A.11, ia.md §5.17).
   * One checkbox per write group (`row.writes`): the preset's own choices, a talent set's allocation, the
   * sigil conditions, a mount's sockets. Each names the changes it holds and every other preset it also
   * changes, so a character-wide write is never silent. Excluded groups are left as they are.
   * `onconfirm({cand, include})` hands the plan to the caller (the store mutator); `error` shows what it refused.
   */
  import Modal from '../Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import ScopeChip from '../ui/ScopeChip.svelte';
  import Banner from '../ui/Banner.svelte';
  import { applyPlan, changesOfGroup, sideEffectsOf } from '../../lib/ui/optimiserView.js';
  import { medalCostText } from '../../lib/search/relicProgression.js';

  let { open = $bindable(false), row = null, presetName = '', error = '', onconfirm = () => {} } = $props();

  let off = $state([]); // indexes of switched-off groups
  $effect(() => {
    if (open) off = [];
  });

  const on = (i) => !off.includes(i);
  const flip = (i) => (off = on(i) ? [...off, i] : off.filter((x) => x !== i));
  const plan = $derived(row ? applyPlan(row, off) : null);
  const effects = $derived(row ? sideEffectsOf(row, off) : []);
  const title = $derived(row ? `Apply rank ${row.rank} to ${presetName}` : 'Apply');
</script>

<Modal bind:open {title}>
  {#snippet children()}
    {#if row}
      <div class="review" data-testid="apply-review">
        <p class="lead">Choose what to change. A group you switch off stays as it is.</p>
        {#each row.writes as g, i (g.title + i)}
          <div class="group" class:off={!on(i)} data-testid="write-group">
            <Checkbox checked={on(i)} label={g.title} onchange={() => flip(i)} />
            <ScopeChip scope={g.scope} target={g.title} sideEffects={g.sideEffects.map((s) => s.name)} />
            <ul class="changes">
              {#each changesOfGroup(row, g) as c (c.id)}
                <li>{#if c.moved}{c.label}: {c.moved}{:else}{c.label}: {c.from} <span class="arrow">→</span> <b>{c.to}</b>{/if}
                  {#if c.medalCost}<p class="note num">{medalCostText(c.medalCost)}</p>{/if}
                </li>
              {/each}
            </ul>
            {#each g.sideEffects as s (s.presetId + s.reason)}
              <p class="side" data-testid="side-effect">Also changes <b>{s.name}</b>: {s.reason}</p>
            {/each}
          </div>
        {/each}
        {#if effects.length}
          <Banner variant="warn" lead="Other presets change too.">
            {effects.map((e) => e.name).join(', ')} use{effects.length === 1 ? 's' : ''} what these groups change. Run the Optimiser again to check {effects.length === 1 ? 'it' : 'them'}.
          </Banner>
        {/if}
        {#if error}<Banner variant="error" lead="Not applied.">{error}</Banner>{/if}
        {#if plan?.blockReason}<Banner variant="warn">{plan.blockReason}</Banner>{/if}
        {#if row.changes.some((c) => c.medalCost)}<p class="note">Medal costs are estimates. Apply changes your local character only; purchase or upgrade in-game separately.</p>{/if}
        <p class="note">After you apply, this preset's in-game stats are checked against the new build. Run the Optimiser again to see the result.</p>
      </div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button
      variant="primary"
      disabled={!plan || plan.writesCount === 0 || !!plan.blockReason}
      reason={plan?.blockReason || (plan && plan.writesCount === 0 ? 'Switch at least one group on.' : '')}
      onclick={() => plan && !plan.blockReason && onconfirm({ cand: plan.cand, include: plan.include })}
    >
      Apply {plan ? plan.writesCount : 0} group{plan?.writesCount === 1 ? '' : 's'}
    </Button>
  {/snippet}
</Modal>

<style>
  .review { display: grid; gap: var(--sp-3); }
  .lead, .note { margin: 0; color: var(--text-soft); font-size: var(--fs-13); }
  .note { color: var(--text-muted); font-size: var(--fs-12); }
  .group { display: grid; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--line-rule); border-radius: var(--r-1); background: var(--surface-1); }
  .group.off { opacity: 0.6; }
  .changes { margin: 0; padding-left: var(--sp-5); font-size: var(--fs-13); color: var(--text-soft); }
  .changes b { color: var(--text-ink); }
  .arrow { color: var(--text-muted); }
  .side { margin: 0; font-size: var(--fs-12); color: var(--status-warn); }
</style>
