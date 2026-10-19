// Run through vite-node; generated inputs/results remain in ignored docs/PerformanceBench.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { profileRecord, selectRecords, digest } from './dataset.mjs';
import { benchmarkCases, benchmarkSpace, celestialParityCases } from './cases.mjs';
import { resolveTarget, makeObjective } from '../../src/lib/search/objectives.js';
import { buildFighter } from '../../src/lib/build/fighter.js';
import { optimize } from '../../src/lib/search/search.js';
import { simulateCelestial, prepareCelestialMember } from '../../src/lib/engine/pve/celestial.js';
import * as loadedCelestial from '../../src/lib/engine/pve/celestial.js';
import { fightRng } from '../../src/lib/engine/rng.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2), command = args[0];
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const flag = (name) => args.includes(name);
const integer = (name, fallback, min, max) => {
  const n = Number(option(name, fallback));
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be ${min}..${max}`);
  return n;
};
const folder = resolve(option('--folder', 'docs/PerformanceBench/baseline-2026-10-19'));
const output = (name, value) => writeFileSync(join(folder, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const git = (...params) => execFileSync('git', params, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
function sourceSignature() {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(js|json|svelte|css|mjs)$/.test(path)) hash.update(path).update(readFileSync(join(root, path)));
    }
  };
  walk('src'); walk('scripts/performance'); return hash.digest('hex');
}
const machine = () => ({ node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length });

if (command === 'freeze') {
  mkdirSync(dirname(folder), { recursive: true });
  mkdirSync(folder, { recursive: false });
  const records = [], rejected = {}, sources = [];
  for (const server of ['server-5', 'server-11']) {
    const dir = join(root, 'docs/LeaderboardCaptures', server);
    const checkpoint = JSON.parse(readFileSync(join(dir, 'checkpoint.json'), 'utf8'));
    let valid = 0, count = 0;
    for (const file of readdirSync(join(dir, 'players')).filter((f) => f.endsWith('.json')).sort().slice(0, 10000)) {
      count++;
      try {
        const path = join(dir, 'players', file);
        if (statSync(path).size > 5e6) throw new Error('oversized');
        const profile = JSON.parse(readFileSync(path, 'utf8'));
        const record = profileRecord(profile, { server, capturedAt: checkpoint.profiles?.[profile.playerId]?.fetchedAt });
        if (!record) { rejected.invalid = (rejected.invalid ?? 0) + 1; continue; }
        records.push(record); valid++;
      } catch { rejected.unreadable = (rejected.unreadable ?? 0) + 1; }
    }
    sources.push({ server, files: count, valid });
  }
  const selection = selectRecords(records, integer('--players-per-partition', 48, 1, 256));
  const source = readFileSync(join(root, 'src/lib/engine/pve/celestial.js'), 'utf8');
  writeFileSync(join(folder, 'celestial-source.local.txt'), source, { flag: 'wx' });
  const manifest = { schema: 1, at: new Date().toISOString(), head: git('rev-parse', 'HEAD'), sourceSignature: sourceSignature(),
    pendingFiles: git('status', '--porcelain').split('\n').filter(Boolean).map((line) => line.slice(3)),
    machine: machine(), sources, rejected, ...selection, celestialSourceDigest: digest(source),
    limitations: ['Latest snapshots only; stable identity partition prevents cross-date leakage.',
      'Public sheets are opponent inputs, not complete player characters.',
      'Talents/conditions and some progression are absent. Rank and Influence are not quality labels.',
      'Raw captures and all generated files stay local. No API calls or tokens are used.'] };
  manifest.datasetDigest = digest(manifest.records);
  output('manifest.json', manifest);
  console.log(JSON.stringify({ folder, datasetDigest: manifest.datasetDigest, sources, rejected, uniquePlayers: selection.uniquePlayers, selected: selection.selected }));
} else if (command === 'run' || command === 'parity' || command === 'paired') {
  if (command !== 'run' && process.env.ELDARYN_PERF_ALL_REFERENCE === '1') throw new Error('Parity/paired require the working-tree candidate; clear ELDARYN_PERF_ALL_REFERENCE');
  if (command !== 'run' || process.env.ELDARYN_PERF_ALL_REFERENCE === '1') {
    if (!process.env.ELDARYN_PERF_REFERENCE || resolve(process.env.ELDARYN_PERF_REFERENCE) !== folder) {
      throw new Error('ELDARYN_PERF_REFERENCE must match --folder; refusing mismatched benchmark provenance');
    }
  }
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
  if (process.env.ELDARYN_PERF_ALL_REFERENCE === '1' && loadedCelestial.__BENCHMARK_REFERENCE_DIGEST !== manifest.celestialSourceDigest) {
    throw new Error('Frozen engine not loaded; use --config scripts/performance/reference.config.mjs');
  }
  if (manifest.schema !== 1 || digest(manifest.records) !== manifest.datasetDigest) throw new Error('Frozen dataset checksum mismatch');
  const reps = integer('--reps', 5, 3, 15), fights = integer('--fights', 32, 1, 256), warmup = integer('--warmup', 8, 1, 128);
  const seed = integer('--seed', 17, 1, 1e9), seconds = integer('--seconds', 120, 1, 600), began = performance.now();
  const report = { schema: 1, at: new Date().toISOString(), command, sourceSignature: sourceSignature(), baselineSignature: manifest.sourceSignature,
    pendingFiles: git('status', '--porcelain').split('\n').filter(Boolean).map((line) => line.slice(3)),
    engineVariant: process.env.ELDARYN_PERF_ALL_REFERENCE === '1' ? 'frozen-reference' : 'working-tree', celestialReferenceDigest: manifest.celestialSourceDigest,
    datasetDigest: manifest.datasetDigest, machine: machine(), seed, reps, fights, warmup, seconds, stoppingReason: 'completed', cases: [] };
  const expired = () => { if (performance.now() - began < seconds * 1000) return false; report.stoppingReason = 'time-budget-between-cases'; return true; };
  if (command === 'run') {
    const searchPolicy = flag('--search') ? { space: benchmarkSpace, effort: { level: 'quick', n0: 4, maxN: 16, randomStarts: 0 }, seed } : null;
    for (const row of benchmarkCases(manifest)) {
      if (expired()) break;
      const target = resolveTarget(row.target, { character: row.character, partner: row.partner });
      const objective = makeObjective(row.objective, target), fighter = buildFighter(row.character, row.presetId, { realm: target.realm });
      await objective.sample(fighter, { seed, from: 0, to: warmup });
      const times = [], checks = [];
      for (let rep = 0; rep < reps; rep++) {
        const t = performance.now(), sample = await objective.sample(fighter, { seed, from: 0, to: fights });
        times.push((performance.now() - t) / fights); checks.push(digest({ main: sample.main, side: sample.side }));
      }
      if (new Set(checks).size !== 1) throw new Error(`Unstable outcomes: ${row.name}`);
      const result = { name: row.name, partition: row.partition ?? 'fixture',
        ...(row.server ? { server: row.server, profileSpec: row.profileSpec, profileLevel: row.profileLevel } : {}),
        inputDigest: digest({ character: row.character, partner: row.partner, presetId: row.presetId, target: target.spec, objective: objective.spec, seed, searchPolicy }),
        msPerFight: { median: median(times), min: Math.min(...times), max: Math.max(...times), repetitions: times }, checksum: checks[0] };
      if (flag('--search') && !expired()) {
        const requests = { character: row.character, partner: row.partner, presetId: row.presetId, target: row.target, objective: row.objective,
          ...searchPolicy };
        const t = performance.now(), controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1, seconds * 1000 - (t - began)));
        let search;
        try { search = await optimize(requests, { signal: controller.signal }); } finally { clearTimeout(timer); }
        const elapsedMs = performance.now() - t;
        if (controller.signal.aborted) report.stoppingReason = 'time-budget-search';
        const confirmed = search.status === 'done' && search.rows?.find((r) => !r.provisional && r.vsBaseline?.verdict === 'better');
        result.search = { elapsedMs, firstValidatedImprovementMs: confirmed ? elapsedMs : null,
          validationTiming: 'Confirmed rows are published on completion; this is an upper bound on internal first validation.',
          status: search.status, stoppingReason: controller.signal.aborted ? 'time-budget-requested' : search.status, evaluated: search.search?.evaluated, fights: search.search?.fights,
          phases: search.phases, baseline: search.baseline?.value, best: search.rows?.[0]?.value ?? search.baseline?.value,
          contrast: search.rows?.[0]?.vsBaseline ?? null, confirmedImprovement: !!confirmed,
          outcomeDigest: digest({ baseline: search.baseline?.value, rows: search.rows?.map((r) => ({ candidate: r.candidate, value: r.value, vsBaseline: r.vsBaseline })) }) };
      }
      report.cases.push(result); console.log(JSON.stringify({ name: row.name, msPerFight: result.msPerFight.median, searchMs: result.search?.elapsedMs }));
    }
  } else {
    const reference = await import('../../src/lib/engine/pve/celestial.js?perfReference');
    if (reference.__BENCHMARK_REFERENCE_DIGEST !== manifest.celestialSourceDigest) throw new Error('Reference transform not loaded; use --config scripts/performance/reference.config.mjs');
    for (const difficulty of ['NORMAL', 'HARD']) for (const row of celestialParityCases()) {
      if (expired()) break;
      const party = row.party.map(prepareCelestialMember), opts = { difficulty, party };
      if (command === 'parity') {
        for (const hook of [false, true]) for (const log of [false, true]) for (let i = 0; i < 4; i++) {
          const checks = [];
          for (const run of [reference.simulateCelestial, simulateCelestial]) {
            const counts = {}, trace = createHash('sha256');
            const track = (rng, key) => { const fn = () => { counts[key] = (counts[key] ?? 0) + 1; return rng(); };
              const lanes = new Map(); fn.lane = (name) => { if (!lanes.has(name)) lanes.set(name, track(rng.lane(name), `${key}/${name}`)); return lanes.get(name); }; return fn; };
            const afterTick = hook ? (ts, state) => {
              trace.update(JSON.stringify([ts, state.bossHp, state.members.map((m) => m.hp), state.adds.map((a) => a.hp)]));
              if (ts === 1000 && state.members[0].hp > 1) state.members[0].hp -= 1;
            } : null;
            const result = run({ ...opts, rng: track(fightRng(seed, i), 'root'), log, afterTick });
            if (row.timeout && !result.timedOut) throw new Error('Timeout case ended early');
            if (row.expires && log && !result.log.some((ev) => ev.type === 'spell_end')) throw new Error('Transform expiry not exercised');
            checks.push(digest({ result, counts, callback: trace.digest('hex') }));
          }
          if (checks[0] !== checks[1]) throw new Error(`Parity failed: ${difficulty}/${row.name}/${hook}/${log}/${i}`);
          report.cases.push({ name: `${difficulty}/${row.name}`, hook, log, fight: i, checksum: checks[0] });
        }
      } else {
        const runners = [reference.simulateCelestial, simulateCelestial], times = [[], []], checks = [[], []];
        for (const run of runners) for (let i = 0; i < warmup; i++) run({ ...opts, rng: fightRng(seed, i) });
        for (let rep = 0; rep < reps; rep++) for (const v of rep % 2 ? [1, 0] : [0, 1]) {
          const results = [], t = performance.now();
          for (let i = 0; i < fights; i++) results.push(runners[v]({ ...opts, rng: fightRng(seed, i) }));
          times[v].push((performance.now() - t) / fights); checks[v].push(digest(results));
        }
        if (new Set(checks.flat()).size !== 1) throw new Error('Paired outcomes changed');
        const result = { name: `${difficulty}/${row.name}`, referenceMs: median(times[0]), candidateMs: median(times[1]),
          medianPairedTimeReduction: median(times[0].map((ms, i) => 1 - times[1][i] / ms)), repetitions: times, checksum: checks[0][0] };
        report.cases.push(result); console.log(JSON.stringify(result));
      }
    }
  }
  report.elapsedMs = performance.now() - began;
  const tag = option('--tag', command);
  if (!/^[a-z0-9-]{1,64}$/.test(tag)) throw new Error('Invalid report tag');
  output(`${tag}.json`, report);
  console.log(JSON.stringify({ report: join(folder, `${tag}.json`), cases: report.cases.length, stoppingReason: report.stoppingReason, elapsedMs: report.elapsedMs }));
} else {
  throw new Error('Use freeze, run, parity or paired; see docs/Reference/simulator-performance.md');
}
