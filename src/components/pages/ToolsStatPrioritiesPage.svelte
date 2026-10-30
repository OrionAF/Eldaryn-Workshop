<script>
  /**
   * ToolsStatPrioritiesPage.svelte - Tools › Stat Priorities: what leaderboard players keep on their
   * gear, per class, spec and level range, as a build-guide card. Reads no character, so it also
   * opens from Welcome with an empty roster (routes.js noCharacter). Method and data:
   * lib/features/statPriority.js; the data file loads on first visit (~0.7 MB). The chosen spec and
   * range are per-device view state (uiState.js statPriority).
   */
  import Panel from '../ui/Panel.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import Banner from '../ui/Banner.svelte';
  import LevelRange from '../statPriority/LevelRange.svelte';
  import PriorityCard from '../statPriority/PriorityCard.svelte';
  import KeepRateHeatmap from '../statPriority/KeepRateHeatmap.svelte';
  import { parseLevelRange, presetBrackets, rangeKey, scoreSpecRange } from '../../lib/features/statPriority.js';
  import { loadUi, saveUi } from '../../lib/uiState.js';

  let { setStatus = () => {} } = $props();

  let data = $state.raw(null);
  let loadError = $state(null);
  const saved = loadUi().statPriority;
  let specKey = $state(saved.spec);
  let range = $state(saved.range);

  import('../../data/statPriority.json').then(
    (m) => (data = m.default),
    () => (loadError = 'The stat priority data could not be loaded.'),
  );

  const spec = $derived(data ? (data.specs.find((s) => s.spec === specKey) ?? data.specs[0]) : null);
  const presetsBySpec = $derived(data ? Object.fromEntries(data.specs.map((s) => [s.spec, presetBrackets(data, s.spec)])) : {});
  const presets = $derived(spec ? presetsBySpec[spec.spec] : []);
  // a saved or typed range that does not parse falls back to the spec's top bracket
  const key = $derived(parseLevelRange(range) ? rangeKey(parseLevelRange(range)) : (presets.at(-1)?.key ?? ''));
  const preset = $derived(presets.find((p) => p.key === key) ?? null);
  const current = $derived.by(() => {
    if (!spec) return null;
    if (preset) return preset;
    const [lo, hi] = parseLevelRange(key);
    return scoreSpecRange(data, spec.spec, lo, hi);
  });
  const near = $derived(current ? (presets.find((p) => current.lo >= p.lo && current.lo <= p.hi) ?? null) : null);
  // a custom range gets its own heatmap column, placed by its first level
  const columns = $derived.by(() => {
    if (!current) return [];
    if (preset || !current.players) return presets;
    const cols = [...presets];
    const at = cols.findIndex((p) => p.lo > current.lo);
    cols.splice(at < 0 ? cols.length : at, 0, current);
    return cols;
  });
  const groups = $derived.by(() => {
    const out = [];
    for (const s of data?.specs ?? []) {
      let g = out.find((x) => x.name === s.className);
      if (!g) out.push((g = { name: s.className, specs: [] }));
      g.specs.push(s);
    }
    return out;
  });

  function remember() {
    saveUi({ statPriority: { spec: spec.spec, range: key } });
  }
  function pickSpec(next) {
    // a custom range carries over; a preset bracket the new spec lacks falls back to its top bracket
    const wasPreset = !!preset;
    specKey = next;
    const list = presetsBySpec[next];
    if (wasPreset && !list.some((p) => p.key === key)) range = list.at(-1).key;
    remember();
  }
  function pickRange(next) {
    range = next;
    remember();
  }
  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => setStatus('Copied the card as text.'),
      () => setStatus('Copying was blocked by the browser.'),
    );
  }

  const gist = (s) => (presetsBySpec[s.spec]?.at(-1)?.priority ?? []).slice(0, 3).map((t) => data.labels[t]).join(' › ');
  const fmt = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
  const title = (r) => r.charAt(0) + r.slice(1).toLowerCase();
</script>

