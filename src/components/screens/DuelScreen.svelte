<script>
  /**
   * DuelScreen.svelte - PVP duel (rebuild-plan §5 row 3): one of my presets against a saved opponent
   * (or a clone of my own preset as another spec), N=400 duels in the worker with a Wilson interval,
   * plus one traced duel on a timeline. "Swap sides" puts me in the defender's seat: the engine gives
   * ties to the defender, so the seat matters. The x8 PVP HP buff is applied inside the engine.
   */
  import { onDestroy } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { runOptimizerTask } from '../../lib/optimizerClient.js';
  import {
    presetDuelFighter,
    opponentFighter,
    missingStats,
    arrange,
    fromMySide,
    traceSummary,
  } from '../../lib/features/duel.js';
  import Chip from '../Chip.svelte';
  import DuelTimeline from '../DuelTimeline.svelte';
  import OpponentPicker from '../duel/OpponentPicker.svelte';
  import OpponentEditor from '../duel/OpponentEditor.svelte';
  import DuelResult from '../duel/DuelResult.svelte';
  import ReplayCheck from '../duel/ReplayCheck.svelte';

  let { setStatus = () => {}, onNavigate = () => {} } = $props(); // eslint-disable-line no-unused-vars

  const N = 400;
  const SEED = 1;

  const character = $derived(rosterStore.current);

  let presetPick = $state(null);
  let opponentPick = $state(null);
  let mySide = $state('attacker');
  let running = $state(false);
  let progress = $state(null);
  let last = $state(null); // the finished run, with the sides and names it was made under
  let job = null;

  const preset = $derived(character.presets.find((p) => p.id === presetPick) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const opponent = $derived(character.opponents.find((o) => o.id === opponentPick) ?? character.opponents[0] ?? null);

  const mine = $derived(presetDuelFighter(character, preset.id));
  const theirs = $derived(opponent ? opponentFighter(opponent) : null);
  const problems = $derived([
    ...missingStats(mine).map((m) => `Your preset has no ${m}.`),
    ...(theirs ? missingStats(theirs).map((m) => `${opponent.name} has no ${m}: enter it in the sheet below.`) : ['Pick or add an opponent.']),
  ]);
  const arranged = $derived(theirs ? arrange(mine, theirs, mySide) : null);

  function start(opts) {
    job?.cancel();
    const snapshot = { mySide, myName: preset.name, theirName: opponent.name };
    const { attacker, defender } = arrange(mine, theirs, snapshot.mySide);
    running = true;
    progress = null;
    job = runOptimizerTask({ mode: 'duel', attacker, defender, seed: SEED, trace: true, ...opts }, { onProgress: (p) => (progress = p) });
    const own = job;
    return own.promise.then(
      (r) => {
        if (job !== own) return null;
        running = false;
        job = null;
        return { r, snapshot };
      },
      (e) => {
        if (job === own) {
          running = false;
          job = null;
          setStatus(`Duel failed: ${e.message}`);
        }
        return null;
      },
    );
  }

  async function run() {
    if (problems.length || !opponent) return;
    const out = await start({ n: N });
    if (!out) return;
    const { r, snapshot } = out;
    last = { ...snapshot, summary: r, trace: r.trace, traceResult: r.traceResult };
    setStatus(r.aborted ? 'Duel run cancelled; showing the duels finished so far.' : '');
  }

  async function rerollTrace() {
    if (problems.length || !opponent || !last) return;
    const out = await start({ n: 0, traceSeed: Math.floor(Math.random() * 1e9) });
    if (!out || out.snapshot.mySide !== last.mySide) return;
    last = { ...last, trace: out.r.trace, traceResult: out.r.traceResult };
  }

  function swapSides() {
    mySide = mySide === 'attacker' ? 'defender' : 'attacker';
    if (last) run();
  }

  const cancel = () => job?.cancel();
  onDestroy(cancel);

  const mySeat = $derived(last?.mySide ?? mySide);
  const result = $derived(last ? fromMySide(last.summary, last.mySide) : null);
  const traced = $derived(last?.trace ? traceSummary(last.trace) : null);
  const traceWon = $derived(last?.traceResult ? last.traceResult.attackerWon === (last.mySide === 'attacker') : null);
  const names = $derived(
    last?.mySide === 'defender'
      ? { attacker: last.theirName, defender: last.myName }
      : { attacker: last?.myName ?? preset.name, defender: last?.theirName ?? opponent?.name ?? 'Opponent' },
  );
</script>

<div class="header-row">
  <h2>Duel</h2>
  <p class="hint">PVP win rate over {N} duels · ties go to the defender · the engine applies the x8 PVP HP buff</p>
</div>

<section class="panel" data-testid="duel-setup">
  <div class="group">
    <span class="micro-label">My preset</span>
    <div class="chip-list">
      {#each character.presets as p (p.id)}
        <Chip label={p.name} selected={preset.id === p.id} onClick={() => (presetPick = p.id)} />
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="micro-label">Opponent</span>
    <OpponentPicker {character} selectedId={opponent?.id ?? null} onSelect={(id) => (opponentPick = id)} {setStatus} />
  </div>

  <div class="run-row">
    <span class="seat mono" data-testid="seat">You are the {mySide}</span>
    <button type="button" class="btn-ghost" disabled={!opponent} onclick={swapSides}>Swap sides</button>
    {#if running}
      <button type="button" class="btn-danger" onclick={cancel}>Cancel</button>
      <span class="mono progress" data-testid="duel-progress">{progress ? `${progress.done}/${progress.n}` : 'starting'}</span>
    {:else}
      <button type="button" class="btn-gold" disabled={problems.length > 0} onclick={run}>Run {N} duels</button>
    {/if}
  </div>
  {#each problems as msg (msg)}<p class="problem" role="status">{msg}</p>{/each}
</section>

{#if last}
  <section class="panel" data-testid="duel-output">
    <DuelResult {result} traceStats={traced} {traceWon} myName={last.myName} theirName={last.theirName} mySide={mySeat} />
    {#if last.trace}
      <div class="timeline">
        <div class="timeline-head">
          <span class="micro-label">Traced duel</span>
          <button type="button" class="btn-ghost" disabled={running} onclick={rerollTrace}>Re-roll trace</button>
        </div>
        <DuelTimeline
          events={last.trace}
          attackerName={names.attacker}
          defenderName={names.defender}
          durationMs={last.traceResult?.totalDuration ?? 0}
        />
      </div>
    {/if}
  </section>
{/if}

{#if opponent}
  {#key opponent.id}
    <OpponentEditor {opponent} onRemoved={() => (opponentPick = null)} />
  {/key}
{/if}

<section class="panel">
  <ReplayCheck attacker={arranged && !problems.length ? arranged.attacker : null} defender={arranged && !problems.length ? arranged.defender : null} />
</section>

<style>
  .header-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
  h2 { font-family: var(--font-heading); margin: 0; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; flex: 1; }
  .panel {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 16px 18px;
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .run-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .seat { font-size: 12px; color: var(--color-soft); }
  .progress { font-size: 12px; color: var(--color-muted); }
  .problem { color: var(--color-warning); font-size: 12px; margin: 0; }
  .timeline { display: flex; flex-direction: column; gap: 6px; }
  .timeline-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
</style>
