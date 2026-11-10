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
   * verdict of every preset wearing it (features/swap.js), judged by the character's goals (DropGoalList,
   * design: drop-check-goals.md); the card says what it covered and what it did not judge. One table per
   * goal with its own labelled axis. The closed-form figure is an ESTIMATE under the simulated one, never
   * coloured. Apply names its scope first. Run more raises the precision step (features/dropView.js runMoreRequest).
   */
  import { untrack } from 'svelte';
  import { prefs, setPrefs } from '../../lib/prefs.svelte.js';
  import { importFlow, takeHandoff } from '../../lib/importFlow.svelte.js';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { loadUi, saveUi } from '../../lib/uiState.js';
  import { normaliseDropSetup } from '../../lib/ui/dropSetup.js';
  import { resolveDropGoals, goalsForRealm, requestGoals, goalIdsFor, goalsSeeDefence, legacyDropGoals, expandLegacyGoals } from '../../lib/ui/dropGoals.js';
  import { otherCharacters } from '../../lib/ui/optimiserSetup.js';
  import { activeDropProfile, DROP_GOAL_MAX, DROP_PROFILE_MAX } from '../../lib/model/dropCheck.js';
  import { formatHash } from '../../lib/routes.js';
  import { jobsStore, startJob, cancelJob, jobSignature, isStale } from '../../lib/jobs.svelte.js';
  import { prepareSwap, setInScope, DROP_PRECISION } from '../../lib/features/swap.js';
  import { equipSetKey } from '../../lib/build/presetInputs.js';
  import { dropFights } from '../../lib/calibration.js';
  import RunEstimate from '../ui/RunEstimate.svelte';
  import { dropHasStats } from '../../lib/model/drop.js';
  import { parseDropBatch, prepareBatch, rankEntries, entryResults, goalCharacter, BATCH_SIM } from '../../lib/features/dropBatch.js';
  import { setCards, setLabelOf, chipFor, goalFigure, tally, tallyChips, runMoreRequest, isDowngrade, bagSummaryText } from '../../lib/features/dropView.js';
  import { EQUIP_SETS } from '../../lib/model/equipment.js';
  import { forestDomain } from '../../lib/ui/forestScale.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import SlotSilhouette from '../gear/SlotSilhouette.svelte';
  import ItemEditor from '../gear/ItemEditor.svelte';
  import { slotLabel } from '../gear/gearFormat.js';
  import DropGoalList from '../drop/DropGoalList.svelte';
  import GoalProfile from '../drop/GoalProfile.svelte';
  import ImportPointer from '../import/ImportPointer.svelte';
  import DropSetCard from '../drop/DropSetCard.svelte';
  import DropDeepCheck from '../drop/DropDeepCheck.svelte';
  import DropMetricTables from '../drop/DropMetricTables.svelte';
  import { itemSummary, signedPct, dropStatRows, dropStatLines } from '../drop/dropFormat.js';
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

  const EFFORT = [
    { value: 'quick', label: 'Quick', sub: '1%' },
    { value: 'standard', label: 'Standard', sub: '0.5%' },
    { value: 'thorough', label: 'Thorough', sub: '0.25%' },
  ];
  // "Compare against" (a per-device preference): Set 1 only skips the presets wearing Set 2 entirely.
  const SETS = [
    { value: 'all', label: 'Both sets' },
    { value: 'set1', label: 'Set 1 only' },
  ];
  // The Loot bag tab needs game-data import (Settings > Advanced); a bag already loaded keeps it.
  const bagShown = $derived(prefs.showImport || !!bag);
  const TABS = $derived([
    { id: 'single', label: 'Single drop' },
    ...(bagShown ? [{ id: 'bag', label: 'Loot bag', count: bag ? liveCount : undefined }] : []),
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
    return jobSignature({ characterKey: c?.id ?? '', presetId: '', inputs: JSON.stringify([c?.equipment, c?.presets, c?.drop ?? null, c?.dropCheck ?? null, extra]) });
  }
  const ownedBy = (j, tool) => j.tool === tool && (() => { try { return JSON.parse(j.signature)[0] === character?.id; } catch { return false; } })();
  const stateOf = (job) => (job?.status === 'queued' ? 'queued' : job?.status === 'running' ? 'running' : 'idle');

  function segmentsOf(job) {
    if (!job) return [];
    const p = job.progress;
    const state = { queued: 'queued', running: 'active', finished: 'done', cancelled: 'cancelled', failed: 'cancelled' }[job.status] ?? 'queued';
    return [{ id: 'metrics', label: 'Comparisons', state, done: p?.done, total: p?.total, text: job.status === 'failed' ? 'failed' : undefined }];
  }

  // Measure settings: which presets and effort. Kept per character in the UI key (uiState.js, ui/dropSetup.js),
  // so they are per device and survive leaving the page. The goals are on the character (model/dropCheck.js).
  const loadSetup = (c) => normaliseDropSetup(loadUi().dropSetups[c.id], prefs.defaultEffort);
  /**
   * The old metric toggles (simOn, survivalOn, pvpOn) stored in this character's setup become its goals, once,
   * and only into an empty goal list (ui/dropGoals.js legacyDropGoals). A page never touched stored nothing.
   */
  function importLegacyGoals(c) {
    const raw = loadUi().dropSetups[c.id];
    if (!raw || typeof raw !== 'object' || raw.goalsImported) return;
    const legacy = legacyDropGoals(raw);
    if (legacy.length && !activeDropProfile(c).goals.length) rosterStore.setDropGoals(expandLegacyGoals(legacy, c));
    saveUi({ dropSetups: { [c.id]: { ...raw, goalsImported: true } } });
  }
  untrack(() => importLegacyGoals(character));
  let loadedId = untrack(() => character.id);
  const first = untrack(() => loadSetup(character));
  // JSON of the setup last loaded or saved: the save effect writes only on a real change, so opening the page
  // stores nothing and the default-effort pref keeps applying until the user changes a setting.
  let lastJson = JSON.stringify(first);
  let scope = $state(first.scope);
  let precision = $state(first.precision);
  $effect.pre(() => {
    if (character.id !== loadedId) {
      loadedId = character.id;
      untrack(() => importLegacyGoals(character));
      const next = loadSetup(character);
      lastJson = JSON.stringify(next);
      scope = next.scope; precision = next.precision;
    }
  });
  $effect(() => {
    const snap = $state.snapshot({ scope, precision });
    const json = JSON.stringify(snap);
    if (json === lastJson) return;
    lastJson = json;
    saveUi({ dropSetups: { [loadedId]: { ...snap, goalsImported: true } } });
  });
  let maxNOverride = $state(null);

  const dropSets = $derived(prefs.dropSets);
  const scopedPresets = $derived(character.presets.filter((p) => setInScope(equipSetKey(p, realm), dropSets)));
  const scopeId = $derived(scope === 'all' || scopedPresets.some((p) => p.id === scope) ? scope : 'all');

  // Goals: every saved goal checked against today's character and roster; a drop meets those of its realm.
  const others = $derived(otherCharacters(character, rosterStore.roster?.characters ?? []));
  const resolvedGoals = $derived(resolveDropGoals(activeDropProfile(character).goals, character, others));
  const realmGoals = $derived(goalsForRealm(resolvedGoals, realm));
  const anyGoal = $derived(resolvedGoals.some((r) => r.ok));

  // --- single drop -------------------------------------------------------------------------------

  const hasStats = $derived(drop ? dropHasStats(drop.item) : false);
  const rows = $derived(
    drop && hasStats
      ? prepareSwap(character, { slot: drop.slot, item: drop.item, realm, presetIds: scopeId === 'all' ? null : [scopeId], sets: dropSets })
      : [],
  );
  // each preset meets the goals of the drop's realm that judge it (a goal may be limited to some presets)
  const singleItems = $derived(rows.map((r) => ({ presetId: r.presetId, goalIds: goalIdsFor(realmGoals, realm, r.presetId), before: r.before, after: r.after })));
  const request = $derived.by(() => {
    if (!rows.length || !singleItems.some((it) => it.goalIds.length)) return null;
    return {
      mode: 'dropCheck',
      items: singleItems,
      goals: requestGoals(realmGoals),
      character: goalCharacter(character),
      seed: BATCH_SIM.seed,
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
      notice: 'Drop check started. Progress is in Jobs.',
      summarize: (res) => {
        const byPreset = Object.fromEntries((res?.results ?? []).map((r) => [r.presetId, r]));
        return tallyChips(tally(setCards(snapRows, byPreset), []));
      },
    });
    keptRows.set(id, { rows: snapRows });
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
    const ok = rosterStore.applyDropToSet(setKey);
    if (ok) setStatus?.(`Applied to ${label}: ${sets?.presetNames.length ?? 0} preset(s) updated`);
    else setStatus?.(`Could not apply to ${label}`);
    return ok;
  }

  const silhouetteSet = $derived(
    realm === 'oblivion' ? 'oblivion' : `set${character.presets.find((p) => p.id === character.activePresetId)?.equipmentSet ?? 1}`,
  );
  const equippedNow = $derived(
    realm === 'oblivion'
      ? [{ key: 'oblivion', label: 'Oblivion', item: character.equipment.oblivion.items[slot] ?? null }]
      : EQUIP_SETS.filter((s) => s.realm === 'base').map((s) => ({ key: s.key, label: s.label, item: character.equipment[s.key].items[slot] ?? null })),
  );
  /** Start the drop from a copy of the equipped item, so a small change (a reroll) needs no retyping. */
  function copyEquipped(e) {
    if (!e.item) return;
    rosterStore.setDropItem(structuredClone($state.snapshot(e.item)));
    setStatus?.(`Copied the ${e.label} item into the drop`);
  }
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
  // Items applied to a set leave the list (view state, kept with the bag); the job's results stay indexed by import order.
  const applied = $derived(new Set(bag?.applied ?? []));
  const ranked = $derived(bag ? rankEntries(bag.entries, bag.rows, bag.offsets, bagResults).filter((r) => !applied.has(r.entry.key)) : []);
  const liveCount = $derived(bag ? bag.entries.filter((e) => !applied.has(e.key)).length : 0);
  const liveBag = () => ({ ...bag, entries: bag.entries.filter((e) => !applied.has(e.key)) });
  const counts = $derived(tally(ranked.map((r) => r.best), bag?.skipped ?? []));
  const bagStale = $derived(!!bagJob && (isStale(bagJob) || bag.sets !== dropSets));
  /** The next loot-bag run's request (null before an import), for the run-time estimate. */
  // The screen simulates only the best few drops per slot (dropBatch.js screenKeep); "Check all" runs every one.
  const batchGoals = (all = false) => ({
    goals: requestGoals(resolvedGoals),
    goalIdsFor: (r, presetId) => goalIdsFor(resolvedGoals, r, presetId),
    screen: all ? null : { seesDefence: goalsSeeDefence(resolvedGoals) },
  });
  const bagRequest = $derived(bag && character ? prepareBatch(character, liveBag().entries, { sets: dropSets, ...batchGoals(bag.all) }).request : null);
  const screenedOut = $derived(bag ? (bag.screened ?? []).filter((k) => !applied.has(k)).length : 0);
  const bagBusy = $derived(bagJob?.status === 'queued' || bagJob?.status === 'running');
  const bagRowState = $derived(stateOf(bagJob));

  /**
   * The goal the bag table plots: the first goal of the list that judges the drops (the axis must be one goal's).
   * Other goals still count in each verdict; the expanded row shows them all.
   */
  const leadGoal = $derived(resolvedGoals.find((r) => r.ok) ?? null);
  /** One entry's figures for the lead goal: the simulated interval, or the hollow closed-form estimate (percent). */
  function figureOf(best) {
    if (!best) return null;
    if (best.basis === 'sim' && best.res) {
      const m = best.res.goals.find((g) => g.goalId === leadGoal?.goal.id) ?? best.res.goals[0];
      const f = m ? goalFigure(m) : null;
      if (f) return { kind: 'sim', axis: f.axis, unit: m.unit, est: f.est, lo: f.lo, hi: f.hi, n: f.n };
    }
    return { kind: 'est', axis: 'pct', est: best.row.closed.pct, lo: null, hi: null, n: null };
  }
  /** A figure's value on its axis: percent, points or the goal's own unit. */
  const fig = (f, v) => (f?.axis === 'pts' ? `${v > 0 ? '+' : ''}${v.toFixed(1)} pts` : f?.axis === 'raw' ? `${v > 0 ? '+' : ''}${+v.toFixed(3)}` : signedPct(v, 1));
  // "Hide downgrades" is view state only; the summary counts above always cover the whole bag.
  let hideDowngrades = $state(false);
  const shown = $derived(hideDowngrades ? ranked.filter((r) => !isDowngrade(r.best)) : ranked);
  const figures = $derived(shown.map((r) => figureOf(r.best)));
  // The table's axis is the lead goal's; a quick estimate (always percent) is drawn only on a percent axis.
  const bagAxis = $derived(figures.find((f) => f?.kind === 'sim')?.axis ?? 'pct');
  const onAxis = (f) => !!f && f.axis === bagAxis;
  const bagDomain = $derived(forestDomain(figures.map((f) => (onAxis(f) ? { est: f.est, lo: f.lo, hi: f.hi } : null))));
  const bagAxisTitle = $derived(
    bagAxis === 'pts' ? 'Change vs current (pts)' : bagAxis === 'raw' ? `Change vs current (${figures.find((f) => f?.kind === 'sim')?.unit ?? ''})` : 'Change vs current (%)',
  );

  function copyBag() {
    const text = bagSummaryText(shown.map((r, i) => ({ name: r.entry.name, slot: slotLabel(character.class, r.entry.slot), figure: figures[i], verdict: chipOf(r.best).label })));
    navigator.clipboard?.writeText(text).then(
      () => setStatus?.(`Copied ${shown.length} drop${shown.length === 1 ? '' : 's'} as text.`),
      () => setStatus?.('Copying was blocked by the browser.'),
    ) ?? setStatus?.('Copying was blocked by the browser.');
  }

  function bagTone(chip, f) {
    if (f?.kind !== 'sim') return 'est';
    return chip.verdict === 'better' ? 'up' : chip.verdict === 'worse' ? 'down' : 'side';
  }

  function runBatch(base, { precision: withPrecision = precision, maxN = null, all = false } = {}) {
    const sets = dropSets;
    const prep = prepareBatch(character, base.entries, { sets, ...batchGoals(all) });
    const key = character.id;
    let jobId = null;
    if (prep.request) {
      const req = { ...prep.request, precision: withPrecision, ...(maxN ? { maxN } : {}) };
      const entryKeys = `${sets}|${base.entries.map((e) => e.key).join(',')}`;
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
    keptBags.set(key, { entries: base.entries, skipped: base.skipped, source: base.source, rows: prep.rows, offsets: prep.offsets, jobId, precision: withPrecision, maxN, sets, all, screened: prep.screened });
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
    runBatch(liveBag(), { precision: next.precision, maxN: next.maxN ?? null, all: bag.all });
  }

  function loadFromBag(entry) {
    rosterStore.startDrop(entry.slot, entry.realm);
    rosterStore.setDropItem(entry.item);
    pickTab('single');
    setStatus?.(`Loaded ${entry.name} into Single drop`);
  }

  /** Apply a loot-bag item without leaving the bag: it becomes the saved drop, goes into the set, and leaves the list. */
  function applyEntry(entry, setKey) {
    rosterStore.startDrop(entry.slot, entry.realm);
    rosterStore.setDropItem(entry.item);
    if (!applyTo(setKey)) return;
    const cur = keptBags.get(character.id);
    if (cur) keptBags.set(character.id, { ...cur, applied: [...(cur.applied ?? []), entry.key] });
    if (expandedKey === entry.key) expandedKey = null;
    bump += 1;
  }

  const cardsOf = (i) => setCards(bag.rows[i], entryResults(bag.offsets, bag.rows, i, bagResults));
  const chipOf = (best) => (best ? chipFor(best.verdict, best.basis, bagRowState) : { verdict: 'queued', label: 'Queued' });

  $effect(() => {
    view = tab === 'bag' && bagShown ? 'bag' : 'single';
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

    {#if view !== 'bag' || !bagShown}
      <div id="dc-panel-single" role="tabpanel" class="grid">
        <div class="col setup">
          <Panel title="Drop" scope="tool">
            <!-- pick the slot on the left, describe the drop on the right; stacked when the column is narrow -->
            <div class="drop-body">
              <div class="pick">
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
                <!-- one small card per set: label and Copy on one line, the item under them -->
                <ul class="equipped" aria-label="Currently equipped in this slot">
                  {#each equippedNow as e (e.key)}
                    <li>
                      <div class="eq-head">
                        <span class="cap-label">{e.label}</span>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={!e.item}
                          reason="Nothing equipped in this slot"
                          onclick={() => copyEquipped(e)}
                        >Copy into drop</Button>
                      </div>
                      <span class="soft">{itemSummary(e.item)}</span>
                    </li>
                  {/each}
                </ul>
              </div>
              <div class="edit">
                <ItemEditor value={drop.item} {realm} {...{ slot }} class={character.class} onchange={(item) => rosterStore.setDropItem(item)} />
                {#if dropRows.length}
                  <StatTable rows={dropRows} playerClass={character.class} caption="Stats of this drop" />
                {/if}
                <div class="discard">
                  <Button variant="ghost" size="small" onclick={() => { rosterStore.discardDrop(); setStatus?.('Drop discarded'); }}>Discard this drop</Button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Measure" scope="tool">
            <div class="measure">
            <div class="group">
              {#if realm === 'base'}
                <div class="block">
                  <span class="cap-label">Compare against</span>
                  <SegmentedControl label="Compare against" value={dropSets} options={SETS} onchange={(v) => setPrefs({ dropSets: v })} />
                </div>
              {/if}
              <div class="presets">
                <Select
                  label="Presets"
                  value={scopeId}
                  options={[{ value: 'all', label: 'All presets' }, ...scopedPresets.map((p) => ({ value: p.id, label: p.name }))]}
                  onchange={(v) => (scope = v)}
                />
              </div>
            </div>
            <div class="group goals-group" role="group" aria-labelledby="dc-measure-what">
              <span class="cap-label" id="dc-measure-what">Goals</span>
              <GoalProfile
                profiles={character.dropCheck.profiles}
                activeId={character.dropCheck.activeProfileId}
                max={DROP_PROFILE_MAX}
                onselect={(id) => rosterStore.selectDropProfile(id)}
                onadd={(name, from) => rosterStore.addDropProfile(name, { copyFrom: from })}
                onrename={(id, name) => rosterStore.renameDropProfile(id, name)}
                onremove={(id) => rosterStore.removeDropProfile(id)}
              />
              <DropGoalList
                resolved={resolvedGoals}
                {character}
                characters={others}
                {realm}
                max={DROP_GOAL_MAX}
                onadd={(g) => rosterStore.addDropGoal(g)}
                onupdate={(id, g) => rosterStore.updateDropGoal(id, g)}
                onremove={(id) => rosterStore.removeDropGoal(id)}
              />
            </div>
            <div class="block effort">
              <span class="cap-label">Effort</span>
              <div class="effort-line">
                <SegmentedControl label="Effort" bind:value={precision} options={EFFORT} onchange={() => (maxNOverride = null)} />
                <p class="hint">More effort spots smaller differences and takes longer. If an item stays too close to call, the check says so.</p>
              </div>
              <details class="basis">
                <summary>How this works</summary>
                <p>
                  Each comparison starts with a few fights and adds more until the item is clearly better or clearly worse, or until it reaches a limit and is reported as too close to call.
                  Every goal is checked on its own, and a preset's verdict weighs all its goals together.
                  Effort sets the smallest difference it tries to spot: {EFFORT.map(({ value: k }) => k).map((k) => `${+(DROP_PRECISION[k].rel * 100).toFixed(2)}%`).join(', ')} of DPS, clear time or reward, and {EFFORT.map(({ value: k }) => k).map((k) => +(DROP_PRECISION[k].prob * 100).toFixed(2)).join(', ')} points of a clear chance, survival or win rate (Quick, Standard, Thorough).
                  The limit is {EFFORT.map(({ value: k }) => k).map((k) => fmtCount(DROP_PRECISION[k].maxN)).join(', ')} fights per build and goal.
                </p>
              </details>
              {#if request}<RunEstimate bound="upper" fights={dropFights(request, request.maxN ?? DROP_PRECISION[precision].maxN)} />{/if}
            </div>
            </div>
            {#snippet footer()}
              <Button variant="primary" disabled={!request || singleBusy} reason={!hasStats ? 'Enter at least one stat for the drop' : !rows.length ? 'No preset wears Set 1' : !anyGoal ? 'Add a goal to measure' : !realmGoals.length ? `No goal judges ${realm === 'oblivion' ? 'Oblivion' : 'base-realm'} drops` : !request ? 'No goal judges the chosen presets' : ''} loading={singleBusy} busyLabel="Checking…" onclick={() => checkDrop()}>
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
                <Banner variant="info" lead="Cancelled.">Finished presets are shown; the rest show only the quick estimate.</Banner>
              {/if}
              {#if singleStale}
                <Banner variant="warn" lead="Out of date.">The drop, your gear or the settings changed since this check. Check the drop again for up-to-date verdicts.</Banner>
              {/if}
              {#if !singleJob}
                <Banner variant="estimate" lead="Not checked yet.">The figures below are quick estimates from auto-attacks only. Press Check drop for a real verdict.</Banner>
              {/if}
              {#if !rows.length}
                <Banner variant="info" lead="Nothing to compare.">No preset wears Set 1. Switch Compare against to Both sets, or give a preset Set 1.</Banner>
              {:else if !anySheet}
                <p class="hint">
                  These presets have no in-game stats entered, so the numbers come from the app's own calculation.
                  <button type="button" class="link" onclick={() => onNavigate('builds/sheet')}>Enter your in-game stats</button> for more exact results.
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
          <Panel title="Deep check" scope="tool">
            <DropDeepCheck {character} {realm} {drop} resolved={resolvedGoals} {precision} {hasStats} signature={() => storeSignature()} {setStatus} />
          </Panel>
        </div>
      </div>
    {:else}
      <div id="dc-panel-bag" role="tabpanel" class="stack">
        <Panel title="Loot bag" scope="tool">
          <p class="hint">
            Every item in an imported loot bag (or a full game profile) is tried in {dropSets === 'set1' ? 'Set 1 only' : 'every gear set'}. Items of another class are skipped.
          </p>
          <ImportPointer what="a loot bag" />
          {#if batchError}<Banner variant="error">{batchError}</Banner>{/if}
          <div class="row">
            <span class="cap-label">Compare against</span>
            <SegmentedControl label="Compare against" value={dropSets} options={SETS} onchange={(v) => setPrefs({ dropSets: v })} />
          </div>
          <div class="row">
            <span class="cap-label">Effort</span>
            <SegmentedControl label="Effort" bind:value={precision} options={EFFORT} />
          </div>
          {#if bagRequest}
            <RunEstimate bound="upper" fights={dropFights(bagRequest, DROP_PRECISION[precision].maxN)} />
          {:else}
            <p class="hint" data-testid="run-estimate-bag">Run-time estimate appears once a loot bag is imported.</p>
          {/if}
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
              <Checkbox bind:checked={hideDowngrades} label="Hide downgrades" />
              <Button variant="ghost" size="small" disabled={!shown.length} onclick={copyBag}>Copy summary</Button>
              {#if bagBusy}
                <Button variant="ghost" size="small" onclick={() => cancelJob(bagJob.id)}>Cancel</Button>
              {:else}
                <Button variant="secondary" size="small" disabled={!liveCount} onclick={() => runBatch(liveBag(), { all: bag.all })}>Check again</Button>
              {/if}
            {/snippet}
            {#if bagJob}<RunProgress segments={segmentsOf(bagJob)} />{/if}
            {#if screenedOut && !bagBusy}
              <p class="hint" data-testid="bag-screened">
                {screenedOut} drop{screenedOut === 1 ? '' : 's'} scored well below the best few of {screenedOut === 1 ? 'its' : 'their'} slot on the quick screen and {screenedOut === 1 ? 'was' : 'were'} not simulated.
                <Button variant="ghost" size="small" onclick={() => runBatch(liveBag(), { all: true })}>Check all</Button>
              </p>
            {/if}
            {#if applied.size}
              <p class="hint" data-testid="bag-applied">{applied.size} applied item{applied.size === 1 ? '' : 's'} removed from the list.{liveCount ? ' Check again to compare the rest with your new gear.' : ''}</p>
            {/if}
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
              <Banner variant="info" lead="Cancelled.">Unfinished drops show only the quick estimate.</Banner>
            {/if}
            {#if bagStale}
              <Banner variant="warn" lead="Out of date.">Your gear, presets or the gear sets compared changed since this check. Check again for up-to-date verdicts.</Banner>
            {/if}
            <p class="hint">
              {#if leadGoal}Judged by your goals; the chart shows {leadGoal.label}.{:else}Add a goal under Single drop to judge these drops.{/if}
              {bag.sets === 'set1' ? 'Compared against Set 1 only.' : 'Each drop shows its best gear set.'} A set's verdict covers every preset that wears it.
            </p>

            <div class="tbl" role="table" aria-label="Drops: change on the first goal, with likely range">
              <div class="trow thead" role="row">
                <span role="columnheader" class="cap-label">Drop</span>
                <div role="columnheader"><ForestAxis domain={bagDomain} title={bagAxisTitle} format={(x) => `${x}`} /></div>
                <span role="columnheader" class="cap-label right">Change · likely range</span>
                <span role="columnheader" class="cap-label">Verdict</span>
              </div>
              {#each shown as r, i (r.entry.key)}
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
                    {#if onAxis(f)}
                      <CIForest
                        domain={bagDomain}
                        est={f.est}
                        lo={f.lo}
                        hi={f.hi}
                        tone={bagTone(chip, f)}
                        label={f.kind === 'sim' ? `${e.name}: ${fig(f, f.est)}, likely range ${fig(f, f.lo)} to ${fig(f, f.hi)}` : `${e.name}: quick estimate ${signedPct(f.est, 1)}, no range`}
                      />
                    {/if}
                  </div>
                  <div role="cell" class="delta">
                    {#if f?.kind === 'sim'}
                      <span class="v num {bagTone(chip, f)}">{fig(f, f.est)}</span>
                      <span class="ci num">[{fig(f, f.lo)}, {fig(f, f.hi)}] · {fmtCount(f.n)} fights</span>
                    {:else if f}
                      <span class="est num">{signedPct(f.est, 1)}</span>
                      <span class="ci"><ProvenanceTag kind="estimate" /> no range</span>
                    {/if}
                  </div>
                  <div role="cell" class="vd">
                    <VerdictChip verdict={chip.verdict} label={r.best && r.best.basis === 'sim' ? `${chip.label} · ${setLabelOf(r.best.setKey)}` : chip.label} />
                  </div>
                </div>
                {#if open}
                  {@const lines = dropStatLines(e.item)}
                  <div class="expand" id="dc-x-{i}" role="region" aria-label="{e.name}: verdict by gear set">
                    <div class="drop-stats" data-testid="drop-stats" aria-label="Stats of {e.name}">
                      <dl class="stat-lines">
                        {#each lines.primary as l (l.label)}<div><dt>{l.label}</dt><dd class="stat-value">{l.text}</dd></div>{/each}
                      </dl>
                      {#if lines.secondary.length}
                        <dl class="stat-lines">
                          {#each lines.secondary as l, k (k)}<div><dt>{l.label}</dt><dd class="stat-value">{l.text}</dd></div>{/each}
                        </dl>
                      {:else}
                        <p class="hint">No secondary stats.</p>
                      {/if}
                    </div>
                    <div class="cards">
                      {#each cardsOf(r.order) as c (c.setKey)}
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
            {#if hideDowngrades && ranked.length && !shown.length}
              <p class="hint" data-testid="bag-all-hidden">Every drop is a downgrade, so none are shown.</p>
            {/if}
          </Panel>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .page { display: grid; gap: var(--sp-4); padding-top: var(--sp-4); min-width: 0; }
  /* The setup column is as wide as the slot picker and a full item editor side by side; the verdict takes the
     rest, and on a wide screen its set cards sit side by side. */
  .grid { display: grid; grid-template-columns: minmax(22rem, 58rem) minmax(24rem, 1fr); gap: var(--sp-4); align-items: start; }
  .col,
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .setup { container-type: inline-size; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(30rem, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  .block { display: grid; gap: var(--sp-2); align-content: start; }
  .row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .drop-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
  .pick, .edit { display: grid; gap: var(--sp-3); align-content: start; min-width: 0; }
  .discard { display: flex; justify-content: flex-end; }
  @container (min-width: 50rem) {
    .drop-body { grid-template-columns: 17rem minmax(0, 1fr); gap: var(--sp-6); }
    .edit { padding-left: var(--sp-6); border-left: 1px solid var(--line-hairline); }
  }
  .equipped { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); font-size: var(--fs-12); }
  .equipped li { display: grid; gap: var(--sp-1); padding: var(--sp-2); background: var(--surface-2); border: 1px solid var(--line-hairline); border-radius: var(--r-1); }
  .eq-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
  /* Measure: what to compare against | what to measure, then Effort across the panel */
  .measure { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: var(--sp-4) var(--sp-6); }
  .group { display: grid; gap: var(--sp-3); align-content: start; min-width: 0; }
  .presets { max-width: 20rem; }
  .goals-group { grid-column: 1 / -1; }
  .effort { grid-column: 1 / -1; }
  .effort-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-4); }
  .effort-line .hint { flex: 1 1 18rem; max-width: 46ch; }
  .soft,
  .hint { color: var(--text-soft); font-size: var(--fs-12); margin: 0; }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
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
  .drop-stats { display: grid; gap: var(--sp-1); }
  .stat-lines { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-4); margin: 0; font-size: var(--fs-12); }
  .stat-lines div { display: flex; gap: var(--sp-2); align-items: baseline; }
  .stat-lines dt { color: var(--text-soft); }
  .stat-lines dd { margin: 0; color: var(--text-ink); }
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
