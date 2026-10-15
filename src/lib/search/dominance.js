// search/dominance.js (backlog §16): exact dominance between the values of one block visit. The rules, and the
// argument that makes them exact, are in docs/Reference/simulation.md §Build space (Dominance).
//
// A value is dominated when another value of the same visit (or the incumbent) gives the engine the same inputs
// apart from the stats, and matches or beats it on every stat the fight reads. Stats are read from the engine's
// own inputs (preparePveFighter / fighterDuelArgs / fortressPlayerDuelArgs), so a stat the engine ignores in a mode
// never blocks a prune.
import { preparePveFighter } from '../engine/pve/fight.js';
import { fighterDuelArgs } from '../engine/pvp/resolver.js';
import { fortressPlayerDuelArgs, fortressBossDuelArgs, FORTRESS_FIGHT_RULES } from '../engine/pve/fortressBoss.js';
import { stableStringify } from '../engine/metrics.js';
import { sigilBySpecies } from '../game/sigils.js';
import { enemyDealsDamage } from './objectives.js';

/** Inputs compared for equality, never as "more is better" (Chrono Flux timing, Dominion, Oblivion power). */
const EQUAL_KEYS = new Set([
  'totalFlameConduit', 'totalEarthenConduit', 'totalDarkConduit', 'totalDominion', 'totalOblivionPower',
]);

/**
 * Stats that only lower the damage the player (or its minion) takes or heal it. They cannot change the damage
 * dealt to a target that never hurts the player, so a damage-only comparison drops them.
 */
const DEFENSIVE_KEYS = new Set([
  // PVE player entity (preparePveFighter inputs.player)
  'maxHp', 'lifesteal', 'hpRegen', 'damageReduction', 'blockChance', 'missChance', 'blindChance', 'paralyzeChance',
  'disruptionChance', 'spellResist', 'spellVamp',
  // duel stats (fighterDuelArgs stats)
  'totalHp', 'pvpBaseHp', 'totalHealthPercent', 'totalLifesteal', 'totalHpRegen', 'totalDamageReduction',
  'totalBlockChance', 'totalMissChance', 'totalBlindChance', 'totalParalyzeChance', 'totalDisruptionChance',
  'totalSpellResist', 'totalSpellVamp', 'totalPvpDefense',
  // minion survival (both shapes)
  'totalMinionHealth', 'totalMinionLifesteal', 'totalSoulLink',
]);

/**
 * Stats that lower the hits a fighter takes or the damage of those hits. While a thorns source is active they can
 * lower the thorns dealt (Game/combat-pve.md §11, combat-pvp.md §9), so they are compared for equality then.
 */
const HIT_TAKEN_KEYS = new Set([
  'damageReduction', 'blockChance', 'missChance', 'blindChance', 'paralyzeChance', 'disruptionChance', 'spellResist',
  'totalDamageReduction', 'totalBlockChance', 'totalMissChance', 'totalBlindChance', 'totalParalyzeChance',
  'totalDisruptionChance', 'totalSpellResist', 'totalPvpDefense',
]);

/** Spell fields that only heal or defend: a spell made of nothing else is a defensive spell. */
const HEAL_FIELDS = new Set(['healPercentPerTick', 'tickIntervalMs', 'durationMs', 'cooldownMs', 'instant', 'refillsShield', 'healsMinion']);
const BUFF_FIELDS = new Set(['effects', 'durationMs', 'cooldownMs']);
const DEFENSIVE_EFFECTS = new Set([
  'HP_PERCENT', 'DAMAGE_REDUCTION', 'BLOCK_CHANCE', 'MISS_CHANCE', 'HP_REGEN', 'LIFESTEAL', 'SPELL_RESIST', 'SPELL_VAMP',
  'BLIND_CHANCE',
]);
const SAFE_CONDITION = (c) => c == null || c === 'ON_COOLDOWN' || /^ENEMY_HP_BELOW_/.test(c);

/** A combat spell entry that only heals the player or raises its defences (no damage, CC, thorns, minion or stat-for-damage effect). */
export function isDefensiveSpell(entry) {
  const sp = entry?.spell;
  if (!sp) return false;
  const keys = Object.keys(sp).filter((k) => k !== 'spellType');
  if (sp.spellType === 'HEAL') return keys.every((k) => HEAL_FIELDS.has(k));
  if (sp.spellType === 'BUFF') {
    return keys.every((k) => BUFF_FIELDS.has(k)) && (sp.effects ?? []).length > 0 && sp.effects.every((e) => DEFENSIVE_EFFECTS.has(e.stat));
  }
  return false;
}

/** Whether a sigil species carries a thorns effect anywhere in its catalogue entry (Bulwark of Thorns, Primal Instinct, Primal Retribution). */
const speciesThorns = new Map();
function speciesHasThorns(sp) {
  if (!sp) return false;
  if (!speciesThorns.has(sp)) speciesThorns.set(sp, /thorns/i.test(JSON.stringify(sigilBySpecies(sp) ?? {})));
  return speciesThorns.get(sp);
}

