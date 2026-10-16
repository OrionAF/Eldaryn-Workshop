<script>
  /**
   * CharacterSkillsPage.svelte - C2: account skills (ia.md §5.6), attunement bans and the clan
   * fortress. Skill caps and effects come from game/skills.js (skills.md §1-§3); the page stores
   * nothing but levels, bans and the owned fortress groups.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { classLabel, attunementBonus } from '../../lib/game/classes.js';
  import { SKILLS, skillLevelCap, skillEffect, skillUpgradeCost, SKILLS_UNLOCK_LEVEL } from '../../lib/game/skills.js';
  import { FORTRESS_BUFFS, remapFortressStat } from '../../lib/game/fortress.js';
  import { attunementMaxBans, bannableStats } from '../../lib/model/skills.js';
  import { fortressStatLabel, fortressStatValue } from '../character/fortressView.js';
  import { formatFlat } from '../../lib/format.js';
  import Panel from '../ui/Panel.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Radio from '../ui/Radio.svelte';
  import Button from '../ui/Button.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const maxBans = $derived(attunementMaxBans(character.skills, character.class));
  const bans = $derived(character.attunementBans ?? []);
  const owned = $derived(character.fortress?.owned ?? []);

  /** Gems still needed to take a skill from its level to its cap; level 0 counts from level 1 (the first buy is not in the catalogue). */
  function gemsToMax(skill, lvl, cap) {
    let sum = 0;
    for (let l = Math.max(1, lvl); l < cap; l++) sum += skillUpgradeCost(skill, l) ?? 0;
    return sum;
  }
  const rows = $derived(
    SKILLS.map((skill) => {
      const lvl = character.skills[skill.id] ?? 0;
      const cap = skillLevelCap(skill, unlocked);
      return {
        skill,
        lvl,
        cap,
        locked: character.level < skill.unlockLevel,
        now: lvl > 0 ? skillEffect(skill, lvl) : null,
        next: lvl < cap ? skillEffect(skill, lvl + 1) : null,
        cost: lvl < cap ? skillUpgradeCost(skill, lvl) : null,
        toMax: gemsToMax(skill, lvl, cap),
      };
    }),
  );
  const totalToMax = $derived(rows.reduce((n, r) => n + r.toMax, 0));

  const banTitle = (s) =>
    !bans.includes(s.type) && bans.length >= maxBans
      ? `All ${maxBans} ban slots are used. Slots come from the Attunement skill plus a class bonus of ${attunementBonus(character.class)}.`
      : 'A banned secondary stat can no longer appear on drops.';

  function remapped(group) {
    return Object.entries(FORTRESS_BUFFS[group].combat).map(([stat, value]) => ({
      stat: remapFortressStat(character.class, stat),
      from: stat,
      value,
    }));
  }
  const side = $derived(owned.includes('TOP') ? 'TOP' : owned.includes('BOTTOM') ? 'BOTTOM' : '');
  function pickSide(group) {
    if (!owned.includes(group)) rosterStore.toggleFortress(group);
  }
  function clearSide() {
    if (side) rosterStore.toggleFortress(side);
  }
</script>

