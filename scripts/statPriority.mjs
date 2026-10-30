// Stat priorities from the leaderboard captures (docs/LeaderboardCaptures/server-*/players).
// Run: npm run gen:stat-priority -> src/data/statPriority.json (Tools › Stat Priorities) and, beside
// the captures, stat-guide.md (every preset bracket as text). Method: spec-guide.md §Leaderboard guide.
//
// A stat's score is its "keep rate": how often a spec's equipped gear carries it, divided by how
// often it would if players kept whatever dropped. Drop odds per class come from the 1-affix gear
// of players under level 19 (before Attunement can ban stats). Higher rarities roll flatter, so
// each rarity raises those odds to a power gamma fitted on "fresh" drops: items a player wears
// above the median rarity of their gear, i.e. kept for the rarity jump rather than the affixes.
// An item rolls its affixes without repeats (0 of ~70k items repeat one), so 2- and 3-affix odds
// are exact weighted draws without replacement.
//
// The app gets per-level counts, not players: the page sums any level range and scores it with
// src/lib/features/statPriority.js, the same functions that score the preset brackets here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockText, presetBrackets } from '../src/lib/features/statPriority.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURES = path.join(ROOT, 'docs/LeaderboardCaptures');
const OUT = path.join(ROOT, 'src/data/statPriority.json');

// The lists split every stat at ×1 (kept more or less often than it drops); these two only grade
// how strong a keep rate reads on the page.
const STRONG_MIN = 1.15; // at or above: a clear pick
const AVOID_MAX = 0.75; // at or below: clearly dropped
// Attunement ban slots at max skill level (skills.md §5): 3, plus 1 for Mystic
const BAN_SLOTS = { WARRIOR: 3, SENTINEL: 3, MYSTIC: 4 };
const NEAR_TIE = 1.1; // within this of its group's first stat, a stat reads "≈"
const SHRINK = 4; // pseudo-items pulling thin samples toward 1
const MIN_PLAYERS = 20;
const BRACKETS = [[15, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 100]];

const CLASSES = {
  WARRIOR: { name: 'Warrior', specs: { WARRIOR_DPS: 'Arms', WARRIOR_TANK: 'Protection' } },
  SENTINEL: { name: 'Sentinel', specs: { SENTINEL_MARKSMANSHIP: 'Marksmanship', SENTINEL_DISRUPTION: 'Disruption' } },
  MYSTIC: { name: 'Mystic', specs: { MYSTIC_MAGE: 'Mage', MYSTIC_DRUID: 'Druid · All forms' } },
};
// Druid plays as Bear or Wolf, picked by the utility sigil (sigils.md); shown beside the whole spec.
const VARIANTS = [
  { key: 'MYSTIC_DRUID_BEAR', spec: 'MYSTIC_DRUID', name: 'Druid · Bear', match: (p) => /URSINE/.test(p.utilitySigil?.species ?? '') },
  { key: 'MYSTIC_DRUID_WOLF', spec: 'MYSTIC_DRUID', name: 'Druid · Wolf', match: (p) => /LUPINE/.test(p.utilitySigil?.species ?? '') },
];

// label, computedStats key, display scale, soft cap (docs/Reference/Game/stats.md §4.2; Spell
// Resist per updates-2.8.2.md §3)
const STATS = {
  ATTACK_SPEED: ['Attack Speed', 'totalAttackSpeed', 100, 200],
  ATTACK_PERCENT: ['Attack %', 'totalAttackPercent', 1, null],
  HEALTH_PERCENT: ['Health %', 'totalHealthPercent', 1, null],
  CRIT_CHANCE: ['Crit Chance', 'totalCritChance', 1, 50],
  CRIT_DAMAGE: ['Crit Damage', 'totalCritDamage', 100, 300],
  DOUBLE_HIT: ['Double Hit', 'totalDoubleHit', 1, 60],
  LIFESTEAL: ['Lifesteal', 'totalLifesteal', 1, 40],
  HP_REGEN: ['HP Regen', 'totalHpRegen', 1, 40],
  DAMAGE_REDUCTION: ['Damage Reduction', 'totalDamageReduction', 1, 30],
  BLOCK_CHANCE: ['Block', 'totalBlockChance', 1, 40],
  MISS_CHANCE: ['Evasion', 'totalMissChance', 1, 50],
  BLIND_CHANCE: ['Blind', 'totalBlindChance', 1, 30],
  PARALYZE_CHANCE: ['Paralyze', 'totalParalyzeChance', 1, 8],
  PENETRATION: ['Penetration', 'totalPenetration', 1, 30],
  SPELL_DAMAGE: ['Spell Damage', 'totalSpellDamage', 1, null],
  SPELL_RESIST: ['Spell Resist', 'totalSpellResist', 1, 25],
  SPELL_CRIT_CHANCE: ['Crit Spell %', 'totalSpellCritChance', 1, 50],
  SPELL_VAMP: ['Spell Vamp', 'totalSpellVamp', 1, 40],
  DISRUPTION_CHANCE: ['Disruption', 'totalDisruptionChance', 1, 10],
};

