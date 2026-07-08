<script>
  /**
   * SimulatedPresetCard.svelte - the optimizer's recommendation, rendered as
   * a read-only virtual preset. Deliberately styled as NOT one of the
   * player's saved presets (dashed border, badge, zero edit affordances):
   * it may describe configurations that exist on no saved preset (e.g. an
   * unsaved talent allocation), and nothing here writes to the store - the
   * player applies the changes manually.
   */
  import { TALENT_TREES } from '../lib/talentTreeData.js';
  import { TRANSCENDENCE_TREES } from '../lib/transcendenceData.js';
  import { petLabel, stoneLabel } from '../lib/optimizer.js';
  import TranscendenceGrid from './TranscendenceGrid.svelte';
  import { SPECS_BY_CLASS, SLOTS } from '../lib/constants.js';
  import { RELICS_BY_CLASS } from '../lib/relicsData.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import { AWAKENING_PATHS } from '../lib/awakeningData.js';

  let { result, character } = $props();

  const DIMENSION_LABELS = {
    loadout: 'Gear Loadout',
    stones: 'Socketed Stones',
    talents: 'Talents',
    pet: 'Pet',
    relics: 'Relics',
    sigils: 'Sigils',
    mount: 'Mount',
    glyphs: 'Mount Glyphs',
    awakening: 'Awakening',
    transcendence: 'Transcendence',
  };

  const candidate = $derived(result.best.candidate);
  const improvement = $derived(result.improvementPct);
  const transcendenceTree = $derived(TRANSCENDENCE_TREES[character.class]);

  const fmtDps = (n) => n.toFixed(2);

  const specLabel = $derived.by(() => {
    if (!candidate.talentSpec) return 'No spec';
    return (SPECS_BY_CLASS[character.class] || []).find((s) => s.key === candidate.talentSpec)?.label || candidate.talentSpec;
  });

  const talentRows = $derived.by(() => {
    const tree = TALENT_TREES[candidate.talentSpec];
    if (!tree) return [];
    const rows = [];
    for (const tier of tree.tiers) {
      for (const t of tier.talents) {
        const rank = candidate.talentAllocation?.[t.id] || 0;
        if (rank > 0) rows.push({ name: t.name, rank, max: t.ranks.length });
      }
    }
    return rows;
  });

  const relicNames = $derived(
    candidate.preset.relicIds.map((id) => (RELICS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id)
  );

  const sigilNames = $derived(
    (candidate.preset.sigilIds || []).map((id) => (SIGILS_BY_CLASS[character.class] || []).find((d) => d.id === id)?.name || id)
  );

  const fortressLabel = $derived.by(() => {
    const on = ['top', 'bottom', 'core'].filter((k) => candidate.preset.fortressBuffs[k]);
    return on.length ? on.join(' + ') : 'None';
  });

  const mountName = $derived.by(() => {
    if (!candidate.mountActiveId) return 'None';
    return (character.mounts?.entries || []).find((m) => m.id === candidate.mountActiveId)?.name || 'Unknown';
  });

  const glyphLabels = $derived(
    candidate.glyphEquippedIds.map((id) => {
      const g = (character.glyphs?.entries || []).find((e) => e.id === id);
      return g ? `${g.tier} ${g.statKey} +${g.value}` : id;
    })
  );

  const awakeningLabel = $derived(
    candidate.awakeningPath ? AWAKENING_PATHS[candidate.awakeningPath]?.label || candidate.awakeningPath : 'No path'
  );

  const stoneRows = $derived(
    SLOTS.filter((s) => candidate.socketedStones?.[s]).map((s) => ({
      slot: s,
      label: stoneLabel(character, candidate.socketedStones[s]),
    }))
  );
</script>

<div class="simulated-card" data-testid="simulated-preset-card">
  <div class="card-head">
    <span class="badge">Simulated Preset</span>
    <div class="dps-line">
      <span class="mono from">{fmtDps(result.baseline.score)}</span>
      <span class="arrow">→</span>
      <span class="mono to">{fmtDps(result.best.score)}</span>
      <span class="gain mono" class:flat={improvement <= 0}>
        {improvement > 0 ? `+${improvement.toFixed(2)}%` : '±0.00%'}
      </span>
      <span class="dps-tag">DPS</span>
    </div>
  </div>

  {#if result.changes.length === 0}
    <p class="already-optimal">Your current build is already the best this search can find — nothing to change.</p>
  {:else}
    <div class="section">
      <span class="micro-label">What to change</span>
      <ul class="changes">
        {#each result.changes as change (change.dimension)}
          <li>
            <span class="dim">{DIMENSION_LABELS[change.dimension] || change.dimension}</span>
            <span class="fromto">
              <s>{change.from}</s> <span class="arrow">→</span>
              <strong>{change.to}</strong>
            </span>
            {#if change.detail?.length}
              <ul class="detail">
                {#each change.detail as line, i (i)}
                  <li class="mono">{line}</li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if result.transcendencePlan.length > 0 && transcendenceTree}
    <div class="section">
      <span class="micro-label">Transcendence — reset, then rebuild to match this board ({result.ichorSpent} Ichor)</span>
      <!-- Read-only (no onSelect): same drag/pinch/zoom canvas as the
           Transcendence page, with the recommended board pre-selected. -->
      <TranscendenceGrid tree={transcendenceTree} unlockedPositions={candidate.transcendenceUnlocked} />
    </div>
  {/if}

  <details class="full-config">
    <summary>Full recommended configuration</summary>
    <dl>
      <dt>Gear Loadout</dt>
      <dd>{character.loadouts[candidate.preset.loadout]?.name || `Loadout ${candidate.preset.loadout + 1}`}</dd>
      <dt>Stones</dt>
      <dd>
        {#if stoneRows.length > 0}
          <ul class="talent-list">
            {#each stoneRows as row (row.slot)}
              <li>{row.slot} — {row.label}</li>
            {/each}
          </ul>
        {:else}None{/if}
      </dd>
      <dt>Talent Spec</dt>
      <dd>{specLabel}</dd>
      {#if talentRows.length > 0}
        <dt>Talents</dt>
        <dd>
          <ul class="talent-list">
            {#each talentRows as row (row.name)}
              <li>{row.name} <span class="mono">{row.rank}/{row.max}</span></li>
            {/each}
          </ul>
        </dd>
      {/if}
      <dt>Pet</dt>
      <dd>{petLabel(character, candidate.preset.petId)}</dd>
      <dt>Relics</dt>
      <dd>{relicNames.join(', ') || 'None'}</dd>
      <dt>Sigils</dt>
      <dd>{sigilNames.join(', ') || 'None'}</dd>
      <dt>Fortress Buffs</dt>
      <dd>{fortressLabel}</dd>
      <dt>Mount</dt>
      <dd>{mountName}</dd>
      {#if glyphLabels.length > 0}
        <dt>Mount Glyphs</dt>
        <dd>{glyphLabels.join(', ')}</dd>
      {/if}
      <dt>Awakening</dt>
      <dd>{awakeningLabel}</dd>
      <dt>Transcendence</dt>
      <dd>{candidate.transcendenceUnlocked.length} node{candidate.transcendenceUnlocked.length === 1 ? '' : 's'} unlocked</dd>
    </dl>
  </details>

  <p class="footnote">Apply these changes manually — nothing is saved to your presets.</p>
</div>

<style>
  .simulated-card {
    border: 1px dashed var(--color-gold);
    border-radius: var(--radius-panel);
    padding: var(--space-4) var(--space-5);
    background: var(--color-gold-tint);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .badge {
    font-family: var(--font-heading);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-gold-light);
    border: 1px solid var(--color-gold);
    border-radius: var(--radius-pill);
    padding: 3px 10px;
  }
  .dps-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 15px;
  }
  .dps-line .from {
    color: var(--color-muted);
  }
  .dps-line .to {
    color: var(--color-dps);
    font-weight: 600;
  }
  .dps-line .arrow {
    color: var(--color-muted);
  }
  .gain {
    color: var(--color-upgrade);
    font-size: 12px;
  }
  .gain.flat {
    color: var(--color-muted);
  }
  .dps-tag {
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--color-muted);
  }
  .already-optimal {
    color: var(--color-muted);
    margin: 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .changes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .changes > li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
  }
  .dim {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-gold-light);
    min-width: 108px;
  }
  .fromto s {
    color: var(--color-muted);
  }
  .detail {
    list-style: none;
    margin: 2px 0 0;
    padding: 0 0 0 118px;
    width: 100%;
    font-size: 12px;
    color: var(--color-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .full-config summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--color-muted);
  }
  .full-config dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin: var(--space-3) 0 0;
    font-size: 12px;
  }
  .full-config dt {
    color: var(--color-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 10px;
    align-self: baseline;
  }
  .full-config dd {
    margin: 0;
  }
  .talent-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .footnote {
    margin: 0;
    font-size: 11px;
    color: var(--color-muted);
    font-style: italic;
  }
  @media (max-width: 700px) {
    .detail {
      padding-left: 0;
    }
    .full-config dl {
      grid-template-columns: 1fr;
      gap: 2px;
    }
    .full-config dt {
      margin-top: 6px;
    }
  }
</style>
