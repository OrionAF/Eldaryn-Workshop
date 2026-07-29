<script>
  /**
   * SigilsScreen.svelte - the character's class Sigil catalogue
   * (SIGILS_BY_CLASS, static structure) with the character's own progress
   * against it (character.sigilValues + the character-wide sigilForgeTier).
   * Passive values feed Calculated totals; active values/damage feed the
   * battle simulation. WHICH sigils are equipped is decided per-preset in the
   * Presets editor (up to 3 slots).
   *
   * Layout (BigReworkV1): one Sigil Forge Tier control governs every sigil,
   * then rarity-grouped card grids, highest rarity first. Ancient "conduit"
   * sigils are unlocked from the Transcendence tree rather than the Forge, so
   * they get their own section at the bottom.
   *
   * Most tooltip magnitudes are now derived from the sigil's level
   * (sigilEffectValue) and render read-only; only the numbers the scrape
   * couldn't give us - every damage figure, plus Warborn Fury's penetration -
   * remain typed in. Each card keeps a sim badge (sigilSimSupport): several
   * sigils depend on boss defenses or incoming hits the target-dummy sim
   * doesn't model.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS, RARITIES, rarityClass } from '../lib/constants.js';
  import {
    sigilStat,
    hasSigilCurve,
    sigilEffectValue,
    sigilUnlockedAt,
    sigilMinForgeTier,
    forgeSigils,
    conduitSigils,
    conduitNodeUnlocked,
    SIGIL_MAX_LEVEL,
    SIGIL_MAX_TIER,
  } from '../lib/sigilsData.js';
  import { sigilSimSupport, sigilDamageInputs } from '../lib/sigilEffects.js';
  import { formatStat, parseStat, formatFlat } from '../lib/format.js';
  import { sigilImage } from '../lib/assets.js';

  const DERIVED_PASSIVE = new Set(['attack', 'health']);

  const character = $derived(rosterStore.current);
  const forgeTier = $derived(character.sigilForgeTier || 1);

  /**
   * Rarity sections in ascending order (Common at the top, then Uncommon,
   * Rare, Epic, Legendary), skipping rarities this class lacks. Ancient
   * conduits then close the page in their own section. Note this is the
   * opposite of the Glyphs page, which sorts highest-rarity-first.
   */
  const sections = $derived(
    RARITIES.map((rarity) => ({
      rarity,
      defs: forgeSigils(character.class).filter((d) => d.rarity === rarity),
    })).filter((s) => s.defs.length > 0),
  );

  const conduits = $derived(conduitSigils(character.class));

  function statLabel(statKey) {
    return STAT_FIELDS.find((f) => f.key === statKey)?.label ?? statKey;
  }

  function enteredValue(defId, effectType, statKey) {
    return character.sigilValues[defId]?.[effectType]?.[statKey] ?? 0;
  }

  function enteredDamage(defId, field) {
    return character.sigilValues[defId]?.[field] ?? 0;
  }

  function sigilLevel(defId) {
    return character.sigilValues[defId]?.level ?? 0;
  }

  function usedBy(defId) {
    return character.presets.filter((p) => p.sigilIds.includes(defId)).map((p) => p.name);
  }

  function uptimePct(active) {
    if (!active || !(active.cooldownSec > 0) || !(active.durationSec > 0)) return null;
    return Math.min(100, (active.durationSec / active.cooldownSec) * 100);
  }

  /** Why a card is locked, or null when it's usable. */
  function lockReason(def) {
    if (!sigilUnlockedAt(def, forgeTier)) return `Requires Forge Tier ${sigilMinForgeTier(def)}`;
    if (!conduitNodeUnlocked(def, character)) return 'Locked — unlock its Transcendence node';
    return null;
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before managing sigils.</p>
{:else}
  <div class="header-row">
    <h2>Sigils</h2>
    <p class="hint">
      levels drive each sigil's stats and tooltip values · each preset equips up to 3 in the Presets editor
    </p>
  </div>

  <div class="forge-row">
    <div class="stepper-group">
      <span class="micro-label">SIGIL FORGE TIER</span>
      <div class="rank-controls">
        <button type="button" disabled={forgeTier <= 1} aria-label="Lower forge tier" onclick={() => rosterStore.setSigilForgeTier(forgeTier - 1)}>−</button>
        <span class="rank-value" data-testid="forge-tier">{forgeTier}</span>
        <button type="button" disabled={forgeTier >= SIGIL_MAX_TIER} aria-label="Raise forge tier" onclick={() => rosterStore.setSigilForgeTier(forgeTier + 1)}>+</button>
      </div>
    </div>
    <p class="forge-note">every sigil tiers up together · Legendary and Ancient sigils need Tier 2</p>
  </div>

  {#snippet sigilCard(def)}
    {@const sim = sigilSimSupport(def)}
    {@const damageInputs = sigilDamageInputs(def)}
    {@const used = usedBy(def.id)}
    {@const uptime = uptimePct(def.active)}
    {@const level = sigilLevel(def.id)}
    {@const locked = lockReason(def)}
    {@const art = sigilImage(character.class, def.id)}
    <div class="sigil-card rarity-card {rarityClass(def.rarity)}" class:locked>
      <h3 class="rarity-title">{def.name}</h3>

      {#if art}
        <img class="sigil-art" src={art} alt="" loading="lazy" />
      {/if}

      {#if locked}
        <p class="lock-note">{locked}</p>
      {:else}
        <div class="level-row">
          <div class="rank-controls">
            <button type="button" disabled={level <= 0} aria-label="{def.name} level down" onclick={() => rosterStore.setSigilLevel(def.id, level - 1)}>−</button>
            <input
              class="level-input"
              type="text"
              inputmode="numeric"
              value={level}
              aria-label="{def.name} level"
              onchange={(e) => rosterStore.setSigilLevel(def.id, e.target.value)}
            />
            <button type="button" disabled={level >= SIGIL_MAX_LEVEL} aria-label="{def.name} level up" onclick={() => rosterStore.setSigilLevel(def.id, level + 1)}>+</button>
          </div>
          <!-- The number is already in the input; only the "not owned" state
               (level 0) is information the stepper doesn't already show. -->
          {#if level === 0}<span class="level-caption">not owned</span>{/if}
        </div>

        {#if hasSigilCurve(def)}
          <p class="base-stats">
            Attack: <span class="stat-num">{formatStat('attack', sigilStat(def, 'attack', level, forgeTier))}</span>
            <span class="sep">|</span>
            Health: <span class="stat-num">{formatStat('health', sigilStat(def, 'health', level, forgeTier))}</span>
          </p>
        {/if}

        <div class="effects">
          {#each ['passive', 'active'] as effectType (effectType)}
            {#if def[effectType]?.stats?.length}
              {@const rows = def[effectType].stats.filter((s) => !(effectType === 'passive' && DERIVED_PASSIVE.has(s.statKey)))}
              {#if rows.length}
                <div class="effect">
                  <span class="micro-label">{effectType.toUpperCase()}</span>
                  {#each rows as s (s.statKey)}
                    {@const baked = sigilEffectValue(def, s.statKey, level)}
                    <label class="stat-row">
                      <span class="stat-name">{statLabel(s.statKey)}</span>
                      {#if baked === null}
                        <input
                          type="text"
                          inputmode="decimal"
                          value={formatStat(s.statKey, enteredValue(def.id, effectType, s.statKey))}
                          aria-label="{def.name} {effectType} {statLabel(s.statKey)}"
                          onchange={(e) => rosterStore.setSigilStatValue(def.id, effectType, s.statKey, parseStat(s.statKey, e.target.value))}
                        />
                      {:else}
                        <span class="derived-stat" aria-label="{def.name} {effectType} {statLabel(s.statKey)}">{formatStat(s.statKey, baked)}</span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/if}
            {/if}
          {/each}

          {#if damageInputs.damage || damageInputs.tickDamage || damageInputs.regenDebuffPct}
            <div class="effect">
              <span class="micro-label">YOUR NUMBERS</span>
              {#if damageInputs.damage}
                <label class="stat-row">
                  <span class="stat-name">Damage</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    value={formatFlat(enteredDamage(def.id, 'damage'))}
                    aria-label="{def.name} damage"
                    onchange={(e) => rosterStore.setSigilDamageValue(def.id, 'damage', parseStat('attack', e.target.value))}
                  />
                </label>
              {/if}
              {#if damageInputs.tickDamage}
                <label class="stat-row">
                  <span class="stat-name">Tick damage</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    value={formatFlat(enteredDamage(def.id, 'tickDamage'))}
                    aria-label="{def.name} tick damage"
                    onchange={(e) => rosterStore.setSigilDamageValue(def.id, 'tickDamage', parseStat('attack', e.target.value))}
                  />
                </label>
              {/if}
              {#if damageInputs.regenDebuffPct}
                <label class="stat-row">
                  <span class="stat-name">Regen debuff %</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    value={formatStat('hp_regen', enteredDamage(def.id, 'regenDebuffPct'))}
                    aria-label="{def.name} regen debuff %"
                    onchange={(e) => rosterStore.setSigilDamageValue(def.id, 'regenDebuffPct', parseStat('hp_regen', e.target.value))}
                  />
                </label>
              {/if}
            </div>
          {/if}

          {#if def.active && (def.active.durationSec > 0 || def.active.cooldownSec > 0)}
            <span class="timing">
              {#if def.active.durationSec > 0}{def.active.durationSec}s duration{/if}
              {#if def.active.cooldownSec > 0}
                · {def.active.cooldownSec}s cooldown{#if uptime != null}&nbsp;· {uptime.toFixed(0)}% uptime{/if}
              {/if}
            </span>
          {/if}
        </div>
      {/if}

      {#if def.notes}
        <p class="notes">{def.notes}</p>
      {/if}

      <div class="card-foot">
        <span class="sim-badge" class:supported={sim.simulated} title={sim.note || ''}>
          {sim.simulated ? `sim: ${sim.summary}` : sim.summary}
        </span>
        <span class="used-by">{used.length ? `in ${used.join(', ')}` : 'unequipped'}</span>
      </div>
    </div>
  {/snippet}

  {#each sections as section (section.rarity)}
    <section class="rarity-section">
      <h3 class="subheading">{section.rarity}</h3>
      <div class="sigil-grid">
        {#each section.defs as def (def.id)}
          {@render sigilCard(def)}
        {/each}
      </div>
    </section>
  {/each}

  {#if conduits.length}
    <section class="rarity-section conduit-section">
      <h3 class="subheading">Ancient — Eternal Conduits</h3>
      <p class="hint">unlocked from the Transcendence tree, and only at Forge Tier 2 or higher</p>
      <div class="sigil-grid">
        {#each conduits as def (def.id)}
          {@render sigilCard(def)}
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  .header-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
  h2 {
    font-family: var(--font-heading);
    margin: 0;
  }
  .hint,
  .forge-note {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .empty-hint {
    color: var(--color-muted);
  }

  .forge-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-5);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }
  .stepper-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .rank-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rank-value {
    min-width: 26px;
    text-align: center;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .rarity-section {
    margin-bottom: var(--space-6);
  }
  .rarity-section .subheading {
    margin: 0 0 var(--space-2);
  }
  .conduit-section .hint {
    margin-bottom: var(--space-2);
  }

  .sigil-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--space-3);
  }

  .sigil-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    /* Concentric radius: card is --radius-panel (10px), inner boxes go smaller. */
    padding: var(--space-3);
  }
  .sigil-card.locked {
    opacity: 0.55;
  }
  .rarity-title {
    margin: 0;
  }

  .sigil-art {
    display: block;
    width: 64px;
    height: 64px;
    margin: 0 auto;
    object-fit: contain;
    outline: 1px solid rgba(0, 0, 0, 0.25);
    outline-offset: -1px;
    border-radius: var(--radius-field);
  }

  .lock-note {
    margin: 0;
    text-align: center;
    font-size: 11.5px;
    color: var(--color-muted);
  }

  .level-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .level-input {
    width: 42px;
    text-align: center;
    padding: 4px 2px;
  }
  .level-caption {
    font-size: 11px;
    color: var(--color-muted);
  }

  .base-stats {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--color-soft);
  }
  .stat-num {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .sep {
    color: var(--color-dim);
    margin: 0 4px;
  }

  .effects {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .effect {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: var(--color-inset);
    border-radius: var(--radius-field);
    padding: 6px 8px;
  }
  .stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 11.5px;
  }
  .stat-name {
    color: var(--color-muted);
  }
  .stat-row input {
    width: 74px;
    text-align: right;
    padding: 3px 6px;
    font-size: 11.5px;
  }
  .derived-stat {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
    color: var(--color-gold-light);
  }
  .timing {
    font-size: 10.5px;
    color: var(--color-dim);
  }

  .notes {
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--color-muted);
  }

  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
    font-size: 10px;
  }
  .sim-badge {
    color: var(--color-dim);
    letter-spacing: 0.04em;
  }
  .sim-badge.supported {
    color: var(--color-dps-dim);
  }
  .used-by {
    color: var(--color-muted);
    text-align: right;
  }

  @media (max-width: 700px) {
    .sigil-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
