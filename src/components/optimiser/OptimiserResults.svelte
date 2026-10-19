<script>
  /**
   * OptimiserResults.svelte - the ranked table of an optimiser result or a saved run (ia.md §3.3, A.9):
   * a sticky baseline row ("NOW"), one expandable row per build on a single shared forest axis, tie
   * groups ("2="), verdicts, per-change `own`/`needed`/scope, the interaction remainder and, for a PVP run,
   * the opponent x seat table. `view` is lib/ui/optimiserView.js viewResult/viewRun.
   *
   * `onapply` / `onrunmore` are null when the table cannot act on a row. A saved run offers Apply (its stored write
   * groups) but never Run more. `unmeasured(row)` marks rows whose
   * per-change effects were not measured (provisional rows, runs saved before the attribution pass).
   */
  import ResultRank from '../ui/ResultRank.svelte';
  import ForestAxis from '../ui/ForestAxis.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import Drawer from '../ui/Drawer.svelte';
  import { triesPerClear } from '../../lib/ui/winRateFormat.js';
  import { goalWinRate, fortressDamage } from '../../lib/ui/optimiserView.js';
  import { isWinRateKind } from '../../lib/search/objectives.js';
  import { medalCostText } from '../../lib/search/relicProgression.js';
  import { fmtSigned, fmtEstimate, fmtContrast, fmtContrastCi } from '../../lib/ui/statsFormat.js';

  let {
    view,
    presetName = 'this build',
    onapply = null,
    applyBlocked = '',
    missingWritesReason = 'Nothing to apply.',
    onrunmore = null,
    unmeasured = () => false,
    busy = false,
  } = $props();

  let buildRow = $state(null);
  let drawer = $state(false);

  const AXIS_TITLE = { dps: 'Change in DPS vs current', ms: 'Time saved vs current (positive is faster)', p: 'Change in chance vs current', influence: 'Change in Influence from wins per attack vs current' };
  // A PVE win-rate run (either win-rate goal): one axis in win-rate points and tries per clear on every row; a
  // target goal adds a Meets / Below target chip per row. A Push run's rows are win-rate rows measured on the
  // step the build was found for (simulation.md §Push).
  const winRun = $derived(isWinRateKind(view.kind) || view.kind === 'push');
  const maxRun = $derived(view.kind === 'win-chance');
  const target = $derived(winRun ? (view.goal?.target ?? view.push?.target ?? null) : null);
  // The highest-chance verdict's build: the first row shown better than the current one (search.js chanceGoalOf).
  const bestRow = $derived(maxRun ? (view.rows.find((r) => r.vsBaseline?.verdict === 'better' && r.vsBaseline.basis === 'win-rate') ?? null) : null);
  const axisTitle = $derived(winRun ? 'Change in win rate vs current (percentage points)' : AXIS_TITLE[view.unit]);
  // The win rate the goal banners talk about (optimiserView.js goalWinRate).
  const goalTries = $derived(triesPerClear(goalWinRate(view)));
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const showBuild = (row) => {
    buildRow = row;
    drawer = true;
  };
  const credit = (row) => fortressDamage(view.fortress, row?.value?.est);
  const fmtInt = (n) => n.toLocaleString('en-US');
  const SEAT = { attacker: 'I attack', defender: 'I defend' };
</script>

