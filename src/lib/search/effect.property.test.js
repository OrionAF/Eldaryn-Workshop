// H3 property: engineKey soundness and completeness (redesign plan A.5, invariant I2).
//   sound     a perturbation of a Fighter that leaves engineKey unchanged gives bit-identical fights
//             on 16 seeds (PVE and PVP), so merging builds by key can never merge different builds
//   complete  every Fighter field the engine reads changes the key when perturbed
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, int, float, chance } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { statToEntity } from '../harness/statEntity.js';
import { buildFighter } from '../build/fighter.js';
import { engineKey } from './effect.js';
import { simulatePve, trainingDummy, PVE_PLAYER_KEYS } from '../engine/pve/fight.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { fightRng } from '../engine/rng.js';
import { stableStringify } from '../engine/metrics.js';

const SEEDS = Array.from({ length: 16 }, (_, i) => 1000 + i);
const fighterOf = (character, sr) => buildFighter(character, character.activePresetId, { realm: sr.realm });
const keyOf = (f, mode) => {
  try {
    return engineKey(f, mode);
  } catch {
    return null; // a fighter that cannot fight has no key
  }
};
// a mob that hits back, so the defensive stats are exercised too
const mob = () => ({ ...trainingDummy(2e5), attack: 400, attackSpeed: 1, damageReduction: 0.05, blockChance: 0.05, penetration: 0.05 });
const pve = (f, seed) => stableStringify(simulatePve({ fighter: f, enemy: mob(), maxMs: 6000, rng: fightRng(seed, 0) }));
const opponent = {};
const pvp = (f, seed) => stableStringify(runDuel({ attacker: f, defender: opponent.f, rng: fightRng(seed, 0) }));

/** One random single-field perturbation of a Fighter. Returns {fighter, what} (a copy). */
function perturb(f, rng) {
  const g = structuredClone(f);
  const r = rng();
  if (r < 0.45) {
    const key = pick(rng, Object.keys(g.stats).filter((k) => typeof g.stats[k] === 'number'));
    g.stats[key] = chance(rng, 0.5) ? g.stats[key] * float(rng, 0.5, 1.5) + 1 : g.stats[key] + int(rng, 1, 9);
    return { fighter: g, what: `stats.${key}` };
  }
  if (r < 0.6) {
    const key = `totalUnread${int(rng, 0, 9)}`;
    g.stats[key] = float(rng, 1, 100);
    return { fighter: g, what: `stats.${key} (added)` };
  }
  if (r < 0.7) {
    g.level = (g.level ?? 1) + int(rng, 1, 30);
    return { fighter: g, what: 'level' };
  }
  if (r < 0.78) {
    g.presetId = `${g.presetId}-x`;
    return { fighter: g, what: 'presetId' };
  }
  if (r < 0.84) {
    g.source = g.source === 'sheet' ? 'computed' : 'sheet';
    return { fighter: g, what: 'source' };
  }
  if (r < 0.9) {
    g.altarTier = int(rng, 1, 8);
    return { fighter: g, what: 'altarTier' };
  }
  const slots = ['sigils', 'utility', 'ancient'].flatMap((k) => (Array.isArray(g[k]) ? g[k].map((s, i) => [k, i, s]) : g[k] ? [[k, null, g[k]]] : []));
  if (slots.length) {
    const [k, i, s] = pick(rng, slots);
    s.level = (s.level ?? 1) + int(rng, 1, 5);
    return { fighter: g, what: `${k}${i == null ? '' : `[${i}]`}.level` };
  }
  g.stats.totalHp *= 1.1;
  return { fighter: g, what: 'stats.totalHp' };
}

