<script>
  /**
   * VerifyFightLog.svelte - the Verify tab (ia.md §3.4, §5.19): an exported server fight response
   * checked against the engine's rules for that fight (features/verifyLog.js: arena, dungeon, Village
   * Raid, World Boss, Fortress Boss). The server's dice are not ours, so only what does not depend on
   * them is compared exactly. Each rule reports pass, fail or skipped; a skipped rule compared nothing,
   * and the report says so rather than counting it as a pass.
   *
   * The log says which fight it is but not which step, boss or affinity was fought, nor whose sheet
   * fought it: those are picked here, and a rule that needs one that is not set reports skipped.
   */
  import {
    FIGHT_KINDS, DUNGEON_OPTIONS, RAID_OPTIONS, STEP_OPTIONS, AFFINITY_OPTIONS, FORTRESS_OPTIONS,
    detectFightKind, verifyFightLog, describeFight, fightKindLabel, fortressGroupOf, isPveKind,
  } from '../../lib/features/verifyLog.js';
  import { buildFighter } from '../../lib/build/fighter.js';
  import Panel from '../ui/Panel.svelte';
  import ImportPointer from '../import/ImportPointer.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';

  /** @type {{fighters?: {attacker: Object, defender: Object, label: string}|null, handoff?: {text: string, n: number}|null, pickOne?: boolean, character?: Object|null}} */
  let { fighters = null, handoff = null, pickOne = false, character = null } = $props();

  const NOT_SET = { value: '', label: 'Not set' };
  const withNotSet = (options) => [NOT_SET, ...options];
  const kindOptions = FIGHT_KINDS.map((k) => ({ value: k.id, label: k.label }));

  let text = $state('');
  let kind = $state('arena');
  let detected = $state(null); // the fight the loaded log says it is; null when it does not say
  let useFighters = $state(false);
  let presetPick = $state(null);
  let target = $state({ dungeon: '', raid: '', step: '', affinity: '', group: '' });
  let report = $state(null);
  let checkedAs = $state(''); // what the shown report was held against
  let error = $state('');

  const STATUS = { pass: ['✓', 'Pass'], fail: ['✕', 'Fail'], skipped: ['–', 'Skipped'] };
  const skipped = $derived(report ? report.rules.filter((r) => r.status === 'skipped') : []);
  const loaded = $derived(!!text.trim());
  const pve = $derived(isPveKind(kind));
  const presets = $derived(character?.presets ?? []);
  const preset = $derived(presets.find((p) => p.id === presetPick) ?? presets.find((p) => p.id === character?.activePresetId) ?? presets[0] ?? null);
  const presetOptions = $derived(presets.map((p) => ({ value: p.id, label: p.name })));
  const kindHint = $derived(
    !loaded ? ''
      : !detected ? 'The log does not say which fight it is. Pick it here.'
        : detected === kind ? 'Read from the log.' : `The log looks like ${fightKindLabel(detected)}.`,
  );
  const fightersLabel = $derived(
    pve
      ? preset ? 'Check against one of my presets' : 'Check against one of my presets (no character is selected)'
      : fighters ? `Check against these fighters: ${fighters.label}` : pickOne ? 'Check against the duel fighters (pick one opponent first)' : 'Check against the duel fighters (set up a duel first)',
  );
  const canUseFighters = $derived(pve ? !!preset : !!fighters);

  /** @param {boolean} fresh  a newly loaded log: read the fight (and the fortress) from it first */
  function check(source = text, fresh = false) {
    error = '';
    report = null;
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch {
      error = 'That file could not be read. Choose a fight log exported from the game.';
      return;
    }
    if (fresh) {
      detected = detectFightKind(parsed);
      kind = detected ?? 'arena';
      const group = fortressGroupOf(parsed);
      if (group) target.group = group;
    }
    try {
      const picked = { dungeon: target.dungeon, raid: target.raid, step: Number(target.step) || 0, affinity: target.affinity, group: target.group };
      const against = useFighters && canUseFighters;
      const sides = !against ? {} : pve ? { attacker: buildFighter(character, preset.id) } : { attacker: fighters.attacker, defender: fighters.defender };
      report = verifyFightLog(parsed, { kind, target: picked, ...sides });
      checkedAs = `${describeFight(kind, picked)}${against ? `, against ${pve ? preset.name : fighters.label}` : ''}`;
    } catch (e) {
      error = `Could not check this log: ${e.message}`;
    }
  }
  /** A changed choice re-runs the check on the loaded log, so the report always matches the fields. */
  const recheck = () => { if (loaded) check(); };

  // A fight log from the import dialog: load its text and check it at once (once per handoff).
  let seen = 0;
  $effect(() => {
    if (!handoff || handoff.n === seen) return;
    seen = handoff.n;
    text = handoff.text;
    check(handoff.text, true);
  });

