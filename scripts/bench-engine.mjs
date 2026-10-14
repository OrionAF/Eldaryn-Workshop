// Prints ms per PVE fight and per PVP duel (rebuild-plan §6 budgets: PVE <= 0.5 ms, PVP <= 2 ms
// without the event log; reported, not asserted). The engine imports JSON, so run it through vite-node:
//   npx vite-node scripts/bench-engine.mjs [fights] [duels]
import { performance } from 'node:perf_hooks';
import { simulatePve, preparePveFighter, trainingDummy } from '../src/lib/engine/pve/fight.js';
import { chapterMobs } from '../src/lib/engine/pve/enemies.js';
import { runDuel, fighterDuelArgs } from '../src/lib/engine/pvp/resolver.js';
import { mulberry32, hashSeed } from '../src/lib/engine/rng.js';

const stats = {
  totalHp: 20000, totalAttack: 1500, totalAttackSpeed: 1.4, totalDoubleHit: 15, totalCritChance: 30,
  totalCritDamage: 1.8, totalLifesteal: 5, totalHpRegen: 20, totalDamageReduction: 10, totalBlockChance: 10,
  totalMissChance: 5, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 10,
  totalPvpAttack: 0, totalPvpDefense: 0,
};
const bare = { stats, class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [] };
const N = Number(process.argv[2]) || 2000;
const M = Number(process.argv[3]) || 300;

function time(label, n, fn) {
  fn(0); // warm up
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = (performance.now() - t0) / n;
  console.log(`${label.padEnd(44)} ${ms.toFixed(3)} ms  (n=${n})`);
}

const prepared = preparePveFighter(bare);
const dummy = trainingDummy();
time('PVE 60 s dummy, bare fighter (prepared)', N, (i) =>
  simulatePve({ fighter: prepared, enemy: dummy, maxMs: 60000, rng: mulberry32(hashSeed(1, i)) }));
const mobs = chapterMobs(1, 1);
time('PVE chapter 1 level 1 (prepared)', N, (i) =>
  simulatePve({ fighter: prepared, enemy: mobs, rng: mulberry32(hashSeed(1, i)) }));

const a = fighterDuelArgs(bare);
const d = fighterDuelArgs({ ...bare, stats: { ...stats, totalAttack: 1300 } });
time('PVP 60 s timeout duel, bare (prebuilt args)', M, (i) =>
  runDuel({ attacker: a, defender: d, rng: mulberry32(hashSeed(1, i)) }));