describe('engineKey property', () => {
  it('soundness: a perturbation that leaves the key unchanged gives bit-identical fights on 16 seeds', () => {
    const unchanged = { pve: new Set(), pvp: new Set() };
    let changed = 0;
    forAll('effect-sound', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      const character = arbCharacter(rng, { spec: sr });
      const base = fighterOf(character, sr);
      return { sr, base, ...perturb(base, rng) };
    }, ({ base, fighter, what }) => {
      opponent.f ??= buildFighter(arbCharacter(() => 0.5), undefined, { realm: 'base' });
      for (const mode of ['pve', 'pvp']) {
        const k0 = keyOf(base, mode);
        const k1 = keyOf(fighter, mode);
        if (k0 == null || k1 == null) continue;
        if (k0 !== k1) { changed += 1; continue; }
        unchanged[mode].add(what.replace(/\[\d+\]/, '').replace(/\.totalUnread\d/, '.totalUnread'));
        const run = mode === 'pve' ? pve : pvp;
        for (const seed of SEEDS) expect(run(fighter, seed), `${mode} ${what} seed ${seed}: same key, different fight`).toBe(run(base, seed));
      }
    }, { runs: 60 });
    expect(unchanged.pve.size, 'no PVE perturbation left the key unchanged').toBeGreaterThan(0);
    expect(unchanged.pvp.size, 'no PVP perturbation left the key unchanged').toBeGreaterThan(0);
    expect(changed, 'no perturbation changed a key').toBeGreaterThan(0);
  });

  it('completeness: every stat the engine reads changes the key when perturbed', () => {
    const readByPve = Object.keys(statToEntity).filter((s) => statToEntity[s].some((k) => PVE_PLAYER_KEYS.includes(k)));
    expect(readByPve.length).toBeGreaterThan(10);
    const seen = { pve: new Set(), pvp: new Set() };
    forAll('effect-complete', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      return { sr, fighter: fighterOf(arbCharacter(rng, { spec: sr }), sr), factor: float(rng, 0.2, 0.8) };
    }, ({ fighter, factor }) => {
      for (const stat of Object.keys(statToEntity)) {
        const g = structuredClone(fighter);
        // downwards: an upward step could be clamped by the combat ceiling and read the same
        g.stats[stat] = (g.stats[stat] ?? 0) > 0 ? g.stats[stat] * factor : 5;
        if (readByPve.includes(stat)) {
          expect(keyOf(g, 'pve'), `pve key ignores ${stat}`).not.toBe(keyOf(fighter, 'pve'));
          seen.pve.add(stat);
        }
        expect(keyOf(g, 'pvp'), `pvp key ignores ${stat}`).not.toBe(keyOf(fighter, 'pvp'));
        seen.pvp.add(stat);
      }
    }, { runs: 12 });
    expect(seen.pve.size).toBe(readByPve.length);
    expect(seen.pvp.size).toBe(Object.keys(statToEntity).length);
  });

  it('sigil levels: a spell-bearing sigil changes the key, a passive-only one changes neither key nor fight', () => {
    let moved = 0;
    let inert = 0;
    forAll('effect-sigil-levels', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      return { fighter: fighterOf(arbCharacter(rng, { spec: sr }), sr), bump: int(rng, 3, 9) };
    }, ({ fighter, bump }) => {
      opponent.f ??= buildFighter(arbCharacter(() => 0.5), undefined, { realm: 'base' });
      const slots = [...fighter.sigils, fighter.utility, fighter.ancient].filter(Boolean);
      for (const mode of ['pve', 'pvp']) {
        const run = mode === 'pve' ? pve : pvp;
        for (const s of slots) {
          const g = structuredClone(fighter);
          [...g.sigils, g.utility, g.ancient].find((x) => x?.species === s.species).level += bump;
          if (keyOf(g, mode) !== keyOf(fighter, mode)) { moved += 1; continue; }
          inert += 1;
          for (const seed of SEEDS.slice(0, 4)) expect(run(g, seed), `${mode} ${s.species} level: same key, different fight`).toBe(run(fighter, seed));
        }
      }
    }, { runs: 25 });
    expect(moved, 'no sigil level changed a key').toBeGreaterThan(0);
    expect(inert, 'no sigil level left the key unchanged').toBeGreaterThan(0);
  });
});
