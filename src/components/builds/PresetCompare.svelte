<script>
  /**
   * PresetCompare.svelte - B1 (ia.md §5.7): one column per preset, one row per property. Stat rows show
   * the effective value (the entered sheet when it applies, else the model) and the "Stats come from" row
   * says which; a sheet the build has moved on from reads Stale. Clicking a column's name makes that
   * preset active (G2). Duplicate / Delete are per column, and say why they are disabled.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { computePresetStats } from '../../lib/build/stats.js';
  import { sheetKeysForClass } from '../../lib/engine/pipeline/sheet.js';
  import { MIN_PRESETS, MAX_PRESETS } from '../../lib/model/presets.js';
  import { checkPreset, relicSlotCap, sigilSlotCap } from '../../lib/model/legality.js';
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import { SET_LABELS, petLabel, mountLabel, talentSetLabel, transcendenceLabel, filledSlots } from './presetLabels.js';
  import { effectiveTranscendencePreset } from '../../lib/model/legality.js';
  import { statText } from './statText.js';

  let { character, setStatus = () => {} } = $props();

  let diffOnly = $state(false);

  const HEADLINE = [
    'totalAttack', 'totalHp', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage',
    'totalDoubleHit', 'totalLifesteal', 'totalPenetration',
  ];
  const LABEL = {
    totalAttack: 'Attack', totalHp: 'Health', totalAttackSpeed: 'Attack speed', totalCritChance: 'Crit chance',
    totalCritDamage: 'Crit damage', totalDoubleHit: 'Double hit', totalLifesteal: 'Lifesteal', totalPenetration: 'Penetration',
  };

  const presets = $derived(character.presets);
  const shown = $derived(new Set(sheetKeysForClass(character.class)));
  const stats = $derived(Object.fromEntries(presets.map((p) => [p.id, computePresetStats(character, p.id)])));
  const relicCap = $derived(relicSlotCap(character.level, character.extraRelicSlots));

  function boardOf(p) {
    const b = effectiveTranscendencePreset(character, p);
    return b ? (transcendenceLabel(character, b.id) ?? b.name ?? 'Board') : 'None';
  }

  const rows = $derived.by(() => {
    const out = [];
    for (const key of HEADLINE) {
      if (!shown.has(key)) continue;
      out.push({ id: key, label: LABEL[key], cells: presets.map((p) => statText(key, stats[p.id].effective[key])), mono: true });
    }
    out.push(
      { id: 'gear', label: 'Gear set', cells: presets.map((p) => `${SET_LABELS[p.equipmentSet]} · ${filledSlots(character, `set${p.equipmentSet}`)} items`) },
      { id: 'talents', label: 'Talent set', cells: presets.map((p) => talentSetLabel(character, p.talentSet)) },
      { id: 'pet', label: 'Pet', cells: presets.map((p) => petLabel(character, p.petId) ?? 'None') },
      { id: 'mount', label: 'Mount', cells: presets.map((p) => mountLabel(character, p.mountId) ?? 'None') },
      { id: 'relics', label: 'Relics', cells: presets.map((p) => `${p.relicIds.length} of ${relicCap}`) },
      {
        id: 'sigils',
        label: 'Sigils',
        cells: presets.map((p) => {
          const n = p.sigilSpecies.length + (p.utilitySigilSpecies ? 1 : 0) + (p.ancientSigilSpecies ? 1 : 0);
          return `${n} equipped (${p.sigilSpecies.length} of ${sigilSlotCap(character.level, character.class)} generic)`;
        }),
      },
      { id: 'board', label: 'Board', cells: presets.map(boardOf) },
      { id: 'checks', label: 'Checks', cells: presets.map((p) => String(checkPreset(character, p).length)), checks: true },
    );
    return diffOnly ? out.filter((r) => new Set(r.cells).size > 1) : out;
  });

  const atMax = $derived(presets.length >= MAX_PRESETS);
  const atMin = $derived(presets.length <= MIN_PRESETS);

  function addPreset() {
    if (!rosterStore.addPreset()) setStatus(`At most ${MAX_PRESETS} presets.`);
  }
  function rename(p, e) {
    const name = e.target.value;
    if (name.trim()) rosterStore.renamePreset(p.id, name);
    else e.target.value = p.name;
  }
</script>

<Panel title="Compare presets" level="primary" scope="preset">
  {#snippet meta()}
    <Checkbox bind:checked={diffOnly} label="Differences only" />
    <Button variant="secondary" size="small" disabled={atMax} reason={atMax ? `At most ${MAX_PRESETS} presets` : ''} onclick={addPreset}>
      New preset
    </Button>
  {/snippet}
  <p class="scroll-hint">Scroll sideways to see every preset. The property names stay in view.</p>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be focusable) -->
  <div class="scroll" tabindex="0" role="region" aria-label="Preset comparison, scrolls sideways on narrow screens">
    <table class="compare" data-testid="preset-compare">
      <thead>
        <tr>
          <th scope="col" class="sticky"><span class="visually-hidden">Property</span></th>
          {#each presets as p (p.id)}
            {@const active = p.id === character.activePresetId}
            <th scope="col" class:active data-preset-id={p.id}>
              <button type="button" class="colname" aria-pressed={active} onclick={() => rosterStore.setActivePreset(p.id)}>
                {p.name}
              </button>
              {#if active}<span class="active-tag">Active</span>{/if}
              <input
                class="rename"
                type="text"
                aria-label={`Rename ${p.name}`}
                value={p.name}
                onblur={(e) => rename(p, e)}
                onkeydown={(e) => e.key === 'Enter' && e.target.blur()}
              />
              <div class="actions">
                <Button
                  variant="ghost"
                  size="small"
                  disabled={atMax}
                  reason={atMax ? `At most ${MAX_PRESETS} presets` : ''}
                  onclick={() => rosterStore.duplicatePreset(p.id)}>Duplicate</Button
                >
                <ConfirmButton
                  variant="danger"
                  size="small"
                  label="Delete"
                  confirmLabel="Confirm delete"
                  prompt={`Delete ${p.name}?`}
                  disabled={atMin}
                  onConfirm={() => rosterStore.deletePreset(p.id)}
                />
              </div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" class="lbl sticky">Stats come from</th>
          {#each presets as p (p.id)}
            {@const s = stats[p.id]}
            <td data-testid="source-chip">
              {#if s.source === 'sheet'}<ProvenanceTag kind="sheet" />{/if}
              {#if s.sheetStatus === 'stale'}<ProvenanceTag kind="stale" />{/if}
              {#if s.source !== 'sheet'}<ProvenanceTag kind="model" />{/if}
            </td>
          {/each}
        </tr>
        {#each rows as r (r.id)}
          <tr data-row={r.id}>
            <th scope="row" class="lbl sticky">{r.label}</th>
            {#each r.cells as c, i (presets[i].id)}
              <td class:num={r.mono} class:diff={new Set(r.cells).size > 1}>{c}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#snippet footer()}
    <span class="hint">
      {presets.length} of {MAX_PRESETS} presets. Delete is disabled at {MIN_PRESETS} (the minimum) and New at {MAX_PRESETS}.
      Edit what a preset picks in <a href="#/builds/loadout">Loadout</a>; its stat sheet is in <a href="#/builds/sheet">Stat Sheet</a>.
    </span>
  {/snippet}
</Panel>

<style>
  .scroll { overflow-x: auto; max-width: 100%; }
  .scroll-hint { display: none; margin: 0 0 var(--sp-2); font-size: var(--fs-12); color: var(--text-muted); }
  /* The property column stays put while the preset columns scroll under it. */
  th.sticky { position: sticky; left: 0; z-index: 1; background: var(--surface-2); }
  thead th.sticky { background: var(--surface-3); }
  table.compare { width: 100%; border-collapse: collapse; font-size: var(--fs-13); min-width: 520px; }
  thead th {
    text-align: left;
    vertical-align: top;
    padding: var(--sp-3);
    background: var(--surface-3);
    border-bottom: 1px solid var(--line-rule);
    min-width: 150px;
  }
  thead th.active { box-shadow: inset 0 3px 0 var(--brass-400); background: var(--surface-4); }
  .colname {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: var(--fs-14);
    font-weight: var(--fw-bold);
    color: var(--text-ink);
  }
  .colname:hover { text-decoration: underline; }
  .active-tag {
    margin-left: var(--sp-2);
    font-size: var(--fs-11);
    font-weight: var(--fw-heavy);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--verdict-up);
  }
  .rename { display: block; width: 100%; margin-top: var(--sp-2); }
  .actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); flex-wrap: wrap; }
  td, tbody th {
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--line-hairline);
    color: var(--text-ink);
    font-weight: inherit;
    text-align: left;
    vertical-align: middle;
  }
  tbody th.lbl { font-size: var(--fs-14); color: var(--text-soft); white-space: nowrap; }
  td.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; text-align: right; }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  @media (max-width: 700px) {
    .scroll-hint { display: block; }
    thead th { min-width: 140px; }
    tbody th.lbl { white-space: normal; min-width: 92px; max-width: 110px; }
  }
  .visually-hidden { position: absolute; top: 0; left: 0; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