<div class="table" class:busy aria-busy={busy} data-testid="optimiser-results">
  {#if maxRun && view.goal?.status === 'already'}
    <div class="goal" data-testid="goal-already">
      <Banner variant="success" lead="Already clears every try.">
        No build is clearly better than the current one{goalTries ? ` (${goalTries})` : ''}. No changes suggested.
      </Banner>
    </div>
  {:else if view.goal?.status === 'no-wins'}
    <div class="goal" data-testid="goal-no-wins">
      <Banner variant="warn" lead="No build won a fight.">
        The builds are ranked by how far their fights got: the share of the step's HP they remove before losing.
      </Banner>
    </div>
  {:else if maxRun && view.goal?.status === 'best' && bestRow}
    <div class="goal" data-testid="goal-best">
      <Banner variant="success" lead="Best chance to win: {fmtEstimate('p', bestRow.aux.winRate)}.">
        The first row has the best chance found{goalTries ? ` (${goalTries})` : ''}. Builds too close to tell apart count as equal, and the one with fewer changes ranks first.
      </Banner>
    </div>
  {:else if maxRun && view.goal?.status === 'best'}
    <div class="goal" data-testid="goal-no-gain">
      <Banner variant="info" lead="No change raised the chance to win.">
        The current build wins {view.baseline?.aux?.winRate ? fmtEstimate('p', view.baseline.aux.winRate) : 'as before'}{goalTries ? ` (${goalTries})` : ''}.
      </Banner>
    </div>
  {:else if view.goal?.status === 'already'}
    <div class="goal" data-testid="goal-already">
      <Banner variant="success" lead="Already clears the target.">
        The current build wins at least {pct(view.goal.target)} of the time{goalTries ? ` (${goalTries})` : ''}. No changes suggested.
      </Banner>
    </div>
  {:else if view.goal?.status === 'not-reached' && view.rows.length}
    <div class="goal" data-testid="goal-not-reached">
      <Banner variant="warn" lead="No build reached {pct(view.goal.target)}.">
        These are the closest builds, and each row says how far it falls short.{goalTries ? ` The best wins ${goalTries}.` : ''}
      </Banner>
    </div>
  {:else if view.goal?.status === 'not-reached'}
    <div class="goal" data-testid="goal-not-reached">
      <Banner variant="warn" lead="No build reached {pct(view.goal.target)}.">No change moved the win rate; the current build is the closest{goalTries ? ` (${goalTries})` : ''}.</Banner>
    </div>
  {/if}
  {#if view.fortress && view.baseline && credit(view.baseline)}
    <p class="note" data-testid="fortress-credit-baseline">
      Current build: raw damage in 60 s {fmtInt(credit(view.baseline).raw)}, credited to the clan {fmtInt(credit(view.baseline).effective)} (x {view.fortress.total.toFixed(2)}).
      The multipliers are the same for every build, so they never change the ranking.
    </p>
  {/if}
  <div class="sticky">
    <div class="head" role="presentation">
      <span class="lbl">Result · likely range</span>
      <ForestAxis domain={view.domain} title={axisTitle} format={(x) => fmtSigned(view.unit, x)} />
      <span class="lbl right">Change</span>
      <span class="lbl">Verdict</span>
    </div>
    {#if view.baseline}
      <div data-testid="baseline-row">
        <ResultRank row={view.baseline} unit={view.unit} domain={view.domain} {presetName} {target} tries={winRun} basePower={view.baseline.power ?? null} />
      </div>
    {/if}
  </div>

  {#each view.rows as row (row.key)}
    <div data-testid="result-row">
      <ResultRank
        {row}
        unit={view.unit}
        domain={view.domain}
        {presetName}
        {target}
        tries={winRun}
        basePower={view.baseline?.power ?? null}
        unmeasured={unmeasured(row)}
        onrunmore={onrunmore && !busy ? onrunmore : null}
      >
        {#snippet footer(r)}
          {#if winRun && r.vsBaseline?.basis}
            <p class="note" data-testid="goal-basis">{maxRun
              ? r.vsBaseline.basis === 'margin'
                ? 'Neither build won a fight, so the verdict compares how far the fights got (the share of the step\'s HP removed).'
                : 'The verdict compares the win rate; builds too close to tell apart count as equal and the one with fewer changes ranks first.'
              : r.vsBaseline.basis === 'margin'
                ? 'Both builds win less than the target, so the verdict compares how far the fights got, not the win rate shown.'
                : 'The verdict counts win rate only up to the target; a build above it gains nothing more.'}</p>
          {/if}
          {#each r.changes.filter((c) => c.own?.basis === 'winRate' || c.needed?.basis === 'winRate') as c (c.id)}
            {@const w = c.own?.winRate ?? c.needed?.winRate}
            <p class="note" data-testid="winrate-note">{c.label}: both builds rarely win, so this change is compared by win rate ({fmtSigned('p', w.delta)}).</p>
          {/each}
          {#if r.vsBaseline?.basis === 'winRate'}
            <p class="note" data-testid="winrate-note">Both builds rarely win, so the verdict compares win rate ({fmtSigned('p', r.vsBaseline.winRate.delta)}), not time.</p>
          {/if}
          {#if view.fortress && credit(r)}
            <p class="note" data-testid="fortress-credit">
              Raw damage in 60 s {fmtInt(credit(r).raw)}. Credited to the clan {fmtInt(credit(r).effective)}
              (x {view.fortress.total.toFixed(2)}: shield {view.fortress.shieldPercent}%, contribution x {view.fortress.contributionBonus.toFixed(2)}, stars x {view.fortress.starVulnerability.toFixed(2)}).
            </p>
          {/if}
          {#each r.changes.filter((c) => c.medalCost) as c (c.id)}
            <p class="note num" data-testid="relic-cost">{c.label}: {medalCostText(c.medalCost)}</p>
          {/each}
          {#each r.changes.filter((c) => c.costNote) as c (c.id)}
            <p class="note num" data-testid="source-cost">{c.label}: {c.costNote}</p>
          {/each}
          {#if r.aux?.matchups?.length}
            <table class="matchups" data-testid="matchups">
              <caption>{view.unit === 'influence' ? 'Influence from wins against each selected opponent' : 'Win rate against each opponent, as attacker and as defender'}</caption>
              <thead><tr><th scope="col">Opponent</th><th scope="col">Seat</th><th scope="col">{view.unit === 'influence' ? 'Influence per attack' : 'Win rate'}</th><th scope="col">Fights</th><th scope="col">vs current</th></tr></thead>
              <tbody>
                {#each r.aux.matchups as m (m.opponentId + m.seat)}
                  <tr>
                    <th scope="row">{m.name}</th>
                    <td>{SEAT[m.seat]}</td>
                    <td class="num">{fmtEstimate(view.unit, m.value)}</td>
                    <td class="num">{m.value?.n ?? 0}</td>
                    <td class="num">{m.vsBaseline ? `${fmtContrast(view.unit, m.vsBaseline)} ${fmtContrastCi(view.unit, m.vsBaseline)}` : ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <details class="basis">
              <summary>How this works</summary>
              {#if view.unit === 'influence'}
                <p>Each attempt pays the displayed Influence only when it wins. The combined result gives each selected opponent equal weight. Exact binomial limits cover the reward-scaled win rates; paired comparisons reuse the same fights. Loss rewards and matchmaking are unknown.</p>
              {:else}<p>Each row is measured on its own fights. Its likely range is a Wilson interval, and the ranges are not corrected for the number of rows.</p>{/if}
            </details>
          {/if}
          {#if r.aux?.winRate && !winRun}
            <p class="note">Win rate {fmtEstimate('p', r.aux.winRate)}{r.aux.meanMs != null ? ` · average time of the wins ${(r.aux.meanMs / 1000).toFixed(2)} s` : ''}</p>
          {/if}
          <div class="actions">
            <Button variant="ghost" size="small" onclick={() => showBuild(r)}>Show full build</Button>
            {#if onapply}
              <Button
                variant="primary"
                size="small"
                disabled={!!applyBlocked || r.provisional || !(r.writes?.length)}
                reason={applyBlocked || (r.provisional ? 'Not confirmed yet.' : !(r.writes?.length) ? missingWritesReason : '')}
                onclick={() => onapply(r)}>Apply to {presetName}…</Button
              >
            {/if}
          </div>
        {/snippet}
      </ResultRank>
    </div>
  {/each}
</div>

<Drawer bind:open={drawer} title={buildRow ? `Rank ${buildRow.rank === 0 ? 'NOW' : buildRow.rank}, full build` : 'Full build'}>
  {#if buildRow}
    <dl class="lines" data-testid="full-build">
      {#each buildRow.lines ?? [] as l (l.label)}
        <div><dt>{l.label}</dt><dd>{l.value}{#if l.inactive}<span class="inactive"> · inactive: {l.inactive}</span>{/if}</dd></div>
      {:else}
        <p class="note">This saved run kept no build lines for this row.</p>
      {/each}
    </dl>
  {/if}
</Drawer>

<style>
  .table { border: 1px solid var(--line-rule); border-radius: var(--r-1); background: var(--surface-2); }
  .table.busy { opacity: 0.55; }
  .sticky { position: sticky; top: var(--topbar-h, 0); z-index: 2; background: var(--surface-2); border-bottom: 1px solid var(--line-rule); }
  .head {
    display: grid;
    grid-template-columns: minmax(calc(var(--sp-10) * 3.25), 1.9fr) minmax(calc(var(--sp-10) * 3.75), 1.3fr) calc(var(--sp-10) * 2.4) calc(var(--sp-10) * 3.75);
    column-gap: calc(var(--sp-1) * 2.5);
    align-items: end;
    padding: 0 var(--sp-4);
  }
  .lbl { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); padding-bottom: var(--sp-1); }
  .lbl.right { text-align: right; }
  .goal { padding: var(--sp-3); border-bottom: 1px solid var(--line-rule); }
  .note { margin: 0; padding: var(--sp-1) var(--sp-4) var(--sp-1) var(--sp-8); font-size: var(--fs-12); color: var(--text-soft); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-8); }
  .matchups { margin: var(--sp-2) var(--sp-4) var(--sp-2) var(--sp-8); border-collapse: collapse; font-size: var(--fs-12); color: var(--text-soft); }
  .matchups caption { text-align: left; padding-bottom: var(--sp-1); color: var(--text-muted); }
  .matchups th, .matchups td { text-align: left; padding: calc(var(--sp-1) * 0.5) var(--sp-3) calc(var(--sp-1) * 0.5) 0; font-weight: var(--fw-medium); }
  .basis { margin: 0 var(--sp-4) var(--sp-2) var(--sp-8); font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
  .matchups .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .lines { margin: 0; display: grid; gap: var(--sp-2); }
  .lines div { display: grid; gap: calc(var(--sp-1) * 0.5); }
  .lines dt { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .lines dd { margin: 0; color: var(--text-ink); font-size: var(--fs-13); }
  .inactive { color: var(--status-warn); }
  @media (max-width: 700px) {
    .head { display: none; }
  }
</style>
