<script>
  /**
   * VerifyFightLog.svelte - the Verify tab (ia.md §3.4, §5.19): an exported `/arena/fight` response
   * checked against the engine's rules (pvp/replayCheck.js). The server's dice are not ours, so only
   * what does not depend on them is compared exactly. Each rule reports pass, fail or skipped; a
   * skipped rule compared nothing, and the report says so rather than counting it as a pass.
   */
  import { replayCheck } from '../../lib/engine/pvp/replayCheck.js';
  import Panel from '../ui/Panel.svelte';
  import DropZone from '../ui/DropZone.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';

  /** @type {{fighters?: {attacker: Object, defender: Object, label: string}|null, handoff?: {text: string, n: number}|null}} */
  let { fighters = null, handoff = null } = $props();

  let text = $state('');
  let useFighters = $state(false);
  let report = $state(null);
  let error = $state('');
  let fileError = $state('');

  const STATUS = { pass: ['✓', 'Pass'], fail: ['✕', 'Fail'], skipped: ['–', 'Skipped'] };
  const skipped = $derived(report ? report.rules.filter((r) => r.status === 'skipped') : []);

  function check(source = text) {
    error = '';
    report = null;
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch {
      error = 'That is not valid JSON.';
      return;
    }
    try {
      report = replayCheck(parsed, useFighters && fighters ? { attacker: fighters.attacker, defender: fighters.defender } : {});
    } catch (e) {
      error = `Could not check this log: ${e.message}`;
    }
  }

  // A fight log from the import dialog: load its text and check it at once (once per handoff).
  let seen = 0;
  $effect(() => {
    if (!handoff || handoff.n === seen) return;
    seen = handoff.n;
    text = handoff.text;
    check(handoff.text);
  });

  async function onfile(file) {
    fileError = '';
    try {
      text = await file.text();
    } catch {
      fileError = 'That file could not be read.';
    }
  }
</script>

<div class="panes" data-testid="replay-check">
  <Panel title="Fight log" level="primary" scope="tool">
    <DropZone {onfile} label="Drop a fight log or click to choose" hint="JSON from /arena/fight" error={fileError} />
    <Textarea label="Pasted log" rows={6} placeholder="paste the fight response here" bind:value={text} />
    <Checkbox bind:checked={useFighters} disabled={!fighters} label={fighters ? `Hold the simulator to these fighters: ${fighters.label}` : 'Hold the simulator to the fighters (pick a runnable duel first)'} />
    {#snippet footer()}
      <Button variant="primary" size="block" disabled={!text.trim()} onclick={() => check()}>Check log</Button>
    {/snippet}
  </Panel>

  <Panel title="Replay report" level="primary" scope="tool">
    {#if error}
      <Banner variant="error">{error}</Banner>
    {:else if !report}
      <p class="note">Nothing checked yet. The report lists every rule with its status and what it compared.</p>
    {:else}
      <div class="headline">
        <h3 data-testid="replay-verdict">{report.ok ? 'No rule failed' : `${report.totalMismatches} mismatch${report.totalMismatches === 1 ? '' : 'es'}`}</h3>
        {#if skipped.length}
          <p data-testid="replay-skipped">
            {skipped.length} rule{skipped.length === 1 ? '' : 's'} skipped: nothing was compared for {skipped.length === 1 ? 'it' : 'them'}, so
            {skipped.length === 1 ? 'it is' : 'they are'} not counted as passes.
          </p>
        {/if}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be keyboard reachable) -->
      <div class="scroll" tabindex="0" role="region" aria-label="Rule results">
        <table class="stat-table" data-testid="replay-rules">
          <thead><tr><th scope="col">Rule</th><th scope="col">Status</th><th scope="col" class="r">Checked</th><th scope="col" class="r">Failed</th><th scope="col">Note</th></tr></thead>
          <tbody>
            {#each report.rules as r (r.rule)}
              <tr class={r.status}>
                <th scope="row" class="lbl">{r.rule}</th>
                <td><span class="st {r.status}"><span aria-hidden="true">{STATUS[r.status]?.[0] ?? '?'}</span> {STATUS[r.status]?.[1] ?? r.status}</span></td>
                <td class="r num">{r.checked}</td>
                <td class="r num">{r.failed}</td>
                <td class="note-cell">{r.note ?? ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if report.mismatches.length}
        <ul class="mismatches">
          {#each report.mismatches as m, i (i)}
            <li><span class="num">{m.rule}{m.index !== undefined ? ` #${m.index}` : ''}</span> {m.message}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  </Panel>
</div>

<style>
  .panes { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  @media (max-width: 1100px) { .panes { grid-template-columns: minmax(0, 1fr); } }
  .note { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .headline h3 { margin: 0; font-size: var(--fs-16); }
  .headline p { margin: var(--sp-1) 0 0; color: var(--text-soft); font-size: var(--fs-13); }
  .scroll { overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-13); }
  th, td { padding: 3px var(--sp-3); border-bottom: 1px solid var(--line-hairline); text-align: left; vertical-align: top; }
  thead th { color: var(--text-muted); font-size: var(--fs-11); text-transform: uppercase; letter-spacing: 0.08em; }
  .r { text-align: right; }
  .lbl { font-weight: 400; color: var(--text-soft); font-family: var(--font-ui); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .note-cell { color: var(--text-soft); min-width: 160px; }
  .st { white-space: nowrap; }
  .st.fail { color: var(--verdict-down); }
  .st.skipped { color: var(--text-muted); }
  .mismatches { margin: 0; padding-left: var(--sp-5); font-size: var(--fs-13); color: var(--text-soft); }
</style>
