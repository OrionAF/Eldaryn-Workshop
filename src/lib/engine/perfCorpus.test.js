// E5 golden corpus: the engine's outcomes, hashed. Every spec of the harness (the Druid three ways) fights
// every kind of fight the app simulates, 24 seeded fights each, and the full outcome vectors are hashed.
// The expected hashes were recorded from the engine before the speed pass, so a speed change that moves
// any draw, rounding or float result fails here. Fight 0 of each case is also run with the event log on
// and its log hashed, which pins the logging path the traces read.
// Re-record (only for an intended behaviour change): PERF_CORPUS_PRINT=1 npx vitest run src/lib/engine/perfCorpus.test.js
import { describe, it, expect } from 'vitest';
import { HARNESS_SPECS } from '../harness/specs.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import profile from '../__fixtures__/real/profile-warrior-l72.json';
import { buildFighter } from '../build/fighter.js';
import { resolveTarget } from '../search/objectives.js';
import { preparePveFighter, simulatePve, trainingDummy } from './pve/fight.js';
import { runDuel, fighterDuelArgs } from './pvp/resolver.js';
import { fightRng, hashSeed } from './rng.js';

const FIGHTS = 24;
const SEED = 20261015;

// the harness fixture of a spec: the Druid gets its Form sigil (or none) in the utility slot
function characterOf(spec) {
  const c = fixtureCharacter(spec.cls, { spec: spec.key });
  if (spec.key === 'MYSTIC_DRUID') {
    if (spec.utility) c.sigils.owned[spec.utility] = { level: 1 };
    for (const p of c.presets) p.utilitySigilSpecies = spec.utility;
  }
  return normaliseCharacter(c);
}

// the PVE fights, as the optimiser's sampler runs them (objectives.js pveSampler)
const PVE_TARGETS = [
  { name: 'dummy', raw: { kind: 'dummy', seconds: 60 }, dps: true },
  { name: 'chapter', raw: { kind: 'chapter', chapter: 6, level: 5 } },
  { name: 'dungeon', raw: { kind: 'dungeon', id: 'dungeon_3', step: 4 } },
  { name: 'dungeon-hard', raw: { kind: 'dungeon', id: 'dungeon_2_hard', step: 1 } },
  { name: 'raid', raw: { kind: 'raid', id: 'raid_2', step: 3 } },
  // floor 4: strain fully offset by Oblivion Power (sustain cap only); floor 6: instability pulses, output cut on
  { name: 'oblivion', raw: { kind: 'oblivion', floor: 4 }, realm: 'oblivion' },
  { name: 'oblivion-cut', raw: { kind: 'oblivion', floor: 6, applyOutputCut: true }, realm: 'oblivion' },
  { name: 'worldBoss', raw: { kind: 'worldBoss', affinity: 'ENRAGED' } },
];

const unkillable = (mob) => (Array.isArray(mob) ? mob.map(unkillable) : { ...mob, hp: Math.max(mob.hp, trainingDummy().hp) });

// FNV-1a over a string, as 8 hex digits
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const PVE_FIELDS = ['won', 'timeMs', 'damageDealt', 'damageTaken', 'hpLeft', 'enemyHpLeft', 'mobsDefeated', 'timedOut', 'mode'];
const DUEL_FIELDS = ['attackerWon', 'timeMs', 'timedOut', 'attackerHpLeft', 'defenderHpLeft', 'attackerMaxHp', 'defenderMaxHp'];
const pick = (r, keys) => keys.map((k) => r[k]);

function pveCase(fighter, t) {
  const target = resolveTarget(t.raw);
  const enemy = t.dps ? unkillable(target.enemy) : target.enemy;
  const opts = t.raw.kind === 'oblivion'
    ? { ...target.opts, oblivion: { power: fighter.stats?.totalOblivionPower ?? 0 } } : target.opts;
  const prepared = preparePveFighter(fighter);
  const rows = [];
  for (let i = 0; i < FIGHTS; i++) {
    rows.push(pick(simulatePve({ fighter: prepared, enemy, maxMs: target.maxMs, rng: fightRng(SEED, i), ...opts }), PVE_FIELDS));
  }
  const logged = simulatePve({ fighter: prepared, enemy, maxMs: target.maxMs, rng: fightRng(SEED, 0), log: true, ...opts });
  return { rows, log: logged.log };
}

function duelCase(me, them, seat) {
  const rows = [];
  const run = (rng, log) => (seat === 'attacker'
    ? runDuel({ attacker: me, defender: them, rng, log }) : runDuel({ attacker: them, defender: me, rng, log }));
  for (let i = 0; i < FIGHTS; i++) rows.push(pick(run(fightRng(hashSeed(SEED, seat), i), false), DUEL_FIELDS));
  return { rows, log: run(fightRng(hashSeed(SEED, seat), 0), true).log };
}

