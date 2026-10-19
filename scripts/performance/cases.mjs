import warriorProfile from '../../src/lib/__fixtures__/real/profile-warrior-l73.json';
import sentinelProfile from '../../src/lib/__fixtures__/real/profile-sentinel-l85-oct15b.json';
import mageProfile from '../../src/lib/__fixtures__/real/profile-mystic-l50.json';
import { normaliseCharacter } from '../../src/lib/model/index.js';
import { gameProfileToCharacter } from '../../src/lib/model/gameProfile.js';
import { fixtureCharacter } from '../../src/lib/build/fixtures.js';
import { buildFighter } from '../../src/lib/build/fighter.js';
import { cloneAsOpponent } from '../../src/lib/features/duel.js';
import { resolveRosterPartner } from '../../src/lib/search/celestialObjective.js';
import { BLOCKS } from '../../src/lib/search/space.js';
import { prepareCelestialMember } from '../../src/lib/engine/pve/celestial.js';
import { initSpellRuntimes } from '../../src/lib/engine/core/spells.js';

const character = (profile) => {
  const c = normaliseCharacter(gameProfileToCharacter(profile, { now: '2026-10-19T00:00:00.000Z' }));
  // Import creates a fresh character ID; a partner reference contributes it to the search seed.
  c.id = `benchmark-${c.class}-${c.level}`;
  const active = c.presets.findIndex((p) => p.id === c.activePresetId);
  c.presets = c.presets.map((p, i) => ({ ...p, id: `benchmark-preset-${i}` }));
  c.activePresetId = c.presets[Math.max(0, active)].id;
  return c;
};
export function benchmarkCases(manifest) {
  const w = character(warriorProfile), s = character(sentinelProfile), m = character(mageProfile);
  w.opponents = [{ ...cloneAsOpponent(s, s.activePresetId, s.talentSets[s.presets[0].talentSet].spec, 'Benchmark opponent'), id: 'opponent' }];
  w.opponents[0].sheet.enteredAt = '2026-10-19T00:00:00.000Z';
  const tankId = w.presets.find((p) => p.name === 'TANK').id;
  const ref = { source: 'character', characterId: w.id, presetId: tankId };
  const partner = resolveRosterPartner(ref, [w]);
  const rows = [
    { name: 'warrior-dummy', character: w, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } },
    { name: 'warrior-dungeon', character: w, target: { kind: 'dungeon', id: 'dungeon_4', step: 1 }, objective: { kind: 'win-chance' } },
    { name: 'arena-winrate', character: w, target: { kind: 'pvp', opponentIds: ['opponent'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' } },
    { name: 'arena-influence', character: w, target: { kind: 'pvp', opponentIds: ['opponent'], seats: 'attacker' },
      objective: { kind: 'arena-reward', rank: 'INITIATE', position: 10, opponentPositions: { opponent: 7 } } },
    { name: 'fortress', character: w, target: { kind: 'fortressBoss', group: 'TOP', stars: 1, aliveDefenders: 0, server: 5, kills: 0 }, objective: { kind: 'dps' } },
    { name: 'mage-dummy', character: m, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } },
  ];
  for (const difficulty of ['NORMAL', 'HARD']) {
    rows.push({ name: `celestial-${difficulty}`, character: s, partner,
      target: { kind: 'celestial', difficulty, partner: ref }, objective: { kind: 'win-chance' } });
    for (const species of ['BATTLE_STANCE', 'GUARDIAN_STANCE']) {
      const stance = structuredClone(w);
      stance.presets.find((p) => p.id === tankId).utilitySigilSpecies = species;
      rows.push({ name: `celestial-${difficulty}-${species}`, character: s,
        partner: resolveRosterPartner(ref, [normaliseCharacter(stance)]),
        target: { kind: 'celestial', difficulty, partner: ref }, objective: { kind: 'win-chance' } });
    }
  }
  for (const cls of ['MYSTIC', 'NECROMANCER']) rows.push({ name: `synthetic-${cls}`, character: fixtureCharacter(cls), target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } });
  // A bounded, stratified set from each identity partition; sheets are opponents, never imported as complete characters.
  for (const partition of ['development', 'held-out']) {
    const byServer = new Map();
    for (const r of manifest.records ?? []) {
      if (r.partition !== partition || !['base', 'NORMAL', 'BASE'].includes(r.realm)) continue;
      if (!byServer.has(r.server)) byServer.set(r.server, []);
      byServer.get(r.server).push(r);
    }
    const profiles = [], groups = [...byServer.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows);
    for (let i = 0; groups.some((rows) => rows[i]) && profiles.length < 8; i++) for (const rows of groups) {
      if (rows[i] && profiles.length < 8) profiles.push(rows[i]);
    }
    for (const r of profiles) {
      const c = structuredClone(w); c.opponents = [{ ...r.opponent, id: 'opponent' }];
      rows.push({ name: `profile-${partition}-${r.identity.slice(0, 10)}`, partition, server: r.server, profileSpec: r.spec, profileLevel: r.level, character: c,
        target: { kind: 'pvp', opponentIds: ['opponent'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' } });
    }
  }
  return rows.map((row) => ({ ...row, presetId: row.character.activePresetId }));
}

export const benchmarkSpace = Object.fromEntries(BLOCKS.map((id) => [id, ['relics', 'pet'].includes(id)]));

/** Log/draw parity includes full timeout, transform expiry and replay callbacks. */
export function celestialParityCases() {
  const w = character(warriorProfile), s = character(sentinelProfile), m = character(mageProfile);
  const tankId = w.presets.find((p) => p.name === 'TANK').id;
  const tank = buildFighter(w, tankId), sentinel = buildFighter(s, s.activePresetId);
  const rows = [{ name: 'real-duo', party: [sentinel, tank] }, { name: 'mage-duo', party: [buildFighter(m, m.activePresetId), tank] }];
  for (const species of ['BATTLE_STANCE', 'GUARDIAN_STANCE']) {
    const c = structuredClone(w); c.presets.find((p) => p.id === tankId).utilitySigilSpecies = species;
    rows.push({ name: species, party: [sentinel, buildFighter(normaliseCharacter(c), tankId)] });
  }
  const timeout = [sentinel, tank].map((f) => ({ ...f, sigils: [], ancient: null, utility: null,
    stats: { ...f.stats, totalHp: 1e15, totalAttack: 100, totalHpRegen: 0, totalLifesteal: 0 } }));
  rows.push({ name: 'full-timeout', party: timeout, timeout: true });
  const prep = prepareCelestialMember(timeout[0]);
  const transform = { ...prep, fresh() {
    const state = prep.fresh();
    state.spells = initSpellRuntimes([{ species: 'BENCH_TRANSFORM', name: 'Boundary fixture',
      spell: { spellType: 'TRANSFORM', durationMs: 17000, effects: [{ stat: 'ATTACK_PERCENT', value: 20 }, { stat: 'HP_PERCENT', value: 10 }] } }]);
    Object.assign(state.spells[0], { isEffectActive: true, effectRemaining: 35, nextTickIn: 45 });
    state.chrono = { flux: 7000, flameConduit: 1000, earthenConduit: 1000, darkConduit: 0 };
    return state;
  } };
  rows.push({ name: 'transform-expiry', party: [transform], expires: true });
  return rows;
}