{#if character}
  <div class="skills-page">
    <Panel title="Skills">
      <p class="note">Level 0 means not bought. Skills unlock from level {SKILLS_UNLOCK_LEVEL}; the Oblivion point needs Oblivion unlocked.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col">Level</th>
              <th scope="col" class="r">Cap</th>
              <th scope="col" class="r">Effect now → next</th>
              <th scope="col" class="r">Next gems</th>
              <th scope="col" class="r">Gems to max</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.skill.id)}
              <tr data-skill={r.skill.id}>
                <th scope="row">
                  {r.skill.name}
                  {#if r.locked}<span class="muted">(unlocks L{r.skill.unlockLevel})</span>{/if}
                </th>
                <td>
                  <span class="level-cell">
                    <Stepper label={r.skill.name} value={r.lvl} min={0} max={r.cap} onchange={(n) => rosterStore.setSkillLevel(r.skill.id, n)} />
                    <span class="num" data-testid="level-{r.skill.id}">{r.lvl} / {r.cap}</span>
                  </span>
                </td>
                <td class="r num">{r.cap}</td>
                <td class="r num">{r.now ?? '-'} → {r.next ?? 'max'}</td>
                <td class="r num">{r.cost != null ? formatFlat(r.cost) : '-'}</td>
                <td class="r num">{r.toMax > 0 ? formatFlat(r.toMax) : '-'}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="5">Total gems to max everything (from level 1)</th>
              <td class="r num" data-testid="gems-total">{formatFlat(totalToMax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>

    <Panel title="Attunement">
      <p class="note">
        {bans.length} / {maxBans} ban slots (from the Attunement skill plus a class bonus of {attunementBonus(character.class)}). A banned
        secondary stat can no longer appear on drops.
      </p>
      <div class="chips">
        {#each bannableStats(character.class) as s (s.type)}
          {@const on = bans.includes(s.type)}
          {@const blocked = !on && bans.length >= maxBans}
          <button
            type="button"
            class="chip"
            class:on
            aria-pressed={on}
            aria-disabled={blocked ? 'true' : undefined}
            title={banTitle(s)}
            onclick={() => !blocked && rosterStore.toggleAttunementBan(s.type)}>{s.label}</button
          >
        {/each}
      </div>
    </Panel>

    <Panel title="Clan fortress">
      <p class="note">
        Buffs you own, shared by all presets. You can own Top or Bottom, not both; Core works with either. Combat stats are shown as
        {character.class ? classLabel(character.class) : 'this class'} receives them.
      </p>
      <div class="fortress">
        <fieldset class="side">
          <legend>Wall</legend>
          {#each ['TOP', 'BOTTOM'] as group (group)}
            <Radio name="fortress-side" value={group} label={group} ariaLabel="Fortress {group}" checked={owned.includes(group)} onchange={pickSide} />
          {/each}
          <Button variant="ghost" size="small" disabled={!side} onclick={clearSide}>Neither</Button>
        </fieldset>
        <Checkbox checked={owned.includes('CORE')} label="Fortress CORE" onchange={() => rosterStore.toggleFortress('CORE')} />
      </div>
      <div class="buffs">
        {#each ['TOP', 'BOTTOM', 'CORE'] as group (group)}
          <div class="buff" class:active={owned.includes(group)}>
            <h3 class="buff-label">{group}</h3>
            <ul>
              {#each remapped(group) as r (r.from)}
                <li>
                  <span>{fortressStatLabel(r.stat)}{#if r.stat !== r.from}<span class="muted"> (was {fortressStatLabel(r.from)})</span>{/if}</span>
                  <span class="num">{fortressStatValue(r.stat, r.value)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </Panel>
  </div>
{/if}

<style>
  .skills-page { display: grid; gap: var(--sp-4); }
  .note { margin: 0 0 var(--sp-3); color: var(--text-soft); font-size: var(--fs-13); }
  .muted { color: var(--text-muted); font-weight: var(--fw-regular, 400); }
  /* On a phone the table scrolls inside its panel instead of being clipped; cells stay on one line so the Cap
     column and a level like "8 / 10" are never cut or wrapped. */
  .table-wrap { overflow-x: auto; max-width: 100%; }
  table { width: 100%; min-width: 44rem; border-collapse: collapse; font-size: var(--fs-13); }
  th, td { padding: var(--sp-2) var(--sp-3); text-align: left; border-bottom: 1px solid var(--line-rule); vertical-align: middle; white-space: nowrap; }
  thead th {
    color: var(--text-soft);
    font-size: var(--fs-11);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
  }
  tbody th { font-weight: var(--fw-bold, 700); }
  tfoot th { color: var(--text-soft); }
  .r { text-align: right; }
  .level-cell { display: inline-flex; align-items: center; gap: var(--sp-2); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .chip {
    min-height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-3);
    color: var(--text-soft);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    cursor: pointer;
  }
  .chip.on { border-color: var(--brass-500); color: var(--text-ink); background: var(--surface-4); }
  .chip[aria-disabled='true'] { color: var(--text-disabled); cursor: not-allowed; }
  .fortress { display: flex; flex-wrap: wrap; gap: var(--sp-6); align-items: center; margin-bottom: var(--sp-3); }
  .side { border: 0; padding: 0; margin: 0; display: flex; gap: var(--sp-4); align-items: center; }
  .side legend { float: left; margin-right: var(--sp-3); color: var(--text-soft); font-size: var(--fs-12); font-weight: var(--fw-bold, 700); }
  .buffs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr)); gap: var(--sp-3); }
  .buff { background: var(--surface-3); border: 1px solid var(--line-rule); border-radius: var(--r-1); padding: var(--sp-3); }
  .buff.active { border-color: var(--brass-500); }
  .buff-label {
    margin: 0 0 var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .buff ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-1); }
  .buff li { display: flex; justify-content: space-between; gap: var(--sp-2); }
</style>