/**
 * Whether a Fighter fights with a thorns source: a sigil whose entry has thorns, the Iron Bastion glyph's thorns,
 * or a running spell with thorns. A fighter whose duel arguments cannot be built counts as having one (the safe side).
 */
export function fighterHasThorns(fighter) {
  if (!fighter) return false;
  try {
    const species = [...(fighter.sigils ?? []), fighter.utility, fighter.ancient].filter(Boolean).map((s) => s.species);
    if (species.some(speciesHasThorns)) return true;
    const args = fighterDuelArgs(fighter);
    if ((args.glyphCombat?.ironBastionThornsPercent ?? 0) > 0) return true;
    return (args.spells ?? []).some((s) => (s.spell?.thornsPercent ?? 0) > 0);
  } catch {
    return true;
  }
}

/**
 * What a target lets dominance assume, read once per run from the resolved target (objectives.js resolveTarget).
 *  - `harmless`: a PVE target that never damages the player (enemyDealsDamage false: the training dummy, a custom
 *    mob with no attack, World Boss NONE / FORTIFIED);
 *  - `fortressMaxDamage`: the most the Fortress boss can deal in its window (every swing at the top of its damage
 *    range, one swing more than the window holds; it has no crit, double hit or spell), else null;
 *  - `otherThorns`: 'enemy' when an opponent fights with a thorns source (more attack can then cost HP: no stat is
 *    "more is better"), 'ally' when the Celestial partner does (hit-taken stats compared for equality), else null.
 */
export function dominanceContextOf(target, mode) {
  const ctx = { harmless: false, fortressMaxDamage: null, otherThorns: null };
  if (!target) return ctx;
  if (target.kind === 'fortressBoss') {
    const { stats } = fortressBossDuelArgs(target.spec.group);
    const interval = Math.round(1000 / stats.totalAttackSpeed);
    const swings = Math.floor((target.maxMs ?? 60000) / interval) + 1;
    ctx.fortressMaxDamage = swings * Math.round(stats.totalAttack * (1 + FORTRESS_FIGHT_RULES.bossDamageVariance));
  } else if (mode === 'pve' && target.enemy && !target.partner && target.kind !== 'celestial') {
    ctx.harmless = !enemyDealsDamage(target.enemy);
  }
  if ((target.opponents ?? []).some((o) => fighterHasThorns(o.fighter))) ctx.otherThorns = 'enemy';
  else if (target.partner?.fighter && fighterHasThorns(target.partner.fighter)) ctx.otherThorns = 'ally';
  return ctx;
}

const numericSplit = (obj) => {
  const stats = {};
  const rest = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (typeof v === 'number' && !EQUAL_KEYS.has(k)) stats[k] = v;
    else rest[k] = v;
  }
  return { stats, rest };
};

/**
 * The engine's view of one Fighter, split into the stat vector (more is better) and the rest (must be equal),
 * plus the facts the damage-only and thorns rules check. Throws EngineInputError like the engine would.
 */
export function engineView(fighter, mode) {
  if (mode === 'pve') {
    const { inputs } = preparePveFighter(fighter);
    const { player, minionStats, ...other } = inputs;
    const p = numericSplit(player);
    const stats = { ...p.stats, ...Object.fromEntries(Object.entries(minionStats).map(([k, v]) => [`minion.${k}`, v])) };
    const rest = { ...other, player: p.rest, oblivionPower: fighter.realm === 'oblivion' ? Math.round(Number(fighter.stats?.totalOblivionPower) || 0) : null };
    const thorns = (inputs.thornsPercent ?? 0) > 0 || inputs.spells.some((s) => (s.spell?.thornsPercent ?? 0) > 0)
      || (inputs.stack.equipped ?? []).some((e) => speciesHasThorns(typeof e === 'string' ? e : e?.species));
    return {
      stats, rest, thorns, spells: inputs.spells, summon: !!inputs.summon, hp: player.maxHp,
      fluxFromHits: (inputs.conduits.earthen + inputs.conduits.dark) > 0, equippedKey: 'stack',
    };
  }
  const args = mode === 'fortress' ? fortressPlayerDuelArgs(fighter) : fighterDuelArgs(fighter);
  const { stats: s, ...other } = args;
  const p = numericSplit(s);
  const thorns = (args.glyphCombat?.ironBastionThornsPercent ?? 0) > 0 || (args.spells ?? []).some((x) => (x.spell?.thornsPercent ?? 0) > 0)
    || (mode !== 'fortress' && (args.equipped ?? []).some(speciesHasThorns));
  return {
    stats: p.stats, rest: { ...other, stats: p.rest }, thorns, spells: args.spells ?? [], summon: !!args.summon, hp: s.totalHp,
    fluxFromHits: ((s.totalEarthenConduit ?? 0) + (s.totalDarkConduit ?? 0)) > 0, equippedKey: 'equipped',
  };
}