function loadPlayers() {
  const byId = new Map();
  const servers = fs.readdirSync(CAPTURES).filter((d) => /^server-\d+$/.test(d));
  for (const server of servers) {
    const dir = path.join(CAPTURES, server, 'players');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        if (p?.playerId && CLASSES[p.class]) byId.set(p.playerId, p);
      } catch { /* a file mid-write by the collector */ }
    }
  }
  return { players: [...byId.values()], servers };
}

// docs/Reference/Game/drops.md §1 (Mythic sits below Ancient)
const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'ANCIENT', 'DIVINE', 'ETERNAL', 'OBLIVION'];
const ATTUNEMENT_LEVEL = 19; // skills.md §3
const GAMMAS = Array.from({ length: 33 }, (_, i) => i * 0.05);

const gearOf = (p) => Object.values(p.equipment ?? {})
  .filter((it) => it?.secondaryStats?.length)
  .map((it) => ({ rarity: it.rarity, types: it.secondaryStats.map((s) => s.type).filter((t) => STATS[t]) }));

// Per-class drop weights from single-affix gear of players not yet able to attune.
function dropWeights(players) {
  const out = {};
  for (const cls of Object.keys(CLASSES)) {
    const counts = {};
    for (const p of players) {
      if (p.class !== cls) continue;
      for (const { types } of gearOf(p)) for (const t of types) counts[t] ??= 0; // the class pool
      if (p.level >= ATTUNEMENT_LEVEL) continue;
      for (const { types } of gearOf(p)) if (types.length === 1) counts[types[0]] += 1;
    }
    for (const t of Object.keys(counts)) counts[t] += 1; // never zero
    out[cls] = counts;
  }
  return out;
}

const temper = (w, g) => Object.fromEntries(Object.entries(w).map(([t, v]) => [t, v ** g]));

// Fresh drops per rarity and class: items above the median rarity of the wearer's gear.
function freshDrops(players) {
  const out = {};
  for (const p of players) {
    const all = Object.values(p.equipment ?? {}).filter(Boolean);
    if (all.length < 6) continue;
    const ranks = all.map((it) => RARITY_ORDER.indexOf(it.rarity)).sort((a, b) => a - b);
    const med = ranks[ranks.length >> 1];
    for (const { rarity, types } of gearOf(p)) {
      if (RARITY_ORDER.indexOf(rarity) <= med) continue;
      const x = ((out[rarity] ??= {})[p.class] ??= { items: 0, k: types.length, count: {} });
      x.items += 1;
      for (const t of types) x.count[t] = (x.count[t] ?? 0) + 1;
    }
  }
  return out;
}

// Per-rarity gamma maximising the likelihood of the fresh drops' affixes (pooled over classes).
function fitGammas(weights, fresh) {
  const out = {};
  for (const rarity of RARITY_ORDER) {
    const byClass = fresh[rarity];
    if (!byClass) continue;
    let best = { gamma: 1, ll: -Infinity };
    for (const gamma of GAMMAS) {
      let ll = 0;
      for (const [cls, x] of Object.entries(byClass)) {
        const p = inclusion(temper(weights[cls], gamma), x.k);
        for (const t of Object.keys(weights[cls])) {
          const q = Math.min(0.999, Math.max(1e-6, p[t]));
          const o = x.count[t] ?? 0;
          ll += o * Math.log(q) + (x.items - o) * Math.log(1 - q);
        }
      }
      if (ll > best.ll) best = { gamma: +gamma.toFixed(2), ll };
    }
    out[rarity] = { gamma: best.gamma, items: Object.values(byClass).reduce((s, x) => s + x.items, 0) };
  }
  return out;
}

// P(stat is on an item with k affixes) under weighted draws without replacement.
function inclusion(weights, k) {
  const types = Object.keys(weights);
  const total = types.reduce((s, t) => s + weights[t], 0);
  const p = Object.fromEntries(types.map((t) => [t, 0]));
  const walk = (left, mass, used, prob) => {
    if (left === 0) return;
    for (const t of types) {
      if (used.has(t)) continue;
      const q = prob * (weights[t] / mass);
      p[t] += q;
      used.add(t);
      walk(left - 1, mass - weights[t], used, q);
      used.delete(t);
    }
  };
  walk(k, total, new Set(), 1);
  return p;
}

