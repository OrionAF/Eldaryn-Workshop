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
// and the raid outcomes refreshed for the group fight (every living raid mob swings; combat-pve.md §21.1)
// and again for the clocks running through the gap after a target dies (§21.1, the 2026-11-13 log),
// and again when the raid lost its wait between targets and the opening summon capped every mob's clock
// (§21.3, the 2026-11-23 log), then for the minion clock stepping on a raid swing kill and a debuff row
// following its spell's cast (log hashes only outside raids),
// and re-recorded when an equipped Ancient started to take a sigil slot (the Warrior DPS fixture, which is also
// every spec's PVP opponent, lost its Ancient).
const EXPECTED = {
  'WARRIOR_DPS': {
    dummy: ['218b107f', 'f6cca40d'],
    chapter: ['c36b3a3c', '79327b9e'],
    dungeon: ['76c8ad87', 'ce370d06'],
    'dungeon-hard': ['bdb898fa', 'e3c34af8'],
    raid: ['b5133f28', '650b9ff9'],
    oblivion: ['761bc5d7', '9d9209aa'],
    'oblivion-cut': ['d1bde922', '334618d2'],
    worldBoss: ['8f7418f8', 'b917ac5e'],
    'pvp-attacker': ['f0fcb426', '5a3e8bce'],
    'pvp-defender': ['08ac993e', 'da03443a'],
  },
  'WARRIOR_TANK': {
    dummy: ['a1d04667', '2d9e2f62'],
    chapter: ['049e62bc', 'b09abad6'],
    dungeon: ['558d078c', '679a5a96'],
    'dungeon-hard': ['b0b36bc3', 'a00ee3f3'],
    raid: ['12d92ba1', 'd603bd2c'],
    oblivion: ['16c4b02d', 'b35d5f6d'],
    'oblivion-cut': ['da9cfc90', 'fcdb2480'],
    worldBoss: ['e61af9e0', 'd67af220'],
    'pvp-attacker': ['74485120', 'b37dc2e6'],
    'pvp-defender': ['87f3e23f', '72749b94'],
  },
  'SENTINEL_MARKSMANSHIP': {
    dummy: ['2d0ec2c5', '48f644fe'],
    chapter: ['7555293d', '9a0ce7f0'],
    dungeon: ['5e880c6b', 'd10ab1b9'],
    'dungeon-hard': ['dd38d8cc', '2cbad86a'],
    raid: ['54e1a593', 'd5c88f38'],
    oblivion: ['8049cc47', 'b448d15c'],
    'oblivion-cut': ['7fb716b0', 'cdf6f30c'],
    worldBoss: ['53e7e5b0', 'c37aad59'],
    'pvp-attacker': ['42599506', '6c5dc0bd'],
    'pvp-defender': ['f2006247', '7ad925fc'],
  },
  'SENTINEL_DISRUPTION': {
    dummy: ['3c71a3b9', '5a4af410'],
    chapter: ['35416a51', '27d2d9d1'],
    dungeon: ['20e7db6e', '64089a8b'],
    'dungeon-hard': ['290fe7f1', '9e978d0b'],
    raid: ['563673e0', 'ad3d72ed'],
    oblivion: ['3442aa4c', 'ede90ad8'],
    'oblivion-cut': ['03615ee2', '4e0faa89'],
    worldBoss: ['c5d4ae4c', '61ae1aaf'],
    'pvp-attacker': ['634f5cef', '8d7b1f88'],
    'pvp-defender': ['ca485f19', '541f4817'],
  },
  'MYSTIC_MAGE': {
    dummy: ['4ca82ed4', '2e5456c3'],
    chapter: ['5e4090f8', 'e3bf7798'],
    dungeon: ['856ce008', 'e83e7320'],
    'dungeon-hard': ['1b6276a5', '00691d13'],
    raid: ['7f823671', 'db8c190b'],
    oblivion: ['67cd7461', 'dac985a4'],
    'oblivion-cut': ['38f5b2ce', '0751ed0c'],
    worldBoss: ['f5d6a7ef', 'adca8e65'],
    'pvp-attacker': ['40f8e761', 'e77d61f5'],
    'pvp-defender': ['66bcda3b', 'fdbc11c2'],
  },
  'MYSTIC_DRUID:BEAR': {
    dummy: ['37703fa5', '4d6bbec6'],
    chapter: ['a040708a', '34730ba5'],
    dungeon: ['76621e87', 'ffbaa476'],
    'dungeon-hard': ['eeb45499', 'a2fa560f'],
    raid: ['42f32dc8', 'dd0342dc'],
    oblivion: ['afe76480', '720595b1'],
    'oblivion-cut': ['b46f7695', '49dec39c'],
    worldBoss: ['f667e604', '45490c92'],
    'pvp-attacker': ['8726cd1c', '49db668a'],
    'pvp-defender': ['a0424eb2', '623cae84'],
  },
  'MYSTIC_DRUID:WOLF': {
    dummy: ['0c24275c', 'c593c212'],
    chapter: ['62d63612', 'b3f950da'],
    dungeon: ['eb06f155', '1417cd5b'],
    'dungeon-hard': ['92ded3b4', 'd9eb7580'],
    raid: ['4a16c2c2', 'c3be9eae'],
    oblivion: ['f9ab2210', '664351a8'],
    'oblivion-cut': ['2d762f15', 'b5407470'],
    worldBoss: ['0eddff04', '8874cfb5'],
    'pvp-attacker': ['9873fd5e', 'c8adc4d7'],
    'pvp-defender': ['6928046a', 'ae0d12a4'],
  },
  'MYSTIC_DRUID:formless': {
    dummy: ['6ef5d172', 'f9c682d8'],
    chapter: ['bb7b1052', '0998d5ca'],
    dungeon: ['b44920d9', '037f7e14'],
    'dungeon-hard': ['dfaead85', '96b82f01'],
    raid: ['3bb53173', 'e36a1343'],
    oblivion: ['7d1fd8cc', '7a8cd386'],
    'oblivion-cut': ['39e95163', 'ef132c71'],
    worldBoss: ['5ffb8c37', 'a737f0a7'],
    'pvp-attacker': ['d8ddae0c', 'e798ead6'],
    'pvp-defender': ['b7b0745f', '9fb5e613'],
  },
  'NECROMANCER_DEATHLORD': {
    dummy: ['28e2e3bc', 'ab98c45e'],
    chapter: ['fcb00085', '79181664'],
    dungeon: ['9a2459f3', '83ca9b98'],
    'dungeon-hard': ['cd8c44e2', '096dee18'],
    raid: ['3d93a935', '9842d0e8'],
    oblivion: ['f8b1d062', '058c2679'],
    'oblivion-cut': ['927840f0', 'af4740ee'],
    worldBoss: ['48e5002a', '77176d6e'],
    'pvp-attacker': ['72bd8ab2', '5f647286'],
    'pvp-defender': ['a171d416', '12256bb6'],
  },
  'NECROMANCER_DOOMWEAVER': {
    dummy: ['d1206acf', 'ff09e346'],
    chapter: ['34354f5d', '5760c11f'],
    dungeon: ['490ef971', 'a9de4a48'],
    'dungeon-hard': ['449fdecb', 'cc2e8e87'],
    raid: ['e16674f5', '66edda7c'],
    oblivion: ['13ed94fe', '9826c03a'],
    'oblivion-cut': ['73faaaf8', '5cda4828'],
    worldBoss: ['1d0fe468', '8225aa18'],
    'pvp-attacker': ['ff457152', 'f0402ebd'],
    'pvp-defender': ['d7d10dfd', '59db28b9'],
  },
  'REAL_WARRIOR_L72': {
    dummy: ['754f8475', '3fafb564'],
    chapter: ['43976b0d', '9db3762a'],
    dungeon: ['3359b205', 'cb693ab7'],
    'dungeon-hard': ['af926a23', '94b39cc4'],
    raid: ['593aa800', '7945e8fd'],
    oblivion: ['0a9860e8', 'aaa2951c'],
    'oblivion-cut': ['4d44caa5', '181e14bc'],
    worldBoss: ['ab9407f5', '2d2a81b4'],
    'pvp-attacker': ['139dd2af', '0b55370a'],
    'pvp-defender': ['9ad054b3', '3fff554c'],
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
