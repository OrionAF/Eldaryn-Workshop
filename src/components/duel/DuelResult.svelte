<script>
  /**
   * DuelResult.svelte - the outcome of a win-rate run (seen from my side, with its 95 % Wilson
   * interval and N) and the frequencies in the one traced duel next to it. The trace is a single
   * sample, labelled as such; the interval above it is the evidence.
   */
  import { formatFlat } from '../../lib/format.js';

  /** @type {{result: {p: number, lo: number, hi: number, n: number, meanMs?: number, p90Ms?: number, timeoutShare?: number, aborted?: boolean}|null, traceStats?: Object|null, traceWon?: boolean|null, myName?: string, theirName?: string, mySide?: 'attacker'|'defender'}} */
  let { result, traceStats = null, traceWon = null, myName = 'You', theirName = 'Opponent', mySide = 'attacker' } = $props();

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const secs = (ms) => (ms / 1000).toFixed(1);
  const verdict = $derived(
    !result || !result.n ? '' : result.lo > 0.5 ? 'Favoured' : result.hi < 0.5 ? 'Unfavoured' : 'Too close to call at this N',
  );
  const other = (s) => (s === 'attacker' ? 'defender' : 'attacker');
  const rows = $derived(
    traceStats
      ? [
          [myName, traceStats[mySide]],
          [theirName, traceStats[other(mySide)]],
        ]
      : [],
  );
</script>

{#if result && result.n > 0}
  <div class="result" data-testid="duel-result">
    <div class="headline">
      <span class="big mono" data-testid="win-rate">{pct(result.p)}</span>
      <span class="ci mono" data-testid="win-ci">95% CI {pct(result.lo)} to {pct(result.hi)} · N={result.n}</span>
      {#if result.aborted}<span class="badge">cancelled early</span>{/if}
    </div>
    <div class="band" role="img" aria-label={`Win rate ${pct(result.p)}, interval ${pct(result.lo)} to ${pct(result.hi)}`}>
      <span class="ci-fill" style={`left: ${result.lo * 100}%; width: ${(result.hi - result.lo) * 100}%`}></span>
      <span class="mid"></span>
      <span class="point" style={`left: ${result.p * 100}%`}></span>
    </div>
    <p class="verdict" data-testid="duel-verdict">{verdict}</p>
    <dl class="facts mono">
      <div><dt>Mean duration</dt><dd>{secs(result.meanMs ?? 0)}s</dd></div>
      <div><dt>P90 duration</dt><dd>{secs(result.p90Ms ?? 0)}s</dd></div>
      <div><dt>Timeouts</dt><dd>{pct(result.timeoutShare ?? 0)}</dd></div>
    </dl>
    <p class="note">Ties and timeouts at equal HP go to the defender, as in the game's engine.</p>
  </div>
{/if}

{#if rows.length}
  <div class="trace" data-testid="trace-stats">
    <span class="micro-label">
      Traced duel - one sample{traceWon === null ? '' : traceWon ? ', you won' : ', you lost'}
    </span>
    <table class="mono">
      <thead>
        <tr><th></th><th>Swings</th><th>Crit</th><th>Avoided</th><th>Lost</th><th>Disrupts</th><th>Damage</th></tr>
      </thead>
      <tbody>
        {#each rows as [name, s] (name)}
          <tr>
            <th>{name}</th>
            <td>{s.swings}</td>
            <td>{s.swings ? pct(s.crits / s.swings) : '-'}</td>
            <td>{s.swings ? pct(s.avoided / s.swings) : '-'}</td>
            <td>{s.lost}</td>
            <td>{s.disrupts}</td>
            <td>{formatFlat(Math.round(s.damage))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .result { display: flex; flex-direction: column; gap: var(--space-2); }
  .headline { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .big { font-size: 34px; color: var(--color-gold-light); }
  .ci { font-size: 12px; color: var(--color-soft); }
  .badge { font-size: 11px; color: var(--color-warning); border: 1px solid var(--color-warning); border-radius: var(--radius-chip); padding: 1px 8px; }
  .band { position: relative; height: 10px; border-radius: 5px; background: var(--color-inset); border: 1px solid var(--color-border); }
  .ci-fill { position: absolute; top: 0; bottom: 0; background: var(--color-gold-tint); border-left: 1px solid var(--color-gold); border-right: 1px solid var(--color-gold); }
  .mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--color-border-strong); }
  .point { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1px; background: var(--color-gold-light); }
  .verdict { margin: 0; font-size: 12.5px; color: var(--color-soft); }
  .facts { display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0; font-size: 12px; }
  .facts div { display: flex; flex-direction: column; }
  .facts dt { color: var(--color-muted); font-family: var(--font-body, inherit); font-size: 10.5px; }
  .facts dd { margin: 0; color: var(--color-ink); }
  .note { color: var(--color-muted); font-size: 11.5px; margin: 0; }
  .trace { margin-top: var(--space-3); display: flex; flex-direction: column; gap: 6px; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 12px; }
  th, td { padding: 3px 10px; text-align: right; border-bottom: 1px solid var(--color-border-hairline); }
  th { color: var(--color-muted); font-weight: 400; }
  tbody th { text-align: left; color: var(--color-soft); }
</style>
