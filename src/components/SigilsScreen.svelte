<script>
  /**
   * SigilsScreen.svelte - the character's class Sigil catalogue
   * (SIGILS_BY_CLASS, static structure) with the character's OWN numbers
   * entered against it (character.sigilValues - sigil stats scale with
   * in-game sigil level, so the values are per-character, like relic
   * levels). Passive values feed Calculated totals; active values/damage
   * feed the battle simulation. WHICH sigils are equipped is decided
   * per-preset in the Presets editor (up to 3 slots).
   *
   * Each card shows a sim badge (sigilSimSupport): a few sigils depend on
   * boss defenses or incoming hits the target-dummy sim doesn't model.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import { sigilSimSupport, sigilDamageInputs } from '../lib/sigilEffects.js';
  import { formatStat, parseStat, formatFlat } from '../lib/format.js';

  const character = $derived(rosterStore.current);
  const sigilDefs = $derived(SIGILS_BY_CLASS[character.class] || []);

  function statField(key) {
    return STAT_FIELDS.find((f) => f.key === key);
  }

  // STAT_FIELDS labels already carry their own '%' where relevant.
  function statLabel(statKey) {
    return statField(statKey)?.label ?? statKey;
  }

  function enteredValue(defId, effectType, statKey) {
    return character.sigilValues[defId]?.[effectType]?.[statKey] ?? 0;
  }

  function enteredDamage(defId, field) {
    return character.sigilValues[defId]?.[field] ?? 0;
  }

  function usedBy(defId) {
    return character.presets.filter((p) => p.sigilIds.includes(defId)).map((p) => p.name);
  }

  function uptimePct(active) {
    if (!active || !(active.cooldownSec > 0) || !(active.durationSec > 0)) return null;
    return Math.min(100, (active.durationSec / active.cooldownSec) * 100);
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before managing sigils.</p>
{:else}
  <div class="header-row">
    <h2>Sigils</h2>
    <p class="hint">
      enter YOUR values — sigil stats scale with sigil level · each preset equips up to 3 in the Presets editor
    </p>
  </div>

  <div class="sigil-list">
    {#each sigilDefs as def (def.id)}
      {@const sim = sigilSimSupport(def)}
      {@const damageInputs = sigilDamageInputs(def)}
      {@const used = usedBy(def.id)}
      {@const uptime = uptimePct(def.active)}
      <div class="sigil-card">
        <div class="card-head">
          <span class="sigil-name">{def.name}</span>
          <span class="rarity-badge rarity-{def.rarity.toLowerCase()}">{def.rarity}</span>
          <span class="spacer"></span>
          <span class="sim-badge" class:supported={sim.simulated} title={sim.note || ''}>
            {sim.simulated ? `sim: ${sim.summary}` : sim.summary}
          </span>
        </div>

        <div class="effects">
          {#if def.passive}
            <div class="effect">
              <span class="micro-label">PASSIVE</span>
              {#each def.passive.stats as s (s.statKey)}
                <label class="stat-row">
                  <span class="stat-name">{statLabel(s.statKey)}</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    value={formatStat(s.statKey, enteredValue(def.id, 'passive', s.statKey))}
                    aria-label="{def.name} passive {statLabel(s.statKey)}"
                    onchange={(e) => rosterStore.setSigilStatValue(def.id, 'passive', s.statKey, parseStat(s.statKey, e.target.value))}
                  />
                </label>
              {/each}
            </div>
          {/if}
          {#if def.active}
            <div class="effect">
              <span class="micro-label">ACTIVE</span>
              {#each def.active.stats as s (s.statKey)}
                <label class="stat-row">
                  <span class="stat-name">{statLabel(s.statKey)}</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    value={formatStat(s.statKey, enteredValue(def.id, 'active', s.statKey))}
                    aria-label="{def.name} active {statLabel(s.statKey)}"
                    onchange={(e) => rosterStore.setSigilStatValue(def.id, 'active', s.statKey, parseStat(s.statKey, e.target.value))}
                  />
                </label>
              {/each}
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
              <span class="timing">
                {#if def.active.durationSec > 0}{def.active.durationSec}s duration{/if}
                {#if def.active.cooldownSec > 0}
                  · {def.active.cooldownSec}s cooldown{#if uptime != null}&nbsp;· {uptime.toFixed(0)}% uptime{/if}
                {/if}
              </span>
            </div>
          {/if}
        </div>

        {#if def.notes}
          <p class="notes">{def.notes}</p>
        {/if}
        <span class="used-by">{used.length ? `equipped in ${used.join(', ')}` : 'not equipped in any preset'}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .header-row {
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    margin: 0;
  }
  .hint {
    font-size: 11px;
    color: var(--color-muted);
    margin: 2px 0 0;
  }
  .empty-hint {
    color: var(--color-muted);
  }
  .sigil-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sigil-card {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-panel);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .sigil-name {
    font-size: 13px;
    font-weight: 600;
  }
  .rarity-badge {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    color: var(--color-muted);
  }
  .rarity-legendary {
    color: var(--tier-gold);
    border-color: var(--tier-gold);
  }
  .rarity-epic {
    color: var(--nav-transcendence-light, var(--color-ink));
  }
  .sim-badge {
    font-size: 10px;
    letter-spacing: 0.04em;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--color-inset);
    color: var(--color-muted);
  }
  .sim-badge.supported {
    color: var(--color-dps);
  }
  .effects {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  @media (max-width: 900px) {
    .effects {
      grid-template-columns: 1fr;
    }
  }
  .effect {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    background: var(--color-inset);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .stat-name {
    font-size: 11.5px;
  }
  .stat-row input {
    width: 88px;
    text-align: right;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
  }
  .timing {
    color: var(--color-muted);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 10.5px;
  }
  .notes {
    font-size: 11px;
    color: var(--color-muted);
    font-style: italic;
    margin: 0;
  }
  .used-by {
    font-size: 10.5px;
    color: var(--color-muted);
  }
</style>
