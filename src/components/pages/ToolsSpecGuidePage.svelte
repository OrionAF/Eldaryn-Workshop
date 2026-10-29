<script>
  /**
   * ToolsSpecGuidePage.svelte - the Spec Guide: one spec's stat priority card (simulation.md §Stat
   * priority), the "A > B ≈ C" line other games' build guides share, with gear to look for, stats to
   * ignore, the Awakening path and the soft caps. Below it, folded away, the Spec baseline's typical
   * totals from gear and Awakening (§Spec baseline). The same for every player: the character only picks
   * which spec and level open first. Both tables are generated ahead of time (`npm run gen:spec-guide`,
   * then `npm run gen:spec-baseline`).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { GUIDE_SPECS, guideSpec, guideSpecLabel } from '../../lib/features/specGuide.js';
  import { PROFILES, formatTotal, rangeText, statLabel } from '../../lib/features/specBaseline.js';
  import { specPriority, priorityText, TANK_SPECS, TIE_RATIO } from '../../lib/features/statPriority.js';
  import { AWAKENING_PATHS } from '../../lib/game/awakening.js';
  import guide from '../../data/specGuide.json';
  import baseline from '../../data/specBaseline.json';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const FORMS = { DIRE_URSINE: 'MYSTIC_DRUID_BEAR', ALPHA_LUPINE: 'MYSTIC_DRUID_WOLF' };
  const A = baseline.assumptions;
  const LIST_TITLES = { damage: 'Damage', survival: 'Survival' };

  // the spec this character's active preset plays (its talent set's spec; a Druid by its Form sigil),
  // else its class's first spec
  const ownSpecId = $derived.by(() => {
    const p = character?.presets?.find((x) => x.id === character.activePresetId);
    const spec = character?.talentSets?.[p?.talentSet === 1 ? 1 : 0]?.spec;
    if (spec === 'MYSTIC_DRUID') return FORMS[p?.utilitySigilSpecies] ?? 'MYSTIC_DRUID_FORMLESS';
    if (spec && guideSpec(spec)) return spec;
    return GUIDE_SPECS.find((s) => s.cls === character?.class)?.id ?? null;
  });
  const ownLevel = $derived([...baseline.levels].reverse().find((l) => l <= (character?.level ?? 0)) ?? null);

  let specPick = $state(null);
  let profilePick = $state(null);
  const specId = $derived(specPick ?? ownSpecId ?? GUIDE_SPECS[0].id);
  const card = $derived(specPriority(guide, baseline, specId));
  const text = $derived(priorityText(card));
  const specOptions = GUIDE_SPECS.map((s) => ({ value: s.id, label: guideSpecLabel(s) }));

  // the folded typical totals
  const profile = $derived(profilePick ?? (TANK_SPECS.has(specId) ? 'balanced' : 'damage'));
  const entries = $derived(baseline.levels.map((l) => baseline.entries.find((e) => e.id === specId && e.level === l && e.profile === profile)).filter(Boolean));
  const rows = $derived.by(() => {
    const keys = [];
    for (const e of [...entries].reverse()) for (const r of e.rows) if (!keys.includes(r.key)) keys.push(r.key);
    const valued = (k) => k === 'totalAttack' || k === 'totalHp' || entries.some((e) => e.rows.find((r) => r.key === k)?.valued);
    return [...keys.filter(valued).map((key) => ({ key, valued: true })), ...keys.filter((k) => !valued(k)).map((key) => ({ key, valued: false }))];
  });
  const cell = (e, key) => e.rows.find((r) => r.key === key) ?? null;
  const profileOptions = PROFILES.map((p) => ({ value: p.id, label: p.label }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied the ${card.label} stat priority`);
    } catch {
      notify('Could not reach the clipboard; select the text below and copy it.', { kind: 'warn' });
    }
  }
</script>

{#snippet line(list)}
  <p class="line">
    {#each list.tiers as tier, t (t)}
      {#if t > 0}<span class="op" aria-label="better than">&gt;</span>{/if}
      {#each tier as s, i (s.key)}
        {#if i > 0}<span class="op" aria-label="about equal to">≈</span>{/if}
        <span class="stat" data-stat={s.key}>{s.label}</span>
      {/each}
    {/each}
  </p>
{/snippet}

<div class="stack">
  <Panel title="Stat priority" level="primary" scope="tool" scopeLabel="Reference">
    {#snippet meta()}<span class="sub">The same for every player</span>{/snippet}
    <div class="setup">
      <Select label="Spec" options={specOptions} value={specId} onchange={(v) => (specPick = v)} />
      <Button variant="secondary" onclick={copy} data-testid="spec-guide-copy">Copy as text</Button>
    </div>

    <div class="card" data-testid="stat-priority">
      <h3 class="title">{card.label}</h3>
      <div class="list main" data-list={card.main.kind}>
        <span class="cap-label">{LIST_TITLES[card.main.kind]}</span>
        {@render line(card.main)}
      </div>
      {#if card.second.tiers.length}
        <div class="list" data-list={card.second.kind}>
          <span class="cap-label">{LIST_TITLES[card.second.kind]}</span>
          {@render line(card.second)}
        </div>
      {/if}
      <dl class="facts">
        <dt class="cap-label">Look for on gear</dt>
        <dd data-testid="keep">{card.keep.join(', ')}</dd>
        {#if card.ignore.length}
          <dt class="cap-label">Ignore</dt>
          <dd data-testid="ignore">
            {#each card.ignore as r, i (r.label)}{i > 0 ? ', ' : ''}{r.label} <span class="why">({r.reason})</span>{/each}
          </dd>
        {/if}
        {#if card.path}
          <dt class="cap-label">Awakening</dt>
          <dd>{AWAKENING_PATHS[card.path].name}</dd>
        {/if}
        {#if card.caps.length}
          <dt class="cap-label">Soft caps</dt>
          <dd>
            {#each card.caps as c, i (c.label)}{i > 0 ? ', ' : ''}{c.label} <span class="num">{c.soft}</span> <span class="why">(hard <span class="num">{c.hard}</span>)</span>{/each}
          </dd>
        {/if}
      </dl>
      {#if card.main.shifts.length}
        <p class="note">
          {#each card.main.shifts as s, i (`${s.key}-${s.level}`)}{i > 0 ? '; ' : ''}At level <span class="num">{s.level}</span>, {s.label} ranks #{s.rank} instead of #{s.overall}{/each}.
        </p>
      {/if}
    </div>

    <details class="basis">
      <summary>Where this comes from</summary>
      <p>
        <strong>&gt;</strong> means clearly better, <strong>≈</strong> about the same (within {Math.round((1 - TIE_RATIO) * 100)}%).
        The order comes from simulated fights: one typical gear roll of each stat added to a clean build of the spec
        (gear of the level's rarity, talents, the spec's sigils), damage on the training dummy and time alive against a
        steady-pressure enemy, at levels <span class="num">{card.levels.join(', ')}</span>. The order barely changes
        between them, so one line covers all. A build far from the clean one can differ: your own preset's Stat weights
        on the Stat Sheet page answer for your build.
      </p>
      <p>
        Soft caps and which stats a class can use are game values. The Awakening path is the one simulated players
        of this spec picked most from level 60.
      </p>
    </details>
  </Panel>

  <details class="basis totals">
    <summary>Typical stat totals from gear and Awakening</summary>
    <p class="note">
      What a typical player of this spec reaches from gear and Awakening alone: the middle half of
      <span class="num">{A.players}</span> simulated players, each keeping the best of
      <span class="num">{A.drops.toLocaleString('en-US')}</span> drops at the level. Talents, sigils, pets, mounts,
      relics and stones come on top.
    </p>
    <div class="setup">
      <SegmentedControl label="Build" options={profileOptions} value={profile} onchange={(v) => (profilePick = v)} />
    </div>
    {#if entries.length}
      <div class="scroll">
        <table class="tbl" data-testid="spec-baseline">
          <thead>
            <tr>
              <th scope="col" class="cap-label">Stat</th>
              {#each entries as e (e.level)}
                <th scope="col" class="cap-label right" class:own={e.level === ownLevel}>
                  Level <span class="num">{e.level}</span>
                  {#if e.path}<span class="path">{AWAKENING_PATHS[e.path].name.replace(' Path', '')}</span>{/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.key)}
              <tr data-stat={r.key} class:muted={!r.valued}>
                <th scope="row" class="who">{statLabel(r.key)}</th>
                {#each entries as e (e.level)}
                  {@const c = cell(e, r.key)}
                  <td class="num right" class:own={e.level === ownLevel} title={c ? `median ${formatTotal(r.key, c.median)}` : ''}>
                    {c ? rangeText(r.key, c) : '–'}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </details>

  <details class="basis">
    <summary>Share as text</summary>
    <pre class="share" data-testid="spec-guide-text">{text}</pre>
  </details>
</div>

<style>
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .note { margin: var(--sp-2) 0 0; color: var(--text-muted); font-size: var(--fs-12); }
  .sub { font-size: var(--fs-12); color: var(--text-soft); }
  .setup { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-end; margin: var(--sp-3) 0; }
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .card { display: grid; gap: var(--sp-3); padding: var(--sp-4); border: 1px solid var(--line-rule); border-radius: var(--r-2); }
  .title { margin: 0; font-size: var(--fs-16); color: var(--brass-200); }
  .list { display: grid; gap: var(--sp-1); }
  .line { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1) var(--sp-2); font-size: var(--fs-14); color: var(--text-ink); }
  .main .line { font-size: var(--fs-16); }
  .op { color: var(--brass-400); font-weight: var(--fw-bold); }
  .facts { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--sp-2) var(--sp-4); align-items: baseline; }
  .facts dd { margin: 0; font-size: var(--fs-13); color: var(--text-ink); overflow-wrap: anywhere; }
  .why { color: var(--text-muted); }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
  .basis strong { color: var(--text-ink); }
  .scroll { overflow-x: auto; min-width: 0; }
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th, .tbl td { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line-hairline); white-space: nowrap; }
  .tbl thead th { border-bottom-color: var(--line-rule); vertical-align: bottom; text-align: left; }
  .tbl .right { text-align: right; }
  .tbl .who { font-size: var(--fs-13); font-weight: normal; text-transform: none; letter-spacing: normal; color: var(--text-ink); text-align: left; }
  .tbl td { font-size: var(--fs-13); color: var(--text-ink); }
  .path { display: block; font-weight: normal; text-transform: none; letter-spacing: 0; }
  .own { background: var(--brass-tint); }
  .tbl .muted .who, .muted td { color: var(--text-muted); }
  .share { white-space: pre-wrap; font-family: inherit; font-size: var(--fs-12); color: var(--text-ink); margin: var(--sp-2) 0 0; }
  @media (max-width: 700px) {
    .facts { grid-template-columns: minmax(0, 1fr); gap: var(--sp-1); }
    .facts dd { margin-bottom: var(--sp-2); }
  }
</style>