<div class="stat-priorities">
  {#if loadError}
    <Banner variant="error">{loadError}</Banner>
  {:else if !data}
    <p class="lede">Loading the leaderboard data…</p>
    <Skeleton lines={6} />
  {:else}
    <p class="lede">
      What leaderboard players keep on their gear, read from <span class="num">{data.playerCount.toLocaleString('en-US')}</span> profiles
      on servers {data.servers.join(', ')} (captured {new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}).
      It shows what players do, not a simulation of what is best.
    </p>

    <div class="specs" role="group" aria-label="Class and spec">
      {#each groups as g (g.name)}
        <div class="class-col">
          <span class="micro-label">{g.name}</span>
          {#each g.specs as s (s.spec)}
            <button type="button" class="spec" aria-pressed={s.spec === spec.spec} onclick={() => pickSpec(s.spec)}>
              <span class="nm">{s.specName}</span>
              <span class="gist">{gist(s)}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <LevelRange {data} spec={spec.spec} {presets} value={key} onchange={pickRange} />

    {#if current.players}
      <PriorityCard {data} {spec} b={current} custom={!preset} {near} oncopy={copy} />

      <Panel title="How it shifts with level">
        <KeepRateHeatmap {data} {columns} value={key} onpick={pickRange} />
      </Panel>

      <Panel title="Every {spec.specName} stat at level {current.key}">
        <div class="table-scroll">
          <table class="stats" data-testid="stat-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col" class="hide-sm">List</th>
                <th scope="col" class="r">Keep rate</th>
                <th scope="col" class="r hide-sm" title="Pieces carrying it / pieces expected from drop odds">Kept / expected</th>
                <th scope="col" class="r">Median</th>
                <th scope="col" class="r hide-sm">Top 25%</th>
                <th scope="col" class="r hide-sm">Soft cap</th>
              </tr>
            </thead>
            <tbody>
              {#each current.stats as s (s.type)}
                <tr>
                  <td>{s.label}</td>
                  <td class="hide-sm">
                    {#if current.priority.includes(s.type)}<span class="tag pri">Priority</span>
                    {:else if current.ban.includes(s.type)}<span class="tag ban">Ban {current.ban.indexOf(s.type) + 1}</span>
                    {:else}<span class="tag">Below odds</span>{/if}
                  </td>
                  <td class="r num">×{s.keepRate.toFixed(2)}</td>
                  <td class="r num hide-sm">{s.observed} / {s.expected}</td>
                  <td class="r num" class:over={s.softCap != null && s.median > s.softCap}>{fmt(s.median)}%</td>
                  <td class="r num hide-sm">{fmt(s.p75)}%</td>
                  <td class="r num hide-sm">{s.softCap != null ? `${s.softCap}%` : '–'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Panel>
    {:else}
      <Panel title="{spec.specName} · Level {current.key}">
        <p class="empty">No {spec.specName} players at this level in the captures. Pick a range where the bars show players.</p>
      </Panel>
    {/if}

    <details class="method">
      <summary>How this is worked out</summary>
      <div class="method-body">
        <p>
          <b>Keep rate.</b> For each spec and level range, count how many equipped gear pieces carry a stat, and divide by how many would
          carry it if players wore whatever dropped. ×2 means twice as often as drop odds; ×0.5 half as often. Players keep good rolls,
          reroll bad ones and ban stats with Attunement, so the rate shows what they chase and what they throw away. Sheet totals are not
          compared directly: they have no shared scale and mix talents, Awakening, pets and the rest.
        </p>
        <p>
          <b>Drop odds.</b> Each class has its own stat pool. Its odds come from the one-stat gear of players under level
          {data.method.ATTUNEMENT_LEVEL}, before Attunement can ban anything. Higher rarities roll flatter, so each rarity's odds are raised
          to a power fitted on fresh upgrades (pieces a player wears above the usual rarity of their gear):
        </p>
        <div class="gam">
          {#each Object.entries(data.gammas) as [r, g] (r)}<span>{title(r)} <span class="num">{g.toFixed(2)}</span></span>{/each}
        </div>
        <p>
          <b>Priority</b> lists every stat kept more often than it drops, best first; a stat within
          {Math.round((data.method.NEAR_TIE - 1) * 100)}% of the first stat in its group reads “≈”, otherwise “›” starts a new group.
          <b>Avoid</b> is the Attunement block list: the least-kept stats below drop odds, one per ban slot. <b>Below drop odds</b> is the
          rest. Thin samples are pulled toward ×1 by {data.method.SHRINK} pieces' worth of drop odds.
        </p>
        <p>
          <b>Typical</b> is the median sheet total of the priority stats from every source. <b>Awakening</b> counts the path among players
          who picked one. <b>Druid</b> is also split into Bear and Wolf by the utility sigil, since the forms want opposite stats.
        </p>
        <p>
          <b>Level ranges.</b> The data holds each spec's counts per level, and a bracket is their sum, so a level or range you type is
          scored exactly like a bracket. Brackets need {data.method.MIN_PLAYERS} players; a custom range shows any sample, flagged when it
          is small.
        </p>
      </div>
    </details>
  {/if}
</div>

<style>
  .stat-priorities { display: grid; gap: var(--sp-5); }
  .lede { margin: 0; max-width: 72ch; font-size: var(--fs-14); color: var(--text-soft); }
  .specs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
  .class-col { display: grid; gap: var(--sp-2); align-content: start; }
  .class-col .micro-label { color: var(--brass-400); }
  .spec {
    position: relative;
    display: grid;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    color: var(--text-ink);
    cursor: pointer;
  }
  .spec:hover { background: var(--surface-3); border-color: var(--line-control); }
  .spec[aria-pressed='true'] { background: var(--surface-3); border-color: var(--brass-500); }
  .spec[aria-pressed='true']::before {
    content: '';
    position: absolute;
    left: -1px;
    top: var(--sp-2);
    bottom: var(--sp-2);
    width: 3px;
    background: var(--ember-500);
  }
  .nm { font-weight: var(--fw-bold); font-size: var(--fs-14); }
  .gist { overflow: hidden; font-size: var(--fs-12); color: var(--text-muted); white-space: nowrap; text-overflow: ellipsis; }
  .table-scroll { overflow-x: auto; }
  .stats { width: 100%; border-collapse: collapse; font-size: var(--fs-13); }
  .stats th { padding: 6px var(--sp-2); text-align: left; font-weight: normal; font-size: var(--fs-12); color: var(--text-muted); border-bottom: 1px solid var(--line-rule); white-space: nowrap; }
  .stats td { padding: 6px var(--sp-2); border-bottom: 1px solid var(--line-hairline); }
  .stats .r { text-align: right; }
  .stats tr:hover td { background: var(--surface-3); }
  .stats .over { color: var(--ember-300); }
  .tag { padding: 1px 7px; font-size: var(--fs-11); border: 1px solid var(--line-control); border-radius: var(--r-pill); color: var(--text-muted); white-space: nowrap; }
  .tag.pri { border-color: var(--div-kept); color: var(--text-ink); }
  .tag.ban { border-color: var(--div-dropped); color: var(--text-soft); }
  .empty { margin: 0; color: var(--text-muted); }
  .method summary { cursor: pointer; font-family: var(--font-display); font-size: var(--fs-16); color: var(--brass-200); }
  .method-body { max-width: 72ch; font-size: var(--fs-13); color: var(--text-soft); }
  .method-body b { color: var(--text-ink); }
  .gam { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .gam > span { padding: 2px var(--sp-2); background: var(--surface-3); border: 1px solid var(--line-rule); border-radius: var(--r-1); }
  @media (max-width: 700px) {
    .specs { grid-template-columns: minmax(0, 1fr); }
    .class-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .class-col .micro-label { grid-column: 1 / -1; }
  }
  @media (max-width: 520px) {
    .hide-sm { display: none; }
  }
</style>