// every case of every character: { key: [outcomesHash, logHash] }
function corpus(c, opponent) {
  const base = buildFighter(c, c.activePresetId, { realm: 'base' });
  const obl = buildFighter(c, c.activePresetId, { realm: 'oblivion' });
  const out = {};
  for (const t of PVE_TARGETS) {
    const r = pveCase(t.realm === 'oblivion' ? obl : base, t);
    out[t.name] = [fnv(JSON.stringify(r.rows)), fnv(JSON.stringify(r.log))];
  }
  const me = fighterDuelArgs(base);
  for (const seat of ['attacker', 'defender']) {
    const r = duelCase(me, opponent, seat);
    out[`pvp-${seat}`] = [fnv(JSON.stringify(r.rows)), fnv(JSON.stringify(r.log))];
  }
  return out;
}

// E5 baseline, with intended 2.7.4 PvP cast-lockout outcomes refreshed after focused recovery/effect tests,
// and the raid outcomes refreshed for the group fight (every living raid mob swings; combat-pve.md §21).
const EXPECTED = {
  'WARRIOR_DPS': {
    dummy: ['bb77d251', 'a7012e87'],
    chapter: ['f790da26', '5165b213'],
    dungeon: ['7bd782e6', '72f8b291'],
    'dungeon-hard': ['442cffdb', 'c4b0f4ff'],
    raid: ['dc07e197', 'dd6eecdb'],
    oblivion: ['c597b315', '722cea39'],
    'oblivion-cut': ['052ffe4b', 'fc3e2f4c'],
    worldBoss: ['3d77c538', '3911e0f2'],
    'pvp-attacker': ['73a7a0d0', 'f61caea5'],
    'pvp-defender': ['fc7d1739', 'd4ca75c5'],
  },
  'WARRIOR_TANK': {
    dummy: ['4551ff8b', '815411f3'],
    chapter: ['b2aec773', 'e610f7a9'],
    dungeon: ['fd8d264e', '6b01bd99'],
    'dungeon-hard': ['b0b36bc3', '608fd01d'],
    raid: ['56905ee9', '139c7578'],
    oblivion: ['93e1573e', '47e5c980'],
    'oblivion-cut': ['34d442d0', '51e31852'],
    worldBoss: ['98842ade', 'e1fa8e0c'],
    'pvp-attacker': ['530c4db5', '4e930b4c'],
    'pvp-defender': ['da530795', '370827fe'],
  },
  'SENTINEL_MARKSMANSHIP': {
    dummy: ['2ec396b4', 'a2f3a3b6'],
    chapter: ['e37539c7', '9ad135b3'],
    dungeon: ['8fb698cf', '0cad7630'],
    'dungeon-hard': ['bd294ccd', '55ebc6e1'],
    raid: ['47e65ef1', '08c34107'],
    oblivion: ['eeb6cf7f', '6cde4947'],
    'oblivion-cut': ['cd1025a8', '303c7acc'],
    worldBoss: ['f0601dfb', '6e62a834'],
    'pvp-attacker': ['86960a34', 'bb6ed518'],
    'pvp-defender': ['19b70c3c', 'f1f2cab0'],
  },
  'SENTINEL_DISRUPTION': {
    dummy: ['7708e0c5', '1c167511'],
    chapter: ['d2bb5842', '635a86a1'],
    dungeon: ['86957544', '94c12cb7'],
    'dungeon-hard': ['31fb5540', 'dac680cc'],
    raid: ['62efe700', 'd6f15ee6'],
    oblivion: ['7ca7ab08', '591d4f32'],
    'oblivion-cut': ['e6d085fd', '2d53c801'],
    worldBoss: ['7f7832b0', 'ca9a1f01'],
    'pvp-attacker': ['a2e8aea8', '1d86e5d8'],
    'pvp-defender': ['f90db979', '692f8309'],
  },
  'MYSTIC_MAGE': {
    dummy: ['4ca82ed4', '2e5456c3'],
    chapter: ['5e4090f8', 'e3bf7798'],
    dungeon: ['856ce008', 'e83e7320'],
    'dungeon-hard': ['1b6276a5', '00691d13'],
    raid: ['0355de21', 'c2c7a3fe'],
    oblivion: ['67cd7461', 'dac985a4'],
    'oblivion-cut': ['38f5b2ce', '0751ed0c'],
    worldBoss: ['f5d6a7ef', 'adca8e65'],
    'pvp-attacker': ['43e79487', '77343f72'],
    'pvp-defender': ['c7eb63f3', '33f8009b'],
  },
  'MYSTIC_DRUID:BEAR': {
    dummy: ['37703fa5', '4d6bbec6'],
    chapter: ['a040708a', '34730ba5'],
    dungeon: ['76621e87', 'ffbaa476'],
    'dungeon-hard': ['eeb45499', 'a2fa560f'],
    raid: ['acd575c0', '40b774b1'],
    oblivion: ['afe76480', '720595b1'],
    'oblivion-cut': ['b46f7695', '49dec39c'],
    worldBoss: ['f667e604', '45490c92'],
    'pvp-attacker': ['a0789aa0', 'caae2a5b'],
    'pvp-defender': ['7397c0db', '706cd776'],
  },
  'MYSTIC_DRUID:WOLF': {
    dummy: ['0c24275c', 'c593c212'],
    chapter: ['62d63612', 'b3f950da'],
    dungeon: ['eb06f155', '1417cd5b'],
    'dungeon-hard': ['92ded3b4', 'd9eb7580'],
    raid: ['3c686b5e', '7b3ce8c4'],
    oblivion: ['f9ab2210', '664351a8'],
    'oblivion-cut': ['2d762f15', 'b5407470'],
    worldBoss: ['0eddff04', '8874cfb5'],
    'pvp-attacker': ['3fe96df4', '1e122932'],
    'pvp-defender': ['327b34e0', 'f21a6aa3'],
  },
  'MYSTIC_DRUID:formless': {
    dummy: ['6ef5d172', 'f9c682d8'],
    chapter: ['bb7b1052', '0998d5ca'],
    dungeon: ['b44920d9', '037f7e14'],
    'dungeon-hard': ['dfaead85', '96b82f01'],
    raid: ['801513b3', '4980f8c0'],
    oblivion: ['7d1fd8cc', '7a8cd386'],
    'oblivion-cut': ['39e95163', 'ef132c71'],
    worldBoss: ['5ffb8c37', 'a737f0a7'],
    'pvp-attacker': ['09a4b35a', '70b32621'],
    'pvp-defender': ['74510efe', 'cac988ef'],
  },
  'NECROMANCER_DEATHLORD': {
    dummy: ['0edc266d', 'f406e87c'],
    chapter: ['2dfe1045', '4ce7d6a7'],
    dungeon: ['8f544014', 'c2074c7f'],
    'dungeon-hard': ['b4d916b9', 'ff5db4ae'],
    raid: ['ecaa4efd', 'aefec0d1'],
    oblivion: ['ac046df2', '1bf6dbf0'],
    'oblivion-cut': ['64531bcd', '5d1d1ab5'],
    worldBoss: ['0eb70141', '5e036256'],
    'pvp-attacker': ['dcc66c9c', '8b471610'],
    'pvp-defender': ['ba8a6cd3', '117a6588'],
  },
  'NECROMANCER_DOOMWEAVER': {
    dummy: ['3dd42ce9', 'becc610b'],
    chapter: ['8a02255d', 'b21a335a'],
    dungeon: ['3d7dbc19', 'd61e5dd0'],
    'dungeon-hard': ['6e025266', '2401a354'],
    raid: ['2e8b8cd5', 'cb4856ef'],
    oblivion: ['2ed124d5', '91b80df8'],
    'oblivion-cut': ['6f31f1b0', '1c212d01'],
    worldBoss: ['1034dc42', 'c2932a42'],
    'pvp-attacker': ['c73be153', '1035a0c3'],
    'pvp-defender': ['80924bb6', 'c1e44ec3'],
  },
  'REAL_WARRIOR_L72': {
    dummy: ['754f8475', '3fafb564'],
    chapter: ['43976b0d', '9db3762a'],
    dungeon: ['3359b205', 'cb693ab7'],
    'dungeon-hard': ['af926a23', '94b39cc4'],
    raid: ['dfa45e1a', 'd9cfc2cd'],
    oblivion: ['0a9860e8', 'aaa2951c'],
    'oblivion-cut': ['4d44caa5', '181e14bc'],
    worldBoss: ['ab9407f5', '2d2a81b4'],
    'pvp-attacker': ['8167b70a', '83a4f856'],
    'pvp-defender': ['55a3bce9', 'c6936c8c'],
  },
};

describe('engine golden corpus (E5)', () => {
  // one fixed PVP opponent for every spec: the Warrior DPS fixture
  const oppChar = characterOf(HARNESS_SPECS[0]);
  const opponent = fighterDuelArgs(buildFighter(oppChar, oppChar.activePresetId));
  const rows = [
    ...HARNESS_SPECS.map((spec) => [spec.label, () => characterOf(spec)]),
    // a real imported profile: catalogue gear, stones, mount and glyphs the fixtures do not have
    ['REAL_WARRIOR_L72', () => normaliseCharacter(gameProfileToCharacter(profile, { now: '2026-01-01T00:00:00.000Z' }))],
  ];
  for (const [label, make] of rows) {
    it(`${label}: every fight kind is bit-identical to the recorded outcomes`, () => {
      const got = corpus(make(), opponent);
      if (process.env.PERF_CORPUS_PRINT) {
        console.log(`  '${label}': ${JSON.stringify(got)},`);
        return;
      }
      expect(got).toEqual(EXPECTED[label]);
    });
  }
});
