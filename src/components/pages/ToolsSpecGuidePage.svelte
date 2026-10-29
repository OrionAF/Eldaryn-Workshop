<script>
  /**
   * ToolsSpecGuidePage.svelte - the Spec stat guide (simulation.md §Spec stat guide): for one spec and
   * level band, what one typical gear roll of each stat is worth to a reference build of that spec,
   * ranked with the best stat at 100. The tables are generated ahead of time (src/data/specGuide.json,
   * `npm run gen:spec-guide`); the page only reads them. When this character's active preset has a Stat
   * weights run, its damage ranking per roll sits beside the reference one.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { jobsStore } from '../../lib/jobs.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { GUIDE_SPECS, GUIDE_BANDS, guideSpec, guideSpecLabel, guideText, presetRanking, talentPointsAt } from '../../lib/features/specGuide.js';
  import { sigilBySpecies } from '../../lib/game/sigils.js';
  import { rarityById } from '../../lib/game/gear.js';
  import guide from '../../data/specGuide.json';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const FORMS = { DIRE_URSINE: 'MYSTIC_DRUID_BEAR', ALPHA_LUPINE: 'MYSTIC_DRUID_WOLF' };

  // the guide entry this character's active preset plays (its talent set's spec; a Druid by its Form sigil)
  const ownSpecId = $derived.by(() => {
    const p = character?.presets?.find((x) => x.id === character.activePresetId);
    const spec = character?.talentSets?.[p?.talentSet === 1 ? 1 : 0]?.spec;
    if (!spec) return null;
    if (spec === 'MYSTIC_DRUID') return FORMS[p?.utilitySigilSpecies] ?? 'MYSTIC_DRUID_FORMLESS';
    return guideSpec(spec) ? spec : null;
  });
  const ownBand = $derived([...GUIDE_BANDS].reverse().find((b) => b.level <= (character?.level ?? 0))?.level ?? GUIDE_BANDS[0].level);

  let specPick = $state(null);
  let levelPick = $state(null);
  const specId = $derived(specPick ?? ownSpecId ?? (GUIDE_SPECS.find((s) => s.cls === character?.class) ?? GUIDE_SPECS[0]).id);
  const level = $derived(levelPick ?? ownBand);
  const g = $derived(guideSpec(specId));
  const entry = $derived(guide.entries.find((e) => e.id === specId && e.level === level) ?? null);

  const specOptions = GUIDE_SPECS.map((s) => ({ value: s.id, label: guideSpecLabel(s) }));
  const levelOptions = GUIDE_BANDS.map((b) => ({ value: b.level, label: `Level ${b.level}` }));

  // this preset's own Stat weights run (the Stat Sheet page), when its class matches the guide spec's
  const ownJob = $derived(
    [...jobsStore.list].reverse().find((j) => j.tool === 'stat-weights' && j.request?.characterId === character?.id
      && j.request?.presetId === character?.activePresetId && j.request?.realm === 'base' && j.result?.damage) ?? null,
  );
  const ownRows = $derived(ownJob && g && character?.class === g.cls ? presetRanking(ownJob.result, g.cls, level) : null);
  const ownScore = $derived(new Map((ownRows ?? []).map((r) => [r.key, r.score])));
  const presetName = $derived(character?.presets?.find((x) => x.id === character.activePresetId)?.name ?? 'This preset');

  const LISTS = [
    { kind: 'damage', title: 'Damage', what: 'Average DPS over 60 s on the training dummy', suffix: 'DPS' },
    { kind: 'survival', title: 'Survival', what: `Time alive against a steady-pressure enemy, set so the build lasts about ${guide.timeAlive.targetSeconds} s`, suffix: 'time alive' },
  ];

  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
  const capText = (cap, key) => {
    if (!cap) return '';
    const mult = ['totalAttackSpeed', 'totalCritDamage', 'totalMinionAttackSpeed'].includes(key);
    return mult ? `soft cap ×${cap.soft}, hard ×${cap.hard}` : `soft cap ${cap.soft}%, hard ${cap.hard}%`;
  };
  const sigilNames = $derived((entry?.sigils ?? []).map((s) => sigilBySpecies(s)?.name ?? s).join(', '));

  async function copy() {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(guideText(entry));
      notify(`Copied the ${guideSpecLabel(g)} guide`);
    } catch {
      notify('Could not reach the clipboard; select the text below and copy it.', { kind: 'warn' });
    }
  }
</script>

<div class="stack">
  <Panel title="Spec stat guide" level="primary" scope="tool" scopeLabel="Reference">
    {#snippet meta()}<span class="sub">Simulated, not game values</span>{/snippet}
    <p class="note">
      What one typical gear roll of each stat is worth to a clean build of a spec, ranked with the best stat at 100.
      Use it as a baseline for what to aim for; your own build's numbers are on the Stat Sheet page.
    </p>
    <div class="setup">
      <Select label="Spec" options={specOptions} value={specId} onchange={(v) => (specPick = v)} />
      <SegmentedControl label="Level band" options={levelOptions} value={level} onchange={(v) => (levelPick = v)} />
      <Button variant="secondary" onclick={copy} disabled={!entry} data-testid="spec-guide-copy">Copy as text</Button>
    </div>
    {#if entry}
      <details class="basis" data-testid="spec-guide-build">
        <summary>The reference build</summary>
        <p>
          Level <span class="num">{entry.level}</span>; {rarityById(entry.band.rarity)?.name ?? entry.band.rarity} gear of item level
          <span class="num">{entry.level}</span> in every slot, its secondary lines one expected roll each of the stats below;
          <span class="num">{talentPointsAt(entry.level)}</span> talent points in the spec; sigils {sigilNames} at level
          <span class="num">{entry.band.sigilLevel}</span>, Sigil Altar tier <span class="num">{entry.band.altarTier}</span>.
          No pet, mount, relics, stones, Awakening, Transcendence or fortress: those differ too much between players to be a baseline.
        </p>
        <p>
          A roll is the average gear secondary roll at this item level. Base: <span class="num">{entry.base.dps.toLocaleString('en-US')}</span> DPS,
          <span class="num">{entry.base.timeAlive}</span> s alive; <span class="num">{entry.n.toLocaleString('en-US')}</span> fights per stat.
        </p>
      </details>
    {/if}
  </Panel>

  {#if !entry}
    <Panel title="No table"><p class="note">No guide table for this spec and level band. Run <code>npm run gen:spec-guide</code>.</p></Panel>
  {:else}
    {#each LISTS as list (list.kind)}
      {@const rows = entry[list.kind]}
      {@const withOwn = list.kind === 'damage' && ownRows}
      <Panel title={list.title}>
        {#snippet meta()}<span class="sub">{list.what}</span>{/snippet}
        <div class="tbl" class:with-own={withOwn} role="table" aria-label="{list.title} priority, {guideSpecLabel(g)}, level {entry.level}" data-list={list.kind}>
          <div class="trow thead" role="row">
            <span role="columnheader" class="cap-label">#</span>
            <span role="columnheader" class="cap-label">Stat · one roll</span>
            <span role="columnheader" class="cap-label">Score</span>
            <span role="columnheader" class="cap-label right">Per roll · likely range</span>
            {#if withOwn}<span role="columnheader" class="cap-label right">{presetName}</span>{/if}
          </div>
          {#each rows as r, i (r.key)}
            <div class="trow" role="row" data-stat={r.key}>
              <span role="cell" class="num rank">{r.score != null ? i + 1 : ''}</span>
              <span role="cell" class="who">
                {r.label} <span class="unit num">{r.unit}</span>
                {#if r.cap}<span class="capnote">{capText(r.cap, r.key)}</span>{/if}
              </span>
              <span role="cell" class="score">
                {#if r.inert}
                  <span class="muted">No effect for this class</span>
                {:else if r.score == null}
                  <span class="muted">No clear effect</span>
                {:else}
                  <span class="bar" aria-hidden="true"><span class="fill" style="width: {Math.max(2, r.score)}%"></span></span>
                  <span class="num v" data-testid="score">{r.score}</span>
                {/if}
              </span>
              <span role="cell" class="delta">
                {#if !r.inert}
                  <span class="num">{pct(r.value)} {list.suffix}</span>
                  <span class="num ci">[{pct(r.lo)}, {pct(r.hi)}]</span>
                {/if}
              </span>
              {#if withOwn}
                <span role="cell" class="num own right">{ownScore.get(r.key) ?? '–'}</span>
              {/if}
            </div>
          {/each}
        </div>
        {#if list.kind === 'damage'}
          {#if withOwn}
            <p class="caption">
              {presetName}: its own Stat weights run rescaled to one roll, best = 100. Where it differs from the reference, your build already has more (or less) of that stat.
            </p>
          {:else if character?.class && g && character.class === g.cls}
            <p class="caption">
              Run Stat weights on the Stat Sheet page to see {presetName}'s own scores beside these.
              <Button variant="ghost" size="small" onclick={() => go('builds/sheet')}>Open Stat Sheet</Button>
            </p>
          {/if}
        {/if}
      </Panel>
    {/each}
    <details class="basis">
      <summary>Share as text</summary>
      <pre class="share" data-testid="spec-guide-text">{guideText(entry)}</pre>
    </details>
  {/if}
</div>

<style>
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .note, .caption { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .caption { margin-top: var(--sp-3); }
  .sub { font-size: var(--fs-12); color: var(--text-soft); }
  .setup { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-end; margin: var(--sp-3) 0; }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .tbl { display: grid; min-width: 0; }
  .trow {
    display: grid;
    grid-template-columns: 2.5ch minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.3fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--line-hairline);
    min-width: 0;
  }
  .with-own .trow { grid-template-columns: 2.5ch minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.3fr) minmax(0, 0.8fr); }
  .trow.thead { align-items: end; border-bottom-color: var(--line-rule); }
  .right { text-align: right; }
  .rank { color: var(--text-soft); font-size: var(--fs-12); }
  .who { font-size: var(--fs-13); color: var(--text-ink); overflow-wrap: anywhere; display: grid; }
  .unit { color: var(--text-soft); font-size: var(--fs-12); }
  .capnote { color: var(--text-soft); font-size: var(--fs-11); }
  .score { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .bar { flex: 1; height: 6px; background: var(--line-hairline); border-radius: var(--r-pill); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--brass-400); }
  .score .v { font-weight: var(--fw-bold); color: var(--text-ink); min-width: 3ch; text-align: right; }
  .delta { display: grid; justify-items: end; font-size: var(--fs-12); color: var(--text-ink); }
  .delta .ci { color: var(--text-soft); }
  .own { font-size: var(--fs-13); color: var(--text-ink); }
  .muted { color: var(--text-muted); font-size: var(--fs-12); }
  .share { white-space: pre-wrap; font-family: inherit; font-size: var(--fs-12); color: var(--text-ink); margin: var(--sp-2) 0 0; }
  @media (max-width: 700px) {
    .trow, .with-own .trow { grid-template-columns: 2.5ch minmax(0, 1fr); }
    .trow.thead { display: none; }
    .score, .delta, .own { grid-column: 2; }
    .delta { justify-items: start; }
    .own { text-align: left; }
  }
</style>