</script>

<div class="panes" data-testid="replay-check">
  <Panel title="Fight log" level="primary" scope="tool">
    <ImportPointer what="a fight log" />
    <p class="note" data-testid="log-state">{loaded ? 'A fight log is loaded.' : 'No fight log imported yet.'}</p>
    <div class="fields" data-testid="verify-setup">
      <Select label="Fight" options={kindOptions} bind:value={kind} hint={kindHint} onchange={recheck} />
      {#if kind === 'dungeon'}
        <div class="two">
          <Select label="Dungeon" options={withNotSet(DUNGEON_OPTIONS)} bind:value={target.dungeon} onchange={recheck} />
          <Select label="Step" options={withNotSet(STEP_OPTIONS)} bind:value={target.step} onchange={recheck} />
        </div>
      {:else if kind === 'raid'}
        <div class="two">
          <Select label="Village Raid" options={withNotSet(RAID_OPTIONS)} bind:value={target.raid} onchange={recheck} />
          <Select label="Step" options={withNotSet(STEP_OPTIONS)} bind:value={target.step} onchange={recheck} />
        </div>
      {:else if kind === 'worldBoss'}
        <Select label="Affinity" options={withNotSet(AFFINITY_OPTIONS)} bind:value={target.affinity} onchange={recheck} />
      {:else if kind === 'fortressBoss'}
        <Select label="Fortress" options={withNotSet(FORTRESS_OPTIONS)} bind:value={target.group} onchange={recheck} />
      {/if}
      <Checkbox bind:checked={useFighters} disabled={!canUseFighters} label={fightersLabel} onchange={recheck} />
      {#if pve && useFighters && preset}
        <Select label="Preset" options={presetOptions} value={preset.id} onchange={(v) => { presetPick = v; recheck(); }} hint="Use the preset you fought with, as it was then." />
      {/if}
    </div>
    <p class="note" data-testid="campaign-note">Campaign is not listed: the game fights it on your device and sends no log.</p>
    {#snippet footer()}
      <Button variant="primary" size="block" disabled={!loaded} onclick={() => check()}>Check log again</Button>
    {/snippet}
  </Panel>

  <Panel title="Replay report" level="primary" scope="tool">
    {#if error}
      <Banner variant="error">{error}</Banner>
    {:else if !report}
      <p class="note">Nothing checked yet. The report lists every rule with its status and what it compared.</p>
    {:else}
      <div class="headline">
        <h3 data-testid="replay-verdict">{report.ok ? 'No rule failed' : `${report.totalMismatches} difference${report.totalMismatches === 1 ? '' : 's'} found`}</h3>
        <p data-testid="replay-checked">Checked as {checkedAs}.</p>
        {#if skipped.length}
          <p data-testid="replay-skipped">
            {skipped.length} rule{skipped.length === 1 ? '' : 's'} skipped: nothing was compared for {skipped.length === 1 ? 'it' : 'them'}, so
            {skipped.length === 1 ? 'it is' : 'they are'} not counted as passes.
          </p>
        {/if}
      </div>
      {#if kind === 'worldBoss'}
        <Banner variant="estimate">
          The game server runs the World Boss fight and not all of its rules are known. Where a rule's note says it used the app's model, a
          failure means the app's estimate differs from this log.
        </Banner>
      {/if}
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
  .fields { display: grid; gap: var(--sp-3); }
  .two { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--sp-2); }
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
