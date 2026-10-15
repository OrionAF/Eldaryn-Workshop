<script module>
  // Per character: the last loot-bag import (entries, prepared rows, job id), so the batch survives
  // navigating away while its job keeps running. View state, never persisted.
  const keptBags = new Map();
  // Per single-drop job id: the rows it was started with, so a finished result is always shown against the
  // rows it was computed for, even after the drop is edited.
  const keptRows = new Map();
</script>

<script>
  /**
   * ToolsDropPage.svelte - T1 Drop Check (ia.md, design-system §4.28, plan U9): Single drop and Loot bag.
   *
   * Both tabs run as jobs (jobs.svelte.js), so a run survives navigation and shows in the tray; the page
   * reads its result from the job store and keeps no second copy. A set's verdict is the Holm-judged
   * verdict of every preset wearing it (features/swap.js); the card says what it covered and what it did
   * not judge. One table per metric with its own labelled axis (the batch measures DPS only). The
   * closed-form figure is an ESTIMATE under the simulated one, never coloured. Apply names its scope
   * first. Run more raises the precision step (features/dropView.js runMoreRequest).
   */
  import { untrack } from 'svelte';
  import { prefs } from '../../lib/prefs.svelte.js';
  import { importFlow, takeHandoff } from '../../lib/importFlow.svelte.js';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { formatHash } from '../../lib/routes.js';
  import { jobsStore, startJob, cancelJob, jobSignature, isStale } from '../../lib/jobs.svelte.js';
  import { prepareSwap, buildEnemy, dropOpponents } from '../../lib/features/swap.js';
  import { dropHasStats } from '../../lib/model/drop.js';
  import { parseDropBatch, prepareBatch, rankEntries, entryResults } from '../../lib/features/dropBatch.js';
  import { setCards, setLabelOf, chipFor, pctInterval, tally, tallyChips, runMoreRequest } from '../../lib/features/dropView.js';
  import { EQUIP_SETS } from '../../lib/model/equipment.js';
  import { forestDomain } from '../../lib/ui/forestScale.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import SlotSilhouette from '../gear/SlotSilhouette.svelte';
  import ItemEditor from '../gear/ItemEditor.svelte';
  import { slotLabel } from '../gear/gearFormat.js';
  import EnemyPicker from '../drop/EnemyPicker.svelte';
  import DropImport from '../drop/DropImport.svelte';
  import DropSetCard from '../drop/DropSetCard.svelte';
  import DropMetricTables from '../drop/DropMetricTables.svelte';
  import { itemSummary, signedPct, dropStatRows } from '../drop/dropFormat.js';
  import StatTable from '../ui/StatTable.svelte';
  import Panel from '../ui/Panel.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import RunProgress from '../ui/RunProgress.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';
  import ForestAxis from '../ui/ForestAxis.svelte';
  import CIForest from '../ui/CIForest.svelte';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';
  import EmptyState from '../ui/EmptyState.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const N_SIM = 32;
  const N_SURVIVAL = 200;
  const N_PVP = 64;
  const SECONDS = 60;
  const EFFORT = [
    { value: 'quick', label: 'Quick', sub: '1%' },
    { value: 'standard', label: 'Standard', sub: '0.5%' },
    { value: 'thorough', label: 'Thorough', sub: '0.25%' },
  ];
  const TABS = $derived([
    { id: 'single', label: 'Single drop' },
    { id: 'bag', label: 'Loot bag', count: bag ? bag.entries.length : undefined },
  ]);

  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const drop = $derived(character?.drop ?? null);
  const realm = $derived(drop?.realm === 'oblivion' && unlocked ? 'oblivion' : 'base');
  const slot = $derived(drop?.slot ?? 'WEAPON');

  let view = $state(untrack(() => (tab === 'bag' ? 'bag' : 'single')));
  function pickTab(id) {
    view = id === 'bag' ? 'bag' : 'single';
    go(formatHash('tools/drop', id === 'bag' ? 'bag' : null), { replace: true });
  }

  // The drop must exist, and cannot sit in a realm the character has not unlocked.
  $effect(() => {
    if (!character) return;
    if (!character.drop) rosterStore.startDrop('WEAPON', 'base');
    else if (character.drop.realm === 'oblivion' && !unlocked) rosterStore.setDropRealm('base');
  });

  // --- shared: jobs ------------------------------------------------------------------------------

  /** Staleness of a job against the saved character: gear, presets and drop (the inputs of any verdict). */
  function storeSignature(extra = '') {
    const c = rosterStore.current;
    return jobSignature({ characterKey: c?.id ?? '', presetId: '', inputs: JSON.stringify([c?.equipment, c?.presets, c?.drop ?? null, extra]) });
  }
  const ownedBy = (j, tool) => j.tool === tool && (() => { try { return JSON.parse(j.signature)[0] === character?.id; } catch { return false; } })();
  const stateOf = (job) => (job?.status === 'queued' ? 'queued' : job?.status === 'running' ? 'running' : 'idle');

  function segmentsOf(job) {
    if (!job) return [];
    const p = job.progress;
    const state = { queued: 'queued', running: 'active', finished: 'done', cancelled: 'cancelled', failed: 'cancelled' }[job.status] ?? 'queued';
    return [{ id: 'metrics', label: 'Comparisons', state, done: p?.done, total: p?.total, text: job.status === 'failed' ? 'failed' : undefined }];
  }

  // View state (not persisted): which presets, and which metrics to run.
  let scope = $state('all');
  let simOn = $state(true);
  let survivalOn = $state(false);
  let enemySpec = $state({ kind: 'campaign', chapter: 1, level: 1 });
  let pvpOn = $state(false);
  let pvpIds = $state(null); // null = every saved opponent (the toggle never leaves PVP measuring nothing)
  let precision = $state(untrack(() => prefs.defaultEffort));
  let maxNOverride = $state(null);

  const scopeId = $derived(scope === 'all' || character.presets.some((p) => p.id === scope) ? scope : 'all');
  const enemyEffective = $derived(
    realm === 'oblivion'
      ? enemySpec.kind === 'oblivion' ? enemySpec : { kind: 'oblivion', floor: 10 }
      : enemySpec.kind === 'oblivion' ? { kind: 'campaign', chapter: 1, level: 1 } : enemySpec,
  );
  const enemy = $derived(survivalOn ? buildEnemy(enemyEffective) : null);
  const opponentSet = $derived(dropOpponents(character));
  const opponents = $derived(opponentSet.opponents);
  const chosenOpponents = $derived(pvpOn ? opponents.filter((o) => pvpIds === null || pvpIds.includes(o.id)) : []);
  const pickOpponent = (id, on) => {
    const cur = pvpIds ?? opponents.map((o) => o.id);
    pvpIds = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
  };

  // --- single drop -------------------------------------------------------------------------------

  const hasStats = $derived(drop ? dropHasStats(drop.item) : false);
  const rows = $derived(
    drop && hasStats
      ? prepareSwap(character, { slot: drop.slot, item: drop.item, realm, presetIds: scopeId === 'all' ? null : [scopeId] })
      : [],
  );
  const request = $derived.by(() => {
    if (!rows.length) return null;
    if (!simOn && !enemy && !chosenOpponents.length) return null;
    return {
      mode: 'dropCheck',
      items: rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after })),
      sim: simOn,
      seconds: SECONDS,
      nSim: N_SIM,
      enemy: enemy ? { mobs: enemy.mobs, oblivion: enemy.oblivion } : null,
      survivalSeconds: SECONDS,
      nSurvival: N_SURVIVAL,
      opponents: chosenOpponents,
      nPvp: N_PVP,
      seed: 1,
      precision,
      ...(maxNOverride ? { maxN: maxNOverride } : {}),
    };
  });
  const requestJson = $derived(request ? JSON.stringify(request) : null);

  const singleJob = $derived(jobsStore.list.findLast((j) => ownedBy(j, 'drop')) ?? null);
  const ran = $derived(singleJob ? keptRows.get(singleJob.id) ?? null : null);
  const shownRows = $derived(ran ? ran.rows : rows);
  const singleResults = $derived(Object.fromEntries((singleJob?.result?.results ?? []).map((r) => [r.presetId, r])));
  const singleCards = $derived(setCards(shownRows, singleResults));
  const singleStale = $derived(!!singleJob && (isStale(singleJob) || (requestJson !== null && JSON.stringify(singleJob.request) !== requestJson)));
  const singleBusy = $derived(singleJob?.status === 'queued' || singleJob?.status === 'running');

  function checkDrop(req = request) {
    if (!req) return;
    const snapRows = rows;
    const id = startJob({
      tool: 'drop',
      title: 'Drop Check · Single drop',
      context: `${slotLabel(character.class, slot)}${realm === 'oblivion' ? ' · Oblivion' : ''} · ${snapRows.length} preset${snapRows.length === 1 ? '' : 's'} · seed ${req.seed}`,
      request: req,
      signature: storeSignature(),
      currentSignature: () => storeSignature(),
      openRoute: formatHash('tools/drop'),
      summarize: (res) => {
        const byPreset = Object.fromEntries((res?.results ?? []).map((r) => [r.presetId, r]));
        return tallyChips(tally(setCards(snapRows, byPreset), []));
      },
    });
    keptRows.set(id, { rows: snapRows });
    setStatus?.('Drop check started. Progress is in Jobs.');
  }

  function runMoreSingle() {
    const next = runMoreRequest(JSON.parse(requestJson));
    if (!next) return;
    precision = next.precision;
    maxNOverride = next.maxN ?? null;
    // The derived request now equals `next`; start it from there.
    queueMicrotask(() => checkDrop(request));
  }

  function applyTo(setKey) {
    const sets = singleCards.find((c) => c.setKey === setKey);
    const label = setLabelOf(setKey);
    if (rosterStore.applyDropToSet(setKey)) setStatus?.(`Applied to ${label}: ${sets?.presetNames.length ?? 0} preset(s) updated`);
    else setStatus?.(`Could not apply to ${label}`);
  }

  const silhouetteSet = $derived(
    realm === 'oblivion' ? 'oblivion' : `set${character.presets.find((p) => p.id === character.activePresetId)?.equipmentSet ?? 1}`,
  );
  const equippedNow = $derived(
    realm === 'oblivion'
      ? [{ key: 'oblivion', label: 'Oblivion', item: character.equipment.oblivion.items[slot] ?? null }]
      : EQUIP_SETS.filter((s) => s.realm === 'base').map((s) => ({ key: s.key, label: s.label, item: character.equipment[s.key].items[slot] ?? null })),
  );
  const anySheet = $derived(rows.some((r) => r.source === 'sheet'));
  const dropRows = $derived(drop ? dropStatRows(drop.item) : []);

  // --- loot bag ----------------------------------------------------------------------------------

  let bump = $state(0);
  let batchError = $state('');
  let expandedKey = $state(null);
  const bag = $derived((bump, kept()));
  const bagJob = $derived(bag ? jobsStore.list.find((j) => j.id === bag.jobId) ?? null : null);
  const kept = () => keptBags.get(character?.id) ?? null;

  const bagResults = $derived(bagJob?.result?.results ?? []);
  const ranked = $derived(bag ? rankEntries(bag.entries, bag.rows, bag.offsets, bagResults) : []);
  const counts = $derived(tally(ranked.map((r) => r.best), bag?.skipped ?? []));
  const bagStale = $derived(!!bagJob && isStale(bagJob));
  const bagBusy = $derived(bagJob?.status === 'queued' || bagJob?.status === 'running');
  const bagRowState = $derived(stateOf(bagJob));

  /** One entry's table figures on the DPS axis: the simulated interval, or the hollow closed-form estimate. */
  function figureOf(best) {
    if (!best) return null;
    if (best.basis === 'sim' && best.sim) {
      const p = pctInterval(best.sim);
      if (p) return { kind: 'sim', est: p.est, lo: p.lo, hi: p.hi, n: p.n };
    }
    return { kind: 'est', est: best.row.closed.pct, lo: null, hi: null, n: null };
  }
  const figures = $derived(ranked.map((r) => figureOf(r.best)));
  const dpsDomain = $derived(forestDomain(figures.map((f) => (f ? { est: f.est, lo: f.lo, hi: f.hi } : null))));

  function bagTone(chip, f) {
    if (f?.kind !== 'sim') return 'est';
    return chip.verdict === 'better' ? 'up' : chip.verdict === 'worse' ? 'down' : 'side';
  }

  function runBatch(base, { precision: withPrecision = precision, maxN = null } = {}) {
    const prep = prepareBatch(character, base.entries);
    const key = character.id;
    let jobId = null;
    if (prep.request) {
      const req = { ...prep.request, precision: withPrecision, ...(maxN ? { maxN } : {}) };
      const entryKeys = base.entries.map((e) => e.key).join(',');
      jobId = startJob({
        tool: 'drop-bag',
        title: 'Drop Check · Loot bag',
        context: `${base.entries.length} drop${base.entries.length === 1 ? '' : 's'} · seed ${req.seed}`,
        request: req,
        signature: storeSignature(entryKeys),
        currentSignature: () => storeSignature(entryKeys),
        openRoute: formatHash('tools/drop', 'bag'),
        summarize: (res) =>
          tallyChips(tally(rankEntries(base.entries, prep.rows, prep.offsets, res?.results ?? []).map((r) => r.best), base.skipped)),
      });
    }
    keptBags.set(key, { entries: base.entries, skipped: base.skipped, source: base.source, rows: prep.rows, offsets: prep.offsets, jobId, precision: withPrecision, maxN });
    bump += 1;
  }

  function importDrops(text) {
    const parsed = parseDropBatch(text, character);
    if (parsed.error) {
      batchError = parsed.error;
      return;
    }
    batchError = '';
    expandedKey = null;
    runBatch(parsed);
    const n = parsed.entries.length;
    setStatus?.(`Imported ${n} drop${n === 1 ? '' : 's'}${parsed.skipped.length ? `, skipped ${parsed.skipped.length}` : ''}`);
  }

  const bagNext = () => (bag ? runMoreRequest({ precision: bag.precision, ...(bag.maxN ? { maxN: bag.maxN } : {}) }) : null);

  function runMoreBag() {
    if (!bag) return;
    const next = bagNext();
    if (!next) return;
    precision = next.precision;
    runBatch(bag, { precision: next.precision, maxN: next.maxN ?? null });
  }

  function loadFromBag(entry) {
    rosterStore.startDrop(entry.slot, entry.realm);
    rosterStore.setDropItem(entry.item);
    pickTab('single');
    setStatus?.(`Loaded ${entry.name} into Single drop`);
  }

  /** Apply a loot-bag item without leaving the bag: it becomes the saved drop, then goes into the set. */
  function applyEntry(entry, setKey) {
    rosterStore.startDrop(entry.slot, entry.realm);
    rosterStore.setDropItem(entry.item);
    applyTo(setKey);
  }

  const cardsOf = (i) => setCards(bag.rows[i], entryResults(bag.offsets, bag.rows, i, bagResults));
  const chipOf = (best) => (best ? chipFor(best.verdict, best.basis, bagRowState) : { verdict: 'queued', label: 'Queued' });

  $effect(() => {
    view = tab === 'bag' ? 'bag' : 'single';
  });

  // A loot bag handed over by the import dialog: on mount and whenever another one arrives, take it,
  // show the Loot bag tab and run it.
  $effect(() => {
    importFlow.handoffSeq;
    untrack(() => {
      if (!character) return;
      const text = takeHandoff('lootBag');
      if (text == null) return;
      pickTab('bag');
      importDrops(text);
    });
  });