// One spec's per-level aggregates (shape in statPriority.js). Sheet totals are all sources after
// soft caps, in display units.
function levelsOf(players, pool, odds) {
  const byLevel = {};
  for (const p of players) {
    const x = (byLevel[p.level] ??= { n: 0, items: 0, obs: pool.map(() => 0), exp: pool.map(() => 0), awk: {}, tot: pool.map(() => []) });
    x.n += 1;
    for (const { rarity, types } of gearOf(p)) {
      x.items += 1;
      const pk = odds(rarity, types.length);
      pool.forEach((t, i) => { x.exp[i] += pk[t] ?? 0; });
      for (const t of types) {
        const i = pool.indexOf(t);
        if (i >= 0) x.obs[i] += 1;
      }
    }
    pool.forEach((t, i) => {
      const [, key, scale] = STATS[t];
      const v = p.computedStats?.[key];
      if (typeof v === 'number') x.tot[i].push(+(v * scale).toFixed(1));
    });
    if (p.awakeningPath) x.awk[p.awakeningPath] = (x.awk[p.awakeningPath] ?? 0) + 1;
  }
  for (const x of Object.values(byLevel)) x.exp = x.exp.map((v) => +v.toFixed(3));
  return byLevel;
}

function build() {
  const { players, servers } = loadPlayers();
  const weights = dropWeights(players);
  const gammas = fitGammas(weights, freshDrops(players));
  const cache = new Map();
  const oddsFor = (cls) => (rarity, k) => {
    const key = `${cls}|${rarity}|${k}`;
    if (!cache.has(key)) cache.set(key, inclusion(temper(weights[cls], gammas[rarity]?.gamma ?? 1), k));
    return cache.get(key);
  };

  const pools = Object.fromEntries(Object.keys(CLASSES).map((cls) => [cls, Object.keys(weights[cls])]));
  const entries = Object.entries(CLASSES).flatMap(([cls, { name, specs }]) => [
    ...Object.entries(specs).map(([spec, specName]) => ({ class: cls, className: name, spec, specName, match: (p) => p.activeSpec === spec })),
    ...VARIANTS.filter((v) => v.spec in specs).map((v) => ({
      class: cls, className: name, spec: v.key, specName: v.name, variantOf: v.spec, match: (p) => p.activeSpec === v.spec && v.match(p),
    })),
  ]);
  const specs = [];
  const levels = {};
  for (const { match, ...entry } of entries) {
    specs.push(entry);
    levels[entry.spec] = levelsOf(players.filter(match), pools[entry.class], oddsFor(entry.class));
  }

  const data = {
    generatedAt: new Date().toISOString(),
    servers: servers.map((s) => +s.split('-')[1]).sort((a, b) => a - b),
    playerCount: players.length,
    method: { STRONG_MIN, AVOID_MAX, NEAR_TIE, SHRINK, MIN_PLAYERS, ATTUNEMENT_LEVEL, BAN_SLOTS },
    gammas: Object.fromEntries(Object.entries(gammas).map(([r, x]) => [r, x.gamma])),
    labels: Object.fromEntries(Object.entries(STATS).map(([t, [l]]) => [t, l])),
    softCaps: Object.fromEntries(Object.entries(STATS).map(([t, s]) => [t, s[3]])),
    brackets: BRACKETS,
    pools,
    specs,
    levels,
  };
  // a spec with no preset bracket has too few players to show at all
  data.specs = specs.filter((s) => presetBrackets(data, s.spec).length);
  data.levels = Object.fromEntries(data.specs.map((s) => [s.spec, levels[s.spec]]));
  return data;
}

function toText(data) {
  const out = [];
  for (const s of data.specs) {
    out.push(`## ${s.className} · ${s.specName}`, '');
    for (const b of presetBrackets(data, s.spec)) {
      out.push(`### Level ${b.key} (${b.players} players)`, '', '```', blockText(data.labels, b), '```', '');
    }
  }
  return `# Stat priorities from the leaderboards\n\nServers ${data.servers.join(', ')}; ${data.playerCount} players; generated ${data.generatedAt.slice(0, 10)}.\n\n${out.join('\n')}`;
}

if (!fs.existsSync(CAPTURES)) {
  console.error(`No captures at ${CAPTURES}: nothing to generate.`);
  process.exit(1);
}
const data = build();
fs.writeFileSync(OUT, `${JSON.stringify(data)}\n`);
fs.writeFileSync(path.join(CAPTURES, 'stat-guide.md'), toText(data));
const blocks = data.specs.reduce((s, x) => s + presetBrackets(data, x.spec).length, 0);
console.log(`stat priorities: ${data.playerCount} players, ${data.specs.length} specs, ${blocks} brackets -> ${path.relative(ROOT, OUT)}`);
