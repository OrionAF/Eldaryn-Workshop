<script>
  /**
   * SettingsPage.svelte - G6 route (`#/settings`): Data (export, Import, the one-step undo of "Update <name>",
   * where the data lives), Preferences (per device, lib/prefs.svelte.js) and the Danger zone. ia.md §5.3, §5.4.
   */
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import ImportSection from '../import/ImportSection.svelte';
  import DangerZone from '../settings/DangerZone.svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { importFlow, undoLastUpdate } from '../../lib/importFlow.svelte.js';
  import { prefs, setPrefs } from '../../lib/prefs.svelte.js';
  import { CPU_PROFILES, workersFor } from '../../lib/tasks/cpuProfile.js';
  import { staleReason } from '../../lib/calibration.js';
  import { startCalibration, calibrating, CALIBRATE_TOOL } from '../../lib/calibrationJob.js';
  import { jobsStore, cancelJob } from '../../lib/jobs.svelte.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {} } = $props();

  const current = $derived(rosterStore.current);

  // ---- Performance ---------------------------------------------------------------------------
  const cores = globalThis.navigator?.hardwareConcurrency;
  const coreCount = Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 4;
  const PROFILE_TEXT = {
    eco: ['Eco', 'Battery and laptops on your lap.'],
    balanced: ['Balanced (default)', 'Fast without heating the device.'],
    max: ['Max', 'Every core but one; may run hot.'],
  };
  const profileOptions = CPU_PROFILES.map((v) => ({ value: v, label: PROFILE_TEXT[v][0].replace(' (default)', '') }));
  const profileLine = (v) => `${PROFILE_TEXT[v][0]}: ${workersFor(v, cores)} of ${coreCount} cores. ${PROFILE_TEXT[v][1]}`;

  const cal = $derived(prefs.calibration);
  const stale = $derived(staleReason(cal, { profile: prefs.cpuProfile }));
  const calJob = $derived([...jobsStore.list].reverse().find((j) => j.tool === CALIBRATE_TOOL && (j.status === 'running' || j.status === 'queued')));
  const busy = $derived(!!calJob || calibrating());
  const STALE_TEXT = {
    profile: 'Out of date: measured under another CPU profile.',
    version: 'Out of date: measured on an older version of the app.',
  };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const KIND_LABEL = { dummy: 'Training dummy', dungeon: 'Dungeon step', duel: 'Duel' };
</script>

<div class="settings">
  <Panel title="Data">
    <p class="note">
      Your characters are saved in this browser only (local storage). Export keeps a copy you can restore on any device.
    </p>
    <div class="row">
      <Button variant="secondary" onclick={() => rosterStore.exportDownload()}>Export all characters</Button>
      <Button
        variant="secondary"
        disabled={!current}
        reason={current ? '' : 'There is no character to export'}
        onclick={() => rosterStore.exportCharacterDownload()}
      >
        {current ? `Export ${current.name}` : 'Export this character'}
      </Button>
    </div>
    <ImportSection />
    {#if importFlow.undo}
      <div class="undo" role="status">
        <span>{importFlow.undo.name} was updated from a game profile.</span>
        <Button variant="ghost" onclick={undoLastUpdate}>Undo update</Button>
      </div>
    {/if}
    {#if !rosterStore.saveState.ok}
      <p class="warn" role="alert">Not saved: {rosterStore.saveState.error}. Export your characters to keep them.</p>
    {/if}
  </Panel>

  <Panel title="Preferences" scope="global" scopeLabel="This device">
    <div class="prefs">
      <SegmentedControl
        label="Density"
        value={prefs.density}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
        onchange={(v) => setPrefs({ density: v })}
      />
      <Checkbox switch checked={prefs.reduceMotion} label="Reduce motion" onchange={(on) => setPrefs({ reduceMotion: on })} />
      <Select
        label="Default effort for new searches"
        value={prefs.defaultEffort}
        hint="Effort sets only the precision a comparison is resolved to, never a time limit."
        options={[
          { value: 'quick', label: 'Quick' },
          { value: 'standard', label: 'Standard' },
          { value: 'thorough', label: 'Thorough' },
        ]}
        onchange={(v) => setPrefs({ defaultEffort: v })}
      />
    </div>
  </Panel>

  <Panel title="Performance" scope="global" scopeLabel="This device">
    <div class="prefs">
      <div class="field">
        <SegmentedControl
          label="CPU thermal profile"
          value={prefs.cpuProfile}
          options={profileOptions}
          onchange={(v) => setPrefs({ cpuProfile: v })}
        />
        <ul class="profiles" data-testid="profile-lines">
          {#each CPU_PROFILES as v (v)}
            <li class:on={v === prefs.cpuProfile}>{profileLine(v)}</li>
          {/each}
        </ul>
        <p class="note">A change applies to the next job; a job that is already running keeps its workers.</p>
      </div>

      <div class="field" data-testid="calibration">
        <span class="micro-label">Speed calibration</span>
        {#if cal}
          <p class="note" data-testid="calibration-last">
            Measured {when(cal.measuredAt)} on the {cal.profile} profile with {cal.workers} {cal.workers === 1 ? 'worker' : 'workers'}:
            {#each Object.entries(cal.fightsPerSec) as [kind, r], i (kind)}{i ? ', ' : ' '}{KIND_LABEL[kind]} <span class="num">{Math.round(r).toLocaleString()}</span> fights/s{/each}.
          </p>
          {#if stale}<p class="warn" role="status" data-testid="calibration-stale">{STALE_TEXT[stale]} Recalibrate for accurate estimates.</p>{/if}
        {:else}
          <p class="note">Not calibrated. Run it once to see run-time estimates on the tool pages.</p>
        {/if}
        <div class="row">
          <Button variant="secondary" disabled={busy} loading={busy} busyLabel="Calibrating…" onclick={startCalibration}>
            {cal ? 'Recalibrate' : 'Calibrate speed'}
          </Button>
          {#if calJob}<Button variant="ghost" onclick={() => cancelJob(calJob.id)}>Cancel</Button>{/if}
        </div>
        <p class="note">Runs fights for about 6 seconds with your active preset (a sample character when you have none). It never runs by itself.</p>
      </div>
    </div>
  </Panel>

  <DangerZone />

  <p class="privacy">100% local: everything runs in your browser and saves to this device only. Nothing is sent to a server.</p>
</div>

<style>
  .settings { display: grid; gap: var(--sp-4); max-width: 44rem; }
  .row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .note { margin: 0 0 var(--sp-3); font-size: var(--fs-13); color: var(--text-soft); }
  .undo { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); font-size: var(--fs-13); }
  .warn { margin: var(--sp-3) 0 0; font-size: var(--fs-13); color: var(--verdict-down); }
  .prefs { display: grid; gap: var(--sp-4); }
  .field { display: grid; gap: var(--sp-2); }
  .profiles { margin: 0; padding-left: var(--sp-4); font-size: var(--fs-13); color: var(--text-soft); display: grid; gap: var(--sp-1); }
  .profiles li.on { color: var(--text); font-weight: 600; }
  .field .note, .field .warn { margin: 0; }
  .privacy { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
</style>