/**
 * Whether the damage-only comparison holds for this view under the context: the target never hurts the player,
 * or (Fortress) the player's HP exceeds the boss's maximum window damage with no thorns, no minion for the boss
 * to hit, no Chrono Flux charged by hits taken while a transform runs, and no damage-side spell gated on the
 * player's own HP.
 */
export function damageOnly(view, ctx) {
  if (ctx.harmless) return true;
  if (ctx.fortressMaxDamage == null || ctx.otherThorns) return false;
  if (!(view.hp > ctx.fortressMaxDamage) || view.thorns || view.summon) return false;
  if (view.fluxFromHits && view.spells.some((s) => s.spell?.spellType === 'TRANSFORM')) return false;
  return view.spells.every((s) => isDefensiveSpell(s) || SAFE_CONDITION(s.activationCondition));
}

/** The view projected to the attacking side: defensive stats, defensive spells (and their species) and the shield dropped. */
function projectDamageOnly(view) {
  const stats = Object.fromEntries(Object.entries(view.stats).filter(([k]) => !DEFENSIVE_KEYS.has(k)));
  const dropped = new Set(view.spells.filter(isDefensiveSpell).map((s) => s.species));
  const rest = { ...view.rest, spells: view.spells.filter((s) => !isDefensiveSpell(s)), shield: null };
  if (view.equippedKey === 'stack') rest.stack = { ...rest.stack, equipped: (rest.stack.equipped ?? []).filter((e) => !dropped.has(typeof e === 'string' ? e : e?.species)) };
  else rest.equipped = (rest.equipped ?? []).filter((sp) => !dropped.has(sp));
  if (rest.player) rest.player = { ...rest.player };
  return { stats, rest };
}

/**
 * The comparison form of a view: `{restKey, stats, eq}` where `stats` are compared as "more is better" and `eq`
 * holds the stats compared for equality (hit-taken stats while a thorns source is active; every stat while an
 * enemy has one).
 */
export function comparisonForm(view, ctx, { projected }) {
  const base = projected ? projectDamageOnly(view) : { stats: view.stats, rest: view.rest };
  const strict = ctx.otherThorns === 'enemy';
  const thorns = !projected && (view.thorns || ctx.otherThorns === 'ally');
  const stats = {};
  const eq = {};
  for (const [k, v] of Object.entries(base.stats)) {
    if (strict || (thorns && HIT_TAKEN_KEYS.has(k))) eq[k] = v;
    else stats[k] = v;
  }
  return { restKey: stableStringify({ rest: base.rest, eq, projected }), stats, thorns };
}

/** a matches or beats b on every stat (both forms come from the same rest key, so the keys agree). */
export function geStats(a, b) {
  for (const k of Object.keys(b)) if (!((a[k] ?? 0) >= b[k])) return false;
  for (const k of Object.keys(a)) if (!(k in b) && !(a[k] >= 0)) return false;
  return true;
}

/**
 * The Pareto filter of one visit. `items` are `{value, view}` (view null when the value cannot fight: it is kept
 * and never dominates); `incumbent` is the visit's own view. A value is dropped when the incumbent or another value
 * dominates it; of exact twins the incumbent, else the first in order, is kept. Two values compare damage-only
 * when both pass `damageOnly`, else on every stat.
 * @returns {{kept: Array<*>, pruned: Array<{value: *, by: *|null}>}}  `by` null when the incumbent dominates
 */
export function paretoFilter(items, incumbent, ctx) {
  const all = [{ value: null, view: incumbent, incumbent: true }, ...items.map((x) => ({ ...x, incumbent: false }))];
  for (const x of all) {
    if (!x.view) continue;
    x.dmgOnly = damageOnly(x.view, ctx);
    x.full = comparisonForm(x.view, ctx, { projected: false });
    x.proj = x.dmgOnly ? comparisonForm(x.view, ctx, { projected: true }) : null;
  }
  const kept = [];
  const pruned = [];
  for (let i = 1; i < all.length; i++) {
    const me = all[i];
    if (!me.view) {
      kept.push(me.value);
      continue;
    }
    let by;
    for (let j = 0; j < all.length && by === undefined; j++) {
      if (j === i || !all[j].view) continue;
      const o = all[j];
      const [fa, fb] = me.dmgOnly && o.dmgOnly ? [o.proj, me.proj] : [o.full, me.full];
      if (fa.restKey !== fb.restKey || !geStats(fa.stats, fb.stats)) continue;
      // an exact twin is dropped only in favour of the incumbent or an earlier value (so one of the twins stays)
      if (geStats(fb.stats, fa.stats) && !(o.incumbent || j < i)) continue;
      by = o.incumbent ? null : o.value;
    }
    if (by === undefined) kept.push(me.value);
    else pruned.push({ value: me.value, by });
  }
  return { kept, pruned };
}
