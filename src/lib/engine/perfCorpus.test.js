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

// E5 baseline, with intended 2.7.4 PvP cast-lockout outcomes refreshed after focused recovery/effect tests.
const EXPECTED = {
  'WARRIOR_DPS': {
    dummy: ['9f294683', '1a64cff3'],
    chapter: ['0ac7a2e8', 'ad88b23d'],
    dungeon: ['8ec06044', '81bbb2ab'],
    'dungeon-hard': ['14d30237', '2d9465fd'],
    raid: ['f7f8c6ed', '66a32cfb'],
    oblivion: ['40a832e1', 'ec437f9d'],
    'oblivion-cut': ['bcbc5aa8', '48d77a92'],
    worldBoss: ['bff63d89', '586e672a'],
    'pvp-attacker': ['f63f745c', 'e2af640d'],
    'pvp-defender': ['53e1059a', '3535f799'],
  },
  'WARRIOR_TANK': {
    dummy: ['831af91c', 'f9966523'],
    chapter: ['a23d2667', '43586aa2'],
    dungeon: ['b3cc2a0e', 'ff1051c3'],
    'dungeon-hard': ['b0b36bc3', 'ad88060f'],
    raid: ['f16d9a4d', 'b6a3193d'],
    oblivion: ['04b7ce6e', '56c22001'],
    'oblivion-cut': ['52759998', 'a765d2f4'],
    worldBoss: ['a7c0ffc9', '872ae19b'],
    'pvp-attacker': ['cf85af3b', 'b93ed886'],
    'pvp-defender': ['fa945cc9', '9eed349b'],
  },
  'SENTINEL_MARKSMANSHIP': {
    dummy: ['ab4dd427', '3a59a7f6'],
    chapter: ['e37539c7', 'dfa938fc'],
    dungeon: ['8fb698cf', 'fa360e90'],
    'dungeon-hard': ['cda016ec', '98fdb6ee'],
    raid: ['16ec6325', '52e6906e'],
    oblivion: ['eeb6cf7f', 'b535f618'],
    'oblivion-cut': ['3e832d3b', 'a34aa220'],
    worldBoss: ['1cfaa8ef', '40320267'],
    'pvp-attacker': ['13f1d78f', '20549e81'],
    'pvp-defender': ['a34b12a0', '472424ca'],
  },
  'SENTINEL_DISRUPTION': {
    dummy: ['dd659239', '9d6abd07'],
    chapter: ['d2bb5842', '5b6dba8a'],
    dungeon: ['86957544', '17ba1fb4'],
    'dungeon-hard': ['53a78147', 'e90494e9'],
    raid: ['cdaeeb75', '8059b948'],
    oblivion: ['7ca7ab08', '5fd8dea6'],
    'oblivion-cut': ['9c49706d', 'f899d67e'],
    worldBoss: ['5c79285d', 'd960ff28'],
    'pvp-attacker': ['81f21213', '8db639a4'],
    'pvp-defender': ['b13b918a', 'fbef3b1c'],
  },
  'MYSTIC_MAGE': {
    dummy: ['d134e994', '7038e609'],
    chapter: ['01cda9e0', '41f207db'],
    dungeon: ['be0b15e0', '9eaa1578'],
    'dungeon-hard': ['49f68715', 'b2b0e13d'],
    raid: ['dafd78d5', 'ffd497d2'],
    oblivion: ['c81c5e9f', '67a33837'],
    'oblivion-cut': ['007820f1', '6bd9f680'],
    worldBoss: ['650c422d', 'df2b751f'],
    'pvp-attacker': ['e74d2c70', '896b8573'],
    'pvp-defender': ['7119c3e0', '3bf93594'],
  },
  'MYSTIC_DRUID:BEAR': {
    dummy: ['86d2807d', '507a744b'],
    chapter: ['c1f4281a', '0f4244a4'],
    dungeon: ['201663f7', 'f0695fc7'],
    'dungeon-hard': ['eeb45499', 'd5239da5'],
    raid: ['dea75b3d', '803b432a'],
    oblivion: ['ac5a8f66', 'dd2476ae'],
    'oblivion-cut': ['3261dd1b', '6c50123c'],
    worldBoss: ['1bec6488', 'eddbb56e'],
    'pvp-attacker': ['32f34820', '1c894327'],
    'pvp-defender': ['b507b35b', 'af6bb149'],
  },
  'MYSTIC_DRUID:WOLF': {
    dummy: ['710ca2ac', '07d4139f'],
    chapter: ['65e7485a', 'e8e5feff'],
    dungeon: ['1b26fcc7', '701fc0c6'],
    'dungeon-hard': ['92ded3b4', '4548b3ad'],
    raid: ['f18a7ddd', '2f4f95a0'],
    oblivion: ['9137977f', '8db3cb65'],
    'oblivion-cut': ['77bc71ec', 'c9bde185'],
    worldBoss: ['9b989f0b', '4fe8a5ed'],
    'pvp-attacker': ['e6b8dfa1', 'f1153688'],
    'pvp-defender': ['534a0a7c', 'c95a8ae6'],
  },
  'MYSTIC_DRUID:formless': {
    dummy: ['52326b5a', '90d86af3'],
    chapter: ['c76ebd4a', 'b00df98f'],
    dungeon: ['65ce528a', '797d9a64'],
    'dungeon-hard': ['dfaead85', '96b82f01'],
    raid: ['830caebd', 'a03489f1'],
    oblivion: ['7d1fd8cc', 'ec6c1564'],
    'oblivion-cut': ['5f294b3f', 'cdaa14bd'],
    worldBoss: ['832c2032', '0d4933ab'],
    'pvp-attacker': ['e15cbc88', 'b7720624'],
    'pvp-defender': ['3775f3dd', '3758e33d'],
  },
  'NECROMANCER_DEATHLORD': {
    dummy: ['fd9918e5', '79df3e2a'],
    chapter: ['adf57465', '2996ecbd'],
    dungeon: ['d3e9360c', '9459b399'],
    'dungeon-hard': ['b4d916b9', '475fe47e'],
    raid: ['31d576dd', '55e16c2a'],
    oblivion: ['2f7a817e', 'ccec0707'],
    'oblivion-cut': ['90a757e0', '02851059'],
    worldBoss: ['91d4b0ac', 'aa17355a'],
    'pvp-attacker': ['f0e82d28', '2f1396dc'],
    'pvp-defender': ['b22278fa', 'e46df2db'],
  },
  'NECROMANCER_DOOMWEAVER': {
    dummy: ['2f678f75', 'fbeff6b2'],
    chapter: ['476fee35', 'e4ee1bdc'],
    dungeon: ['9d9c41a1', '3bbf37f6'],
    'dungeon-hard': ['6e025266', 'ea76e3c0'],
    raid: ['27cf0b4d', '257e6678'],
    oblivion: ['c8c1488d', '00e11230'],
    'oblivion-cut': ['ba9ce0fe', '5f28d90c'],
    worldBoss: ['ef231a9d', 'e818bd99'],
    'pvp-attacker': ['9d0fa4bb', 'a1745001'],
    'pvp-defender': ['c7f62ee4', '650613ff'],
  },
  'REAL_WARRIOR_L72': {
    dummy: ['754f8475', '3fafb564'],
    chapter: ['43976b0d', '9db3762a'],
    dungeon: ['3359b205', 'cb693ab7'],
    'dungeon-hard': ['af926a23', '94b39cc4'],
    raid: ['975e2cfd', '98889b22'],
    oblivion: ['f9d8e57d', '675ab034'],
    'oblivion-cut': ['8ae02db5', 'c778cf6f'],
    worldBoss: ['ab9407f5', '2d2a81b4'],
    'pvp-attacker': ['56bd1ddd', 'cc0501ee'],
    'pvp-defender': ['8a2c2474', 'ff421d5e'],
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
