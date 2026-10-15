<script>
  /**
   * ReplayCheck.svelte - optional: import an exported `/arena/fight` response and check it against
   * the engine's rules (pvp/replayCheck.js). The server's RNG is not ours, so only what does not
   * depend on it is compared exactly. With "use the fighters above" the log is also held to the two
   * stat sheets of the duel on screen.
   */
  import { replayCheck } from '../../lib/engine/pvp/replayCheck.js';
  import { takeHandoff } from '../../lib/importFlow.svelte.js';

  /** @type {{attacker?: Object|null, defender?: Object|null}} */
  let { attacker = null, defender = null } = $props();

  let text = $state(takeHandoff('fightLog') ?? ''); // a fight log read by the import dialog (G3) arrives once
  let useFighters = $state(false);
  let report = $state(null);
  let error = $state('');

  const canUseFighters = $derived(!!attacker && !!defender);

  function run() {
    error = '';
    report = null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      error = 'That is not valid JSON.';
      return;
    }
    try {
      report = replayCheck(parsed, useFighters && canUseFighters ? { attacker, defender } : {});
    } catch (e) {
      error = `Could not check this log: ${e.message}`;
    }
  }

  async function onFile(e) {
    const file = e.currentTarget.files?.[0];
    if (file) text = await file.text();
  }
</script>

<details class="replay" data-testid="replay-check" open={text !== ''}>
  <summary class="micro-label">Check an exported /arena/fight log (optional)</summary>
  <div class="body">
    <p class="note">
      Paste the JSON or pick the file. Checks the deterministic skeleton (tick grid, swing times, regen, x8 HP) and hit
      sizes; the server's dice are not ours, so outcomes are not compared.
    </p>
    <input type="file" accept="application/json,.json" aria-label="Fight log file" onchange={onFile} />
    <textarea rows="4" aria-label="Fight log JSON" placeholder="paste the fight response here" bind:value={text}></textarea>
    <label class="check">
      <input type="checkbox" bind:checked={useFighters} disabled={!canUseFighters} />
      Hold the log to the fighters above
    </label>
    <div><button type="button" class="btn-ghost" disabled={!text.trim()} onclick={run}>Check log</button></div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if report}
      <p class="verdict" class:bad={!report.ok} data-testid="replay-verdict">
        {report.ok ? 'No rule failed' : `${report.totalMismatches} mismatch${report.totalMismatches === 1 ? '' : 'es'}`}
      </p>
      <table class="mono">
        <thead><tr><th>Rule</th><th>Status</th><th>Checked</th><th>Failed</th><th>Note</th></tr></thead>
        <tbody>
          {#each report.rules as r (r.rule)}
            <tr class={r.status}>
              <th>{r.rule}</th><td>{r.status}</td><td>{r.checked}</td><td>{r.failed}</td><td class="n">{r.note ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if report.mismatches.length}
        <ul class="mismatches">
          {#each report.mismatches as m, i (i)}
            <li><span class="mono">{m.rule}{m.index !== undefined ? ` #${m.index}` : ''}</span> {m.message}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</details>

<style>
  .replay { border-top: 1px solid var(--color-border); padding-top: var(--space-3); }
  summary { cursor: pointer; }
  .body { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
  textarea { width: 100%; font-family: var(--font-data); font-size: 11px; box-sizing: border-box; }
  .note { color: var(--color-muted); font-size: 11.5px; margin: 0; }
  .check { font-size: 12px; color: var(--color-soft); display: flex; gap: 6px; align-items: center; }
  .error, .verdict.bad { color: var(--color-downgrade); font-size: 12px; margin: 0; }
  .verdict { margin: 0; font-size: 12.5px; color: var(--color-upgrade); }
  table { border-collapse: collapse; font-size: 11.5px; display: block; overflow-x: auto; }
  th, td { padding: 2px 8px; text-align: left; border-bottom: 1px solid var(--color-border-hairline); }
  tr.fail td, tr.fail th { color: var(--color-downgrade); }
  tr.skipped td, tr.skipped th { color: var(--color-muted); }
  td.n { font-family: var(--font-body, inherit); white-space: normal; min-width: 160px; }
  .mismatches { margin: 0; padding-left: 18px; font-size: 12px; color: var(--color-soft); }
</style>
