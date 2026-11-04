<script>
  /**
   * RosterTable.svelte - the All opponents run on the Duel page: one row per saved opponent with my
   * win rate, its 95% Wilson interval and N (design-system §4.15), sorted by rosterRows (duel.js).
   * Picking an opponent's name opens that duel on its own.
   *
   * rows: rosterRows(...) output; onpick(id) opens one opponent.
   */
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import Button from '../ui/Button.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';

  let { rows, onpick = () => {} } = $props();

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const STATUS = { queued: 'Queued', running: 'Running…', cancelled: 'Cancelled', failed: 'Failed', finished: 'No fights' };
  const verdictLabel = (v) => (v?.verdict === 'better' ? 'Likely to win' : v?.verdict === 'worse' ? 'Likely to lose' : 'Too close to call');
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be keyboard reachable) -->
<div class="scroll" tabindex="0" role="region" aria-label="Win rate against each opponent">
  <table data-testid="roster-table">
    <thead>
      <tr>
        <th scope="col">Opponent</th>
        <th scope="col" class="r">Win rate</th>
        <th scope="col" class="r">Likely range</th>
        <th scope="col" class="r">Fights</th>
        <th scope="col">Verdict</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.id)}
        <tr data-testid="roster-row-{r.id}" data-status={r.status}>
          <th scope="row" class="lbl">
            {#if r.status === 'skipped'}
              {r.name}
            {:else}
              <Button variant="ghost" size="small" onclick={() => onpick(r.id)}>{r.name}</Button>
            {/if}
          </th>
          {#if r.summary}
            <td class="r num">{pct(r.summary.p)}</td>
            <td class="r num">{pct(r.summary.lo)} to {pct(r.summary.hi)}</td>
            <td class="r num">{fmtCount(r.summary.n)}</td>
            <td>
              <VerdictChip verdict={r.verdict?.verdict ?? 'unresolved'} label={verdictLabel(r.verdict)} />
              {#if r.status === 'cancelled'}<span class="note">Cancelled</span>{/if}
              {#if r.stale}<span class="note">Setup changed</span>{/if}
            </td>
          {:else if r.status === 'skipped'}
            <td colspan="4" class="note" data-testid="roster-skipped">Skipped: {r.reason}</td>
          {:else}
            <td colspan="3"></td>
            <td>
              {#if r.status === 'queued' || r.status === 'running'}
                <VerdictChip verdict={r.status === 'queued' ? 'queued' : 'pending'} />
              {:else}
                <span class="note">{STATUS[r.status] ?? r.status}</span>
              {/if}
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-13); }
  th, td { padding: var(--sp-1) var(--sp-3); border-bottom: 1px solid var(--line-hairline); vertical-align: middle; }
  thead th { color: var(--text-muted); font-size: var(--fs-11); text-transform: uppercase; letter-spacing: var(--track-label); text-align: left; }
  thead th.r, .r { text-align: right; }
  /* A row header is a name, not a column label: no uppercase micro-label styling from the global th rule. */
  .lbl { text-align: left; font-weight: 400; color: var(--text-soft); font-family: var(--font-ui); font-size: var(--fs-13); text-transform: none; letter-spacing: normal; white-space: nowrap; }
  .num { color: var(--text-ink); white-space: nowrap; }
  .note { color: var(--text-muted); font-size: var(--fs-12); margin-left: var(--sp-2); }
  td.note { margin: 0; }
</style>
