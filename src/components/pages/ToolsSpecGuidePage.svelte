<script>
  /**
   * ToolsSpecGuidePage.svelte - the Spec stat baseline (simulation.md §Spec baseline): for one spec and
   * build profile, the stat totals a player reaches from gear and Awakening alone at each level, as the
   * middle range of simulated players. The same for every player: nothing here reads the character's
   * build, only its class, spec and level to choose what opens first. The tables are generated ahead of
   * time (src/data/specBaseline.json, `npm run gen:spec-baseline`).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { GUIDE_SPECS, guideSpec, guideSpecLabel } from '../../lib/features/specGuide.js';
  import { PROFILES, formatTotal, rangeText, statLabel, baselineText } from '../../lib/features/specBaseline.js';
  import { AWAKENING_PATHS } from '../../lib/game/awakening.js';
  import baseline from '../../data/specBaseline.json';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const FORMS = { DIRE_URSINE: 'MYSTIC_DRUID_BEAR', ALPHA_LUPINE: 'MYSTIC_DRUID_WOLF' };
  const TANKS = new Set(['WARRIOR_TANK', 'MYSTIC_DRUID_BEAR']);
  const A = baseline.assumptions;

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
  const profile = $derived(profilePick ?? (TANKS.has(specId) ? 'balanced' : 'damage'));
  const g = $derived(guideSpec(specId));
  const entries = $derived(baseline.levels.map((l) => baseline.entries.find((e) => e.id === specId && e.level === l && e.profile === profile)).filter(Boolean));

  // rows: every stat any level has, in the top level's order; the stats this profile keeps gear for first
  const rows = $derived.by(() => {
    const keys = [];
    for (const e of [...entries].reverse()) for (const r of e.rows) if (!keys.includes(r.key)) keys.push(r.key);
    const valued = (k) => k === 'totalAttack' || k === 'totalHp' || entries.some((e) => e.rows.find((r) => r.key === k)?.valued);
    return [...keys.filter(valued).map((key) => ({ key, valued: true })), ...keys.filter((k) => !valued(k)).map((key) => ({ key, valued: false }))];
  });
  const cell = (e, key) => e.rows.find((r) => r.key === key) ?? null;
  const text = $derived(entries.length ? baselineText(entries) : '');

  const specOptions = GUIDE_SPECS.map((s) => ({ value: s.id, label: guideSpecLabel(s) }));
  const profileOptions = PROFILES.map((p) => ({ value: p.id, label: p.label }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied the ${guideSpecLabel(g)} baseline`);
    } catch {
      notify('Could not reach the clipboard; select the text below and copy it.', { kind: 'warn' });
    }
  }
</script>

<div class="stack">
  <Panel title="Spec stat baseline" level="primary" scope="tool" scopeLabel="Reference">
    {#snippet meta()}<span class="sub">Simulated, not game values</span>{/snippet}
    <p class="note">
      The stat totals a typical player of a spec reaches from <strong>gear and Awakening alone</strong>, level by level.
      Talents, sigils, pets, mounts, relics, stones, Transcendence and fortress come on top: a sheet above the
      range gets the rest from those; below it, the gear is behind.
    </p>
    <div class="setup">
      <Select label="Spec" options={specOptions} value={specId} onchange={(v) => (specPick = v)} />
      <SegmentedControl label="Build" options={profileOptions} value={profile} onchange={(v) => (profilePick = v)} />
      <Button variant="secondary" onclick={copy} disabled={!entries.length} data-testid="spec-guide-copy">Copy as text</Button>
    </div>
    <details class="basis" data-testid="spec-guide-build">
      <summary>How the baseline is made</summary>
      <p>
        Each level simulates <span class="num">{A.players.toLocaleString('en-US')}</span> players. Each one gets
        <span class="num">{A.drops.toLocaleString('en-US')}</span> drops at that level, rolled as the game rolls them:
        rarity from the level's drop odds, a random slot, item level equal to the player's level, and secondary lines
        drawn at random with low values more likely. Attunement bans the stats the spec cares least about
        (<span class="num">{A.attunementBans}</span>, plus the class's extra ban). The player keeps the best item in each
        slot and picks the Awakening path that suits the build.
      </p>
      <p>
        <strong>Damage</strong> keeps gear for damage only; <strong>Balanced</strong> weighs damage and staying
        alive equally. Each range is the middle half of the simulated players
        (<span class="num">{A.percentiles[0]}</span>th to <span class="num">{A.percentiles[1]}</span>th percentile).
        The drop count and item level are assumptions; the server decides both.
      </p>
    </details>
  </Panel>

  {#if !entries.length}
    <Panel title="No table"><p class="note">No baseline for this spec. Run <code>npm run gen:spec-baseline</code>.</p></Panel>
  {:else}
    <Panel title={`${guideSpecLabel(g)} · ${PROFILES.find((p) => p.id === profile).label}`}>
      {#snippet meta()}<span class="sub">Middle half of simulated players</span>{/snippet}
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
            {#each rows as r, i (r.key)}
              {#if !r.valued && (i === 0 || rows[i - 1].valued)}
                <tr class="divider"><td colspan={entries.length + 1} class="cap-label">Also from gear and Awakening</td></tr>
              {/if}
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
      {#if ownLevel}<p class="caption">Highlighted: your level band.</p>{/if}
    </Panel>
    <details class="basis">
      <summary>Share as text</summary>
      <pre class="share" data-testid="spec-guide-text">{text}</pre>
    </details>
  {/if}
</div>

<style>
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .note, .caption { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .note strong { color: var(--text-ink); }
  .caption { margin-top: var(--sp-3); }
  .sub { font-size: var(--fs-12); color: var(--text-soft); }
  .setup { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-end; margin: var(--sp-3) 0; }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .scroll { overflow-x: auto; min-width: 0; }
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th, .tbl td { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line-hairline); white-space: nowrap; }
  .tbl thead th { border-bottom-color: var(--line-rule); vertical-align: bottom; text-align: left; }
  .tbl .right { text-align: right; }
  .tbl .who { font-size: var(--fs-13); font-weight: normal; text-transform: none; letter-spacing: normal; color: var(--text-ink); text-align: left; }
  .tbl td { font-size: var(--fs-13); color: var(--text-ink); }
  .path { display: block; font-weight: normal; text-transform: none; letter-spacing: 0; }
  .own { background: var(--brass-tint); }
  .muted .who, .tbl .muted .who, .muted td { color: var(--text-muted); }
  .divider td { padding-top: var(--sp-4); border-bottom-color: var(--line-rule); }
  .share { white-space: pre-wrap; font-family: inherit; font-size: var(--fs-12); color: var(--text-ink); margin: var(--sp-2) 0 0; }
</style>
