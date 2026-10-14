<script>
  /**
   * DropCheckScreen.svelte - test a candidate item against every preset at once (rebuild-plan §5 row 1).
   *
   * The drop persists on the character (`drop`, model/drop.js). features/swap.js prepareSwap() gives the
   * instant numbers (stats after the swap, closed-form auto-attack DPS); the worker task 'dropCheck' adds
   * the simulated DPS, survival and PVP deltas with intervals. Results are keyed to the inputs: any edit
   * cancels the run and starts a new one after a short pause. "Apply to set" writes the item into the set.
   *
   * "Import drops" (features/dropBatch.js) takes a whole loot bag, judges every item against every preset
   * with the same evaluation, and lists them best first. Clicking one loads it as the drop above. The
   * batch is view state: it is not persisted.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { runOptimizerTask } from '../../lib/optimizerClient.js';
  import { prepareSwap, groupBySet, buildEnemy, opponentFighter } from '../../lib/features/swap.js';
  import { dropHasStats } from '../../lib/model/drop.js';
  import { parseDropBatch, prepareBatch, rankEntries } from '../../lib/features/dropBatch.js';
  import { EQUIP_SETS } from '../../lib/model/equipment.js';
  import Chip from '../Chip.svelte';
  import SlotSilhouette from '../gear/SlotSilhouette.svelte';
  import ItemEditor from '../gear/ItemEditor.svelte';
  import VerdictCard from '../drop/VerdictCard.svelte';
  import EnemyPicker from '../drop/EnemyPicker.svelte';
  import DropImport from '../drop/DropImport.svelte';
  import BatchList from '../drop/BatchList.svelte';
  import { itemSummary } from '../drop/dropFormat.js';

  let { setStatus, onNavigate } = $props();

  const N_SIM = 32;
  const N_SURVIVAL = 200;
  const N_PVP = 64;
  const SECONDS = 60;
  const DEBOUNCE_MS = 450;

  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const drop = $derived(character?.drop ?? null);
  const realm = $derived(drop?.realm === 'oblivion' && unlocked ? 'oblivion' : 'base');
  const slot = $derived(drop?.slot ?? 'WEAPON');

  // The drop must exist, and cannot sit in a realm the character has not unlocked.
  $effect(() => {
    if (!character) return;
    if (!character.drop) rosterStore.startDrop('WEAPON', 'base');
    else if (character.drop.realm === 'oblivion' && !unlocked) rosterStore.setDropRealm('base');
  });

  // View state (not persisted): which presets, and which metrics to run.
  let scope = $state('all');
  let simOn = $state(true);
  let survivalOn = $state(false);
  let enemySpec = $state({ kind: 'campaign', chapter: 1, level: 1 });
  let pvpOn = $state(false);
  let pvpIds = $state([]);

  const scopeId = $derived(scope === 'all' || character.presets.some((p) => p.id === scope) ? scope : 'all');
  const enemyEffective = $derived(
    realm === 'oblivion'
      ? enemySpec.kind === 'oblivion' ? enemySpec : { kind: 'oblivion', floor: 10 }
      : enemySpec.kind === 'oblivion' ? { kind: 'campaign', chapter: 1, level: 1 } : enemySpec,
  );
  const enemy = $derived(survivalOn ? buildEnemy(enemyEffective) : null);
  const opponents = $derived(
    (character.opponents ?? []).map((o) => ({ id: o.id, name: o.name, fighter: opponentFighter(o) })).filter((o) => o.fighter),
  );
  const chosenOpponents = $derived(pvpOn ? opponents.filter((o) => pvpIds.includes(o.id)) : []);

  const hasStats = $derived(drop ? dropHasStats(drop.item) : false);
  const rows = $derived(
    drop && hasStats
      ? prepareSwap(character, { slot: drop.slot, item: drop.item, realm, presetIds: scopeId === 'all' ? null : [scopeId] })
      : [],
  );
  const groups = $derived(groupBySet(rows));

  /** Silhouette shows the gear the active preset wears now; it is only the slot picker. */
  const silhouetteSet = $derived(
    realm === 'oblivion' ? 'oblivion' : `set${character.presets.find((p) => p.id === character.activePresetId)?.equipmentSet ?? 1}`,
  );
  const equippedNow = $derived(
    realm === 'oblivion'
      ? [{ key: 'oblivion', label: 'Oblivion', item: character.equipment.oblivion.items[slot] ?? null }]
      : EQUIP_SETS.filter((s) => s.realm === 'base').map((s) => ({ key: s.key, label: s.label, item: character.equipment[s.key].items[slot] ?? null })),
  );

  // --- the simulated half -------------------------------------------------------------------

  const request = $derived.by(() => {
    if (!rows.length) return null;
    const wantSim = simOn;
    const wantEnemy = enemy;
    const opps = chosenOpponents;
    if (!wantSim && !wantEnemy && !opps.length) return null;
    return {
      mode: 'dropCheck',
      items: rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after })),
      sim: wantSim,
      seconds: SECONDS,
      nSim: N_SIM,
      enemy: wantEnemy ? { mobs: wantEnemy.mobs, oblivion: wantEnemy.oblivion } : null,
      survivalSeconds: SECONDS,
      nSurvival: N_SURVIVAL,
      opponents: opps,
      nPvp: N_PVP,
      seed: 1,
    };
  });
  const requestJson = $derived(request ? JSON.stringify(request) : null);

  let results = $state({});
  let status = $state('idle'); // idle | waiting | running | done | cancelled | error
  let progress = $state(null);
  let errorText = $state('');
  let cancelRun = null;

  $effect(() => {
    const json = requestJson;
    cancelRun?.();
    cancelRun = null;
    results = {};
    progress = null;
    errorText = '';
    if (!json) {
      status = 'idle';
      return;
    }
    status = 'waiting';
    let live = true;
    const timer = setTimeout(() => {
      status = 'running';
      const task = runOptimizerTask(JSON.parse(json), { onProgress: (p) => { if (live) progress = p; } });
      cancelRun = task.cancel;
      task.promise
        .then((r) => {
          if (!live) return;
          results = Object.fromEntries(r.results.map((x) => [x.presetId, x]));
          status = r.aborted ? 'cancelled' : 'done';
        })
        .catch((e) => {
          if (!live) return;
          errorText = e?.message ?? String(e);
          status = 'error';
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      live = false;
      cancelRun?.();
      cancelRun = null;
    };
  });

  const statusText = $derived(
    status === 'waiting' ? 'Waiting for edits to settle…'
      : status === 'running' ? `Simulating${progress ? ` (${progress.done}/${progress.total})` : ''}…`
      : status === 'done' ? 'Simulation complete.'
      : status === 'cancelled' ? 'Simulation cancelled.'
      : status === 'error' ? `Simulation failed: ${errorText}`
      : '',
  );

  // --- import drops (batch) ----------------------------------------------------------------

  /** @type {{entries, skipped, source, rows, offsets, results, sig, status, progress}|null} */
  let batch = $state.raw(null);
  let batchError = $state('');
  let importOpen = $state(true);
  let selectedKey = $state(null);
  let gridEl = $state(null);
  let cancelBatchRun = null;
  let batchRunId = 0;

  /** Gear and presets as the batch saw them; a change marks its verdicts stale. */
  const gearSig = $derived(JSON.stringify([character.equipment, character.presets]));
  const batchStale = $derived(!!batch && batch.sig !== gearSig);
  const ranked = $derived(batch ? rankEntries(batch.entries, batch.rows, batch.offsets, batch.results) : []);

  function runBatch(base) {
    cancelBatchRun?.();
    const id = ++batchRunId;
    const { request, rows, offsets } = prepareBatch(character, base.entries);
    batch = { ...base, rows, offsets, results: [], sig: gearSig, status: request ? 'running' : 'done', progress: null };
    if (!request) return;
    const task = runOptimizerTask(request, {
      onProgress: (p) => {
        if (id === batchRunId && batch) batch = { ...batch, progress: p };
      },
    });
    cancelBatchRun = task.cancel;
    task.promise
      .then((r) => {
        if (id === batchRunId) batch = { ...batch, results: r.results, status: r.aborted ? 'cancelled' : 'done' };
      })
      .catch(() => {
        if (id === batchRunId) batch = { ...batch, status: 'error' };
      });
  }

  function importDrops(text) {
    const parsed = parseDropBatch(text, character);
    if (parsed.error) {
      batchError = parsed.error;
      return;
    }
    batchError = '';
    selectedKey = null;
    importOpen = false;
    runBatch(parsed);
    const n = parsed.entries.length;
    setStatus?.(`Imported ${n} drop${n === 1 ? '' : 's'}${parsed.skipped.length ? `, skipped ${parsed.skipped.length}` : ''}`);
  }

  function cancelBatch() {
    cancelBatchRun?.();
  }

  function loadFromBatch(entry) {
    rosterStore.startDrop(entry.slot, entry.realm);
    rosterStore.setDropItem(entry.item);
    selectedKey = entry.key;
    setStatus?.(`Loaded ${entry.name} into the single-drop view`);
    gridEl?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  $effect(() => () => {
    batchRunId += 1;
    cancelBatchRun?.();
  });

  // --- actions ---------------------------------------------------------------------------------

  function applyTo(setKey) {
    const n = rows.filter((r) => r.setKey === setKey).length;
    const label = EQUIP_SETS.find((s) => s.key === setKey)?.label ?? setKey;
    if (rosterStore.applyDropToSet(setKey)) setStatus?.(`Applied to ${label} — ${n} preset${n === 1 ? '' : 's'} updated`);
    else setStatus?.(`Could not apply to ${label}`);
  }

  function discard() {
    rosterStore.discardDrop();
    setStatus?.('Drop discarded');
  }

  function toggleOpponent(id) {
    pvpIds = pvpIds.includes(id) ? pvpIds.filter((x) => x !== id) : [...pvpIds, id];
  }

  const anySheet = $derived(rows.some((r) => r.source === 'sheet'));
</script>

{#if drop}
  <section class="drop-check">
    <header class="head">
      <h2>Drop check</h2>
      <p class="subline">Enter the drop's stats. Every preset gives its own verdict.</p>
    </header>

    <p class="fidelity">
      The closed-form line counts auto-attacks only. Simulated lines add spells, minions and damage over
      time against a {SECONDS} s training dummy, and always show N and a 95% interval. Dungeons, arena
      duels and the Oblivion dungeon are a model of the server, not exact rules.
    </p>

    <details class="import-panel" bind:open={importOpen}>
      <summary>Import drops from a loot bag</summary>
      <p class="hint">
        Load the loot-bag response (or a full game profile) as a .json file, or paste it. Every item is
        checked against every preset, and the best verdict comes first. Items of another class are skipped.
      </p>
      <DropImport onimport={importDrops} error={batchError} busy={batch?.status === 'running'} />
    </details>

    {#if batch}
      {#if batch.entries.length}
        <BatchList
          {ranked}
          cls={character.class}
          status={batch.status}
          progress={batch.progress}
          stale={batchStale}
          skipped={batch.skipped}
          {selectedKey}
          onselect={loadFromBatch}
          oncancel={cancelBatch}
          onrerun={() => runBatch(batch)}
        />
      {:else}
        <div class="batch-empty" role="status">
          <p class="hint">No usable items in that loot bag.</p>
          {#each batch.skipped as sk}<p class="hint">{sk.name}: {sk.reason}</p>{/each}
        </div>
      {/if}
    {/if}

    <div class="grid" bind:this={gridEl}>
      <div class="input-col">
        {#if unlocked}
          <div class="realm-toggle" role="group" aria-label="Realm">
            <Chip label="Base realm" selected={realm === 'base'} size="small" onClick={() => rosterStore.setDropRealm('base')} />
            <Chip label="Oblivion" selected={realm === 'oblivion'} size="small" onClick={() => rosterStore.setDropRealm('oblivion')} />
          </div>
        {/if}

        <SlotSilhouette
          items={character.equipment[silhouetteSet].items}
          {realm}
          cls={character.class}
          selectedSlot={slot}
          onSelect={(s) => rosterStore.setDropSlot(s)}
          label="Drop"
        />

        <ul class="equipped" aria-label="Currently equipped in this slot">
          {#each equippedNow as e (e.key)}
            <li><span class="micro-label">{e.label}</span> <span class="summary">{itemSummary(e.item)}</span></li>
          {/each}
        </ul>

        <ItemEditor value={drop.item} {realm} {slot} class={character.class} onchange={(item) => rosterStore.setDropItem(item)} />
        <button type="button" class="btn-ghost discard" onclick={discard}>Discard this drop</button>
      </div>

      <div class="result-col">
        <div class="options" role="group" aria-label="What to measure">
          <label class="field">
            <span class="micro-label">Presets</span>
            <select aria-label="Presets" value={scopeId} onchange={(e) => (scope = e.currentTarget.value)}>
              <option value="all">All presets</option>
              {#each character.presets as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </label>

          <label class="check">
            <input type="checkbox" bind:checked={simOn} />
            <span>Simulated DPS (N={N_SIM}, {SECONDS} s)</span>
          </label>

          <div class="option-block">
            <label class="check">
              <input type="checkbox" bind:checked={survivalOn} />
              <span>Survival vs an enemy (N={N_SURVIVAL})</span>
            </label>
            {#if survivalOn}
              <EnemyPicker value={enemyEffective} {realm} onchange={(s) => (enemySpec = s)} />
            {/if}
          </div>

          <div class="option-block">
            <label class="check">
              <input type="checkbox" bind:checked={pvpOn} />
              <span>PVP win rate vs saved opponents (N={N_PVP})</span>
            </label>
            {#if pvpOn}
              {#if opponents.length}
                <div class="opponents">
                  {#each opponents as o (o.id)}
                    <label class="check">
                      <input type="checkbox" checked={pvpIds.includes(o.id)} onchange={() => toggleOpponent(o.id)} />
                      <span>{o.name}</span>
                    </label>
                  {/each}
                </div>
              {:else}
                <p class="hint">No saved opponents with a stat sheet yet. Add one on the Duel screen.</p>
              {/if}
            {/if}
          </div>
        </div>

        {#if !hasStats}
          <p class="hint empty">Enter at least one stat for the drop to see verdicts.</p>
        {:else}
          {#if statusText}
            <p class="status" class:error={status === 'error'} role="status">{statusText}</p>
          {/if}
          {#if !anySheet}
            <p class="hint">
              These presets have no in-game stat sheet, so numbers come from the calculated totals.
              {#if onNavigate}
                <button type="button" class="link" onclick={() => onNavigate('presets')}>Enter a sheet on Presets</button>
                for exact anchoring.
              {/if}
            </p>
          {/if}
          <div class="verdict-cards">
            {#each groups as g (g.setKey)}
              <VerdictCard
                setKey={g.setKey}
                setLabel={EQUIP_SETS.find((s) => s.key === g.setKey)?.label ?? g.setKey}
                rows={g.rows}
                {results}
                {status}
                onApply={applyTo}
              />
            {/each}
          </div>
          <p class="footnote">Applying writes to the set, so every preset that wears it changes.</p>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .drop-check {
    padding-top: var(--space-4);
  }
  .head h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-gold-light);
  }
  .subline {
    color: var(--color-muted);
    font-size: 11.5px;
    margin: 6px 0 var(--space-3);
  }
  .fidelity {
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--color-warning);
    background: var(--color-warning-soft);
    border: 1px solid var(--color-warning);
    border-radius: 6px;
    padding: 8px 10px;
    margin: 0 0 var(--space-4);
  }
  .import-panel,
  .batch-empty {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 10px 14px;
    margin-bottom: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .import-panel summary {
    cursor: pointer;
    font-size: 12.5px;
    color: var(--color-gold-light);
  }
  .import-panel[open] summary {
    margin-bottom: var(--space-2);
  }
  :global(.drop-check > .batch) {
    margin-bottom: var(--space-4);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    gap: 18px;
  }
  @media (max-width: 900px) {
    .grid {
      display: flex;
      flex-direction: column;
    }
  }
  .input-col,
  .result-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .realm-toggle {
    display: flex;
    gap: 6px;
  }
  .equipped {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
  }
  .equipped .summary {
    color: var(--color-muted);
  }
  .discard {
    align-self: center;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 12px 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  select {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    max-width: 100%;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
  }
  .option-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .opponents {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 22px;
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--color-muted);
  }
  .hint.empty {
    padding: var(--space-4) 0;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-gold-light);
    text-decoration: underline dotted;
    cursor: pointer;
    font-size: inherit;
  }
  .status {
    margin: 0;
    font-size: 11.5px;
    color: var(--color-muted);
  }
  .status.error {
    color: var(--color-downgrade);
  }
  .verdict-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .footnote {
    margin: 0;
    text-align: center;
    font-size: 10.5px;
    color: var(--color-dim);
  }
  @media (max-width: 700px) {
    select {
      min-height: 44px;
      width: 100%;
    }
  }
</style>
