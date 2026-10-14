<script>
  /**
   * CharacterScreen.svelte - class summary, level, account skills (incl. the Oblivion point),
   * attunement bans, owned fortress buffs with the class-remap preview, the base residual and
   * the Oblivion unlock toggle (rebuild-plan §2.5, §7.3 B6b).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel, attunementBonus, MAX_PLAYER_LEVEL } from '../../lib/game/classes.js';
  import { SKILLS, skillLevelCap, skillEffect, skillUpgradeCost, SKILLS_UNLOCK_LEVEL } from '../../lib/game/skills.js';
  import { FORTRESS_BUFFS, remapFortressStat } from '../../lib/game/fortress.js';
  import { FORTRESS_GROUPS } from '../../lib/model/fortress.js';
  import { attunementMaxBans, bannableStats } from '../../lib/model/skills.js';
  import { RESIDUAL_KEYS } from '../../lib/model/character.js';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {} } = $props();

  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const maxBans = $derived(character ? attunementMaxBans(character.skills, character.class) : 0);
  const bans = $derived(character?.attunementBans ?? []);
  const owned = $derived(character?.fortress?.owned ?? []);

  const RESIDUAL_LABELS = { attack: 'Attack', hp: 'HP', attackSpeed: 'Attack speed', critChance: 'Crit chance', critDamage: 'Crit damage' };

  function onLevel(e) {
    rosterStore.setCharacterLevel(e.currentTarget.value);
    setStatus('Level saved');
  }
  function onResidual(key, e) {
    const v = Number(e.currentTarget.value);
    if (Number.isFinite(v)) rosterStore.setBaseResidual({ [key]: v });
  }
  function setLevelOf(id, delta) {
    rosterStore.setSkillLevel(id, (character.skills[id] ?? 0) + delta);
  }
  function onOblivion(e) {
    rosterStore.setOblivionUnlocked(e.currentTarget.checked);
    rosterStore.reconcileSkillLevels();
  }
  function remapped(group) {
    return Object.entries(FORTRESS_BUFFS[group].combat).map(([stat, value]) => ({
      stat: remapFortressStat(character.class, stat),
      from: stat,
      value,
    }));
  }
</script>

{#if character}
  <section class="character-screen">
    <h2>Character</h2>

    <div class="panel summary">
      <div>
        <span class="micro-label">Class</span>
        <strong>{character.class ? classLabel(character.class) : 'No class'}</strong>
      </div>
      <label>
        <span class="micro-label">Level (1-{MAX_PLAYER_LEVEL})</span>
        <input type="number" min="1" max={MAX_PLAYER_LEVEL} value={character.level} onchange={onLevel} aria-label="Level" />
      </label>
      <label class="check">
        <input type="checkbox" checked={unlocked} onchange={onOblivion} aria-label="Oblivion unlocked" />
        <span>Oblivion unlocked</span>
      </label>
    </div>

    <h3 class="subheading">Skills</h3>
    <p class="hint">Level 0 means not bought. Skills unlock from level {SKILLS_UNLOCK_LEVEL}; the Oblivion point needs Oblivion unlocked.</p>
    <ul class="skills">
      {#each SKILLS as skill (skill.id)}
        {@const lvl = character.skills[skill.id] ?? 0}
        {@const cap = skillLevelCap(skill, unlocked)}
        {@const next = skillUpgradeCost(skill, lvl)}
        <li class="skill" data-skill={skill.id}>
          <span class="skill-name">{skill.name}</span>
          <span class="rank-controls">
            <button type="button" disabled={lvl <= 0} onclick={() => setLevelOf(skill.id, -1)} aria-label="Lower {skill.name}">&minus;</button>
            <span class="num" data-testid="level-{skill.id}">{lvl} / {cap}</span>
            <button type="button" disabled={lvl >= cap} onclick={() => setLevelOf(skill.id, 1)} aria-label="Raise {skill.name}">+</button>
          </span>
          <span class="muted">unlocks L{skill.unlockLevel}{character.level < skill.unlockLevel ? ' (locked)' : ''}</span>
          <span class="num muted">{lvl > 0 ? `effect ${skillEffect(skill, lvl)}` : 'effect -'}{next != null && lvl < cap ? `, next ${next} gems` : ''}</span>
        </li>
      {/each}
    </ul>

    <h3 class="subheading">Attunement bans</h3>
    <p class="hint">
      {bans.length} / {maxBans} slots (skill effect + class bonus {attunementBonus(character.class)}). Banned secondary stats
      are removed from the drop roll table.
    </p>
    <div class="chips">
      {#each bannableStats(character.class) as s (s.type)}
        <button
          type="button"
          class="btn-ghost chip"
          class:active={bans.includes(s.type)}
          aria-pressed={bans.includes(s.type)}
          disabled={!bans.includes(s.type) && bans.length >= maxBans}
          onclick={() => rosterStore.toggleAttunementBan(s.type)}>{s.label}</button
        >
      {/each}
    </div>

    <h3 class="subheading">Clan fortress</h3>
    <p class="hint">
      Owned buffs, character-wide. Top and Bottom are mutually exclusive. Combat stats are shown as remapped for
      {character.class ? classLabel(character.class) : 'this class'}.
    </p>
    <div class="fortress">
      {#each FORTRESS_GROUPS as group (group)}
        <div class="panel fortress-card" class:active={owned.includes(group)}>
          <label class="check">
            <input type="checkbox" checked={owned.includes(group)} onchange={() => rosterStore.toggleFortress(group)} aria-label="Fortress {group}" />
            <strong>{group}</strong>
          </label>
          <ul>
            {#each remapped(group) as r (r.from)}
              <li class="num">{r.stat}{r.stat !== r.from ? ` (was ${r.from})` : ''}: {r.value}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>

    <h3 class="subheading">Base residual</h3>
    <p class="hint">Tier-1 base stats. Defaults to the client's base values.</p>
    <div class="residual">
      {#each RESIDUAL_KEYS as key (key)}
        <label>
          <span class="micro-label">{RESIDUAL_LABELS[key]}</span>
          <input type="number" step="any" min="0" value={character.baseResidual[key]} onchange={(e) => onResidual(key, e)} aria-label={RESIDUAL_LABELS[key]} />
        </label>
      {/each}
    </div>
  </section>
{/if}

<style>
  .character-screen { padding-top: var(--space-4); display: grid; gap: var(--space-3); }
  .panel { background: var(--color-panel); border: 1px solid var(--color-border); padding: var(--space-3); }
  .summary { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; }
  .summary label, .residual label { display: grid; gap: var(--space-1); }
  .check { display: flex; align-items: center; gap: var(--space-2); }
  .hint, .muted { color: var(--color-muted); }
  .skills { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .skill { display: grid; grid-template-columns: 1fr auto; gap: var(--space-1) var(--space-3); align-items: center; background: var(--color-inset); border: 1px solid var(--color-border-hairline); padding: var(--space-2) var(--space-3); }
  .skill-name { font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chip.active { border-color: var(--color-gold); color: var(--color-gold-light); background: var(--color-gold-tint); }
  .fortress { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
  .fortress-card.active { border-color: var(--color-gold); }
  .fortress-card ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .residual { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3); }
</style>