</script>

{#if drop}
  <div class="page">
    <div class="tabs-row">
      <Tabs items={TABS} bind:value={view} label="Drop Check" idPrefix="dc" onchange={pickTab} />
    </div>

    {#if view === 'single'}
      <div id="dc-panel-single" role="tabpanel" class="grid">
        <div class="col setup">
          <Panel title="Drop" scope="tool">
            {#if unlocked}
              <SegmentedControl
                label="Realm"
                value={realm}
                options={[{ value: 'base', label: 'Base realm' }, { value: 'oblivion', label: 'Oblivion' }]}
                onchange={(v) => rosterStore.setDropRealm(v)}
              />
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
                <li><span class="cap-label">{e.label}</span> <span class="soft">{itemSummary(e.item)}</span></li>
              {/each}
            </ul>
            <ItemEditor value={drop.item} {realm} {...{ slot }} class={character.class} onchange={(item) => rosterStore.setDropItem(item)} />
            {#if dropRows.length}
              <StatTable rows={dropRows} caption="Stats of this drop" />
            {/if}
            <Button variant="ghost" size="small" onclick={() => { rosterStore.discardDrop(); setStatus?.('Drop discarded'); }}>Discard this drop</Button>
          </Panel>

          <Panel title="Measure" scope="tool">
            <Select
              label="Presets"
              value={scopeId}
              options={[{ value: 'all', label: 'All presets' }, ...character.presets.map((p) => ({ value: p.id, label: p.name }))]}
              onchange={(v) => (scope = v)}
            />
            <Checkbox bind:checked={simOn} label={`Simulated DPS (${SECONDS} s dummy)`} />
            <div class="block">
              <Checkbox bind:checked={survivalOn} label="Survival vs an enemy" />
              {#if survivalOn}
                <EnemyPicker value={enemyEffective} {realm} playerLevel={character.level} onchange={(s) => (enemySpec = s)} />
              {/if}
            </div>
            <div class="block">
              <Checkbox bind:checked={pvpOn} label="PVP win rate vs saved opponents" />
              {#if pvpOn}
                {#if opponents.length}
                  {#each opponents as o (o.id)}
                    <Checkbox
                      checked={pvpIds === null || pvpIds.includes(o.id)}
                      label={o.name}
                      onchange={(on) => pickOpponent(o.id, on)}
                    />
                  {/each}
                {:else}
                  <p class="hint">No saved opponents with a complete stat sheet yet. Add one on Opponents.</p>
                {/if}
                {#each opponentSet.skipped as k (k.id)}
                  <p class="hint">{k.name} is skipped: its sheet lacks {k.missing.join(', ')}.</p>
                {/each}
              {/if}
            </div>
            <div class="block">
              <span class="cap-label">Effort</span>
              <SegmentedControl label="Effort" bind:value={precision} options={EFFORT} onchange={() => (maxNOverride = null)} />
              <p class="hint">Effort sets the precision only. Each comparison runs from a small first look until it is resolved, or stops and says "too close to call".</p>
            </div>
            {#snippet footer()}
              <Button variant="primary" disabled={!request || singleBusy} reason={!hasStats ? 'Enter at least one stat for the drop' : !request ? 'Choose a metric to measure' : ''} loading={singleBusy} busyLabel="Checking…" onclick={() => checkDrop()}>
                Check drop
              </Button>
              {#if singleBusy}<Button variant="ghost" onclick={() => cancelJob(singleJob.id)}>Cancel</Button>{/if}
            {/snippet}
          </Panel>
        </div>

        <div class="col results">
          <Panel title="Verdict by gear set" level="primary" scope="tool" stale={singleStale}>
            {#if !hasStats}
              <EmptyState title="No stats yet" text="Enter at least one stat for the drop to see verdicts." />
            {:else}
              {#if singleJob}
                <RunProgress segments={segmentsOf(singleJob)} />
              {/if}
              {#if singleJob?.status === 'failed'}
                <Banner variant="error" lead="The check failed.">{singleJob.error}</Banner>
              {:else if singleJob?.status === 'cancelled'}
                <Banner variant="info" lead="Cancelled.">Finished presets are shown; the rest show the estimate only.</Banner>
              {/if}
              {#if singleStale}
                <Banner variant="warn" lead="Stale.">The drop, your gear or the settings changed since this run. Check the drop again for current verdicts.</Banner>
              {/if}
              {#if !singleJob}
                <Banner variant="estimate" lead="Not simulated yet.">The figures below are instant auto-attack estimates. Press Check drop for a verdict.</Banner>
              {/if}
              {#if !anySheet}
                <p class="hint">
                  These presets have no in-game stat sheet, so numbers come from the calculated totals.
                  <button type="button" class="link" onclick={() => onNavigate('builds/sheet')}>Enter a sheet</button> for exact anchoring.
                </p>
              {/if}
              {#if singleJob?.status === 'finished' && !singleStale}
                <DropMetricTables cards={singleCards} />
              {/if}
              <div class="cards">
                {#each singleCards as c (c.setKey)}
                  <DropSetCard
                    card={c}
                    phase={stateOf(singleJob)}
                    onapply={applyTo}
                    onrunmore={singleJob?.status === 'finished' && !singleStale && runMoreRequest(request) ? runMoreSingle : null}
                  />
                {/each}
              </div>
            {/if}
          </Panel>
        </div>
      </div>
    {:else}
      <div id="dc-panel-bag" role="tabpanel" class="stack">
        <Panel title="Loot bag" scope="tool">
          <p class="hint">
            Load the loot-bag response (or a full game profile) as a .json file, or paste it. Every item is tried in every gear set. Items of another class are skipped.
          </p>
          <DropImport onimport={importDrops} error={batchError} busy={bagBusy} />
          <div class="row">
            <span class="cap-label">Effort</span>
            <SegmentedControl label="Effort" bind:value={precision} options={EFFORT} />
          </div>
        </Panel>

        {#if !bag}
          <Panel title="Drops, best first" level="primary" scope="tool">
            <EmptyState title="No loot bag yet" text="Import a loot bag or a game profile to check every drop at once." />
          </Panel>
        {:else if !bag.entries.length}
          <Panel title="Drops, best first" level="primary" scope="tool">
            <Banner variant="warn" lead="No usable items in that loot bag.">
              {#each bag.skipped as sk (sk.name + sk.reason)}<div>{sk.name}: {sk.reason}</div>{/each}
            </Banner>
          </Panel>
        {:else}
          <Panel title="Drops, best first" level="primary" scope="tool" stale={bagStale}>
            {#snippet meta()}
              {#if bagBusy}
                <Button variant="ghost" size="small" onclick={() => cancelJob(bagJob.id)}>Cancel</Button>
              {:else}
                <Button variant="secondary" size="small" onclick={() => runBatch(bag)}>Check again</Button>
              {/if}
            {/snippet}
            {#if bagJob}<RunProgress segments={segmentsOf(bagJob)} />{/if}
            <div class="summary" aria-label="Summary">
              <span class="v up"><span aria-hidden="true">▲</span> <span class="num">{counts.upgrade}</span> upgrade</span>
              <span class="v"><span aria-hidden="true">◆</span> <span class="num">{counts.sidegrade}</span> sidegrade</span>
              <span class="v down"><span aria-hidden="true">▼</span> <span class="num">{counts.downgrade}</span> downgrade</span>
              {#if counts.mixed}<span class="v side"><span class="num">{counts.mixed}</span> mixed</span>{/if}
              {#if counts.inconclusive}<span class="v side" data-count="inconclusive"><span class="num">{counts.inconclusive}</span> too close to call</span>{/if}
              <span class="v"><span class="num">{counts.pending}</span> pending</span>
              <span class="v"><span aria-hidden="true">!</span> <span class="num">{counts.skipped}</span> skipped</span>
            </div>
            {#if bagJob?.status === 'failed'}
              <Banner variant="error" lead="The check failed.">{bagJob.error}</Banner>
            {:else if bagJob?.status === 'cancelled'}
              <Banner variant="info" lead="Cancelled.">Unfinished drops show the estimate only.</Banner>
            {/if}
            {#if bagStale}
              <Banner variant="warn" lead="Stale.">Your gear or presets changed since this check. Check again for current verdicts.</Banner>
            {/if}
            <p class="hint">Simulated DPS only: defence is not measured. A set's verdict covers every preset that wears it.</p>

            <div class="tbl" role="table" aria-label="Drops: change in DPS, 95% intervals">
              <div class="trow thead" role="row">
                <span role="columnheader" class="cap-label">Drop</span>
                <div role="columnheader"><ForestAxis domain={dpsDomain} title="Δ DPS vs current (%)" format={(x) => `${x}`} /></div>
                <span role="columnheader" class="cap-label right">Δ · 95% CI</span>
                <span role="columnheader" class="cap-label">Verdict</span>
              </div>
              {#each ranked as r, i (r.entry.key)}
                {@const e = r.entry}
                {@const f = figures[i]}
                {@const chip = chipOf(r.best)}
                {@const open = expandedKey === e.key}
                <div class="trow rank" role="row" class:open>
                  <div role="cell" class="item">
                    <button type="button" class="toggle" aria-expanded={open} aria-controls="dc-x-{i}" onclick={() => (expandedKey = open ? null : e.key)}>
                      <span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
                      <span>
                        <span class="name" style:color="var(--rarity-{String(e.item.rarity ?? '').toLowerCase()}-fg-on-raised, var(--text-ink))">{e.name}</span>
                        <span class="meta">{slotLabel(character.class, e.slot)}{e.realm === 'oblivion' ? ' · Oblivion' : ''}{e.item.rarity ? ` · ${e.item.rarity}` : ''}{e.item.itemLevel ? ` · ilvl ${e.item.itemLevel}` : ''}</span>
                      </span>
                    </button>
                  </div>
                  <div role="cell">
                    {#if f}
                      <CIForest
                        domain={dpsDomain}
                        est={f.est}
                        lo={f.lo}
                        hi={f.hi}
                        tone={bagTone(chip, f)}
                        label={f.kind === 'sim' ? `${e.name}: ${signedPct(f.est, 1)}, 95% interval ${signedPct(f.lo, 1)} to ${signedPct(f.hi, 1)}` : `${e.name}: estimate ${signedPct(f.est, 1)}, no interval`}
                      />
                    {/if}
                  </div>
                  <div role="cell" class="delta">
                    {#if f?.kind === 'sim'}
                      <span class="v num {bagTone(chip, f)}">{signedPct(f.est, 1)}</span>
                      <span class="ci num">[{signedPct(f.lo, 1)}, {signedPct(f.hi, 1)}] · N {fmtCount(f.n)}</span>
                    {:else if f}
                      <span class="est num">{signedPct(f.est, 1)}</span>
                      <span class="ci"><ProvenanceTag kind="estimate" /> no interval</span>
                    {/if}
                  </div>
                  <div role="cell" class="vd">
                    <VerdictChip verdict={chip.verdict} label={r.best && r.best.basis === 'sim' ? `${chip.label} · ${setLabelOf(r.best.setKey)}` : chip.label} />
                  </div>
                </div>
                {#if open}
                  <div class="expand" id="dc-x-{i}" role="region" aria-label="{e.name}: verdict by gear set">
                    <div class="cards">
                      {#each cardsOf(i) as c (c.setKey)}
                        <DropSetCard
                          card={c}
                          phase={bagRowState}
                          onapply={(setKey) => applyEntry(e, setKey)}
                          onrunmore={bagJob?.status === 'finished' && !bagStale && bagNext() ? runMoreBag : null}
                        />
                      {/each}
                    </div>
                    <Button variant="ghost" size="small" onclick={() => loadFromBag(e)}>Open in Single drop</Button>
                  </div>
                {/if}
              {/each}
              {#each bag.skipped as sk (sk.name + sk.reason)}
                <div class="trow skipped" role="row">
                  <div role="cell" class="item"><span class="name soft">{sk.name}</span><span class="meta">Skipped: {sk.reason}</span></div>
                  <span role="cell" class="vd"><span class="skip"><span aria-hidden="true">!</span> Skipped</span></span>
                </div>
              {/each}
            </div>
          </Panel>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .page { display: grid; gap: var(--sp-4); padding-top: var(--sp-4); min-width: 0; }
  .grid { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  .col,
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .cards { display: grid; gap: var(--sp-3); }
  .block { display: grid; gap: var(--sp-2); }
  .row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .equipped { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-1); font-size: var(--fs-12); }
  .soft,
  .hint { color: var(--text-soft); font-size: var(--fs-12); margin: 0; }
  .link { background: none; border: none; padding: 0; color: var(--brass-200); text-decoration: underline dotted; cursor: pointer; font: inherit; }
  .summary { display: flex; flex-wrap: wrap; gap: var(--sp-4); font-size: var(--fs-13); color: var(--text-soft); }
  .summary .up { color: var(--verdict-up); }
  .summary .down { color: var(--verdict-down); }
  .summary .side { color: var(--verdict-side); }
  .tbl { display: grid; min-width: 0; }
  .trow {
    display: grid;
    grid-template-columns: minmax(180px, 1.3fr) minmax(160px, 2fr) minmax(130px, 1fr) minmax(130px, 0.9fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--line-hairline);
    min-width: 0;
  }
  .trow.thead { align-items: end; border-bottom-color: var(--line-rule); }
  .trow.rank.open { background: var(--surface-3); }
  .trow.skipped { grid-template-columns: minmax(180px, 1fr) auto; }
  .right { text-align: right; }
  .toggle { display: flex; gap: var(--sp-2); align-items: center; background: none; border: none; color: inherit; text-align: left; cursor: pointer; padding: 0; font: inherit; min-width: 0; }
  .toggle:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: var(--focus-offset); }
  .name { display: block; font-weight: var(--fw-bold); font-size: var(--fs-13); overflow-wrap: anywhere; }
  .meta { display: block; font-size: var(--fs-12); color: var(--text-soft); }
  .delta { display: grid; justify-items: end; font-size: var(--fs-12); }
  .delta .v { font-weight: var(--fw-bold); color: var(--text-ink); }
  .delta .v.up { color: var(--verdict-up); }
  .delta .v.down { color: var(--verdict-down); }
  .delta .est,
  .delta .ci { color: var(--text-soft); }
  .skip { color: var(--status-warn); font-size: var(--fs-12); }
  .expand { padding: var(--sp-3) 0 var(--sp-4); display: grid; gap: var(--sp-3); border-bottom: 1px solid var(--line-hairline); }
  @media (max-width: 1023px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 700px) {
    .results { order: -1; }
    .trow { grid-template-columns: minmax(0, 1fr); }
    .trow.thead { display: grid; }
    .delta { justify-items: start; }
  }
</style>
