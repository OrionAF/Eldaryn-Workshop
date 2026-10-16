// Estimate benchmark (backlog §3; simulation.md §Estimates): runs the real optimize() on sanitised profile
// captures for small setups of each objective family, records the builds and fights each phase used, and
// checks them against estimateRun. Skipped by default (minutes of simulation); run with
//   ESTIMATE_BENCH=1 npx vitest run src/lib/search/estimate.bench.test.js
// ESTIMATE_BENCH_OUT=<file> also writes the measurements (with each saved run) as JSON; ESTIMATE_BENCH_FROM=<file>
// re-reads such a file and re-estimates its runs without simulating; ESTIMATE_BENCH_CHECK=1 asserts that each
// run's fights fall inside the no-history range and that the run fed back as history predicts it within 30%.
import { describe, it, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { optimize, prepare } from './search.js';
import { estimateRun, nominalStarts, sweepBuilds } from './estimate.js';
import { BLOCKS } from './space.js';
import { runFromResult, normaliseRun } from '../model/runs.js';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { cloneAsOpponent } from '../features/duel.js';
import { buildFighter } from '../build/fighter.js';
import w72 from '../__fixtures__/real/profile-warrior-l72.json';
import w73 from '../__fixtures__/real/profile-warrior-l73.json';
import s85 from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';

const env = typeof process !== 'undefined' ? process.env : {};
const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const load = (p) => normaliseCharacter(gameProfileToCharacter(p));
const CH = { w72: load(w72), w73: load(w73), s85: load(s85) };

/** A character with a clone of its own active preset as PVP opponent 'self' (a near-even duel). */
function withSelfOpponent(c) {
  const f = buildFighter(c, c.activePresetId);
  const raw = JSON.parse(JSON.stringify(c));
  raw.opponents = [{ ...cloneAsOpponent(c, c.activePresetId, f.spec, 'self'), id: 'self' }];
  return normaliseCharacter(raw);
}

const DUMMY = { kind: 'dummy', seconds: 60 };
/** The measured setups: name, character, target, objective, allowed blocks. Quick effort, the default starts. */
export const SETUPS = [
  { name: 'dps-dummy-sigils', ch: 's85', target: DUMMY, objective: { kind: 'dps' }, space: only('sigils') },
  { name: 'dps-dummy-minor-mount', ch: 'w73', target: DUMMY, objective: { kind: 'dps' }, space: only('minorGlyphs', 'mount') },
  { name: 'dps-dummy-talents', ch: 's85', target: DUMMY, objective: { kind: 'dps' }, space: only('talents') },
  { name: 'dps-dummy-talents-mount-major', ch: 'w73', target: DUMMY, objective: { kind: 'dps' }, space: only('talents', 'mount', 'majorGlyphs') },
  { name: 'dps-dummy-all', ch: 'w73', target: DUMMY, objective: { kind: 'dps' }, space: undefined },
  { name: 'win-dungeon-sigils', ch: 's85', target: { kind: 'dungeon', id: 'dungeon_7', step: 6 }, objective: { kind: 'win-chance' }, space: only('sigils') },
  { name: 'win-chapter-minor', ch: 's85', target: { kind: 'chapter', chapter: 10, level: 7 }, objective: { kind: 'win-chance' }, space: only('minorGlyphs') },
  { name: 'win-chapter-talents', ch: 's85', target: { kind: 'chapter', chapter: 10, level: 8 }, objective: { kind: 'win-chance' }, space: only('talents') },
  { name: 'win-chapter-talents-mount-major', ch: 'w72', target: { kind: 'chapter', chapter: 10, level: 3 }, objective: { kind: 'win-chance' }, space: only('talents', 'mount', 'majorGlyphs') },
  { name: 'win-chapter-sigils-talents', ch: 'w72', target: { kind: 'chapter', chapter: 10, level: 3 }, objective: { kind: 'win-chance' }, space: only('sigils', 'talents') },
  { name: 'win-chapter-all', ch: 's85', target: { kind: 'chapter', chapter: 10, level: 7 }, objective: { kind: 'win-chance' }, space: undefined },
  { name: 'pvp-self-mount-major', ch: 'w73', pvp: true, target: { kind: 'pvp', opponentIds: ['self'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' }, space: only('mount', 'majorGlyphs') },
  { name: 'fortress-sigils', ch: 'w73', target: { kind: 'fortressBoss', group: 'TOP' }, objective: { kind: 'dps' }, space: only('sigils') },
];

/** A saved run rebuilt from an older measurement file that kept only the counts (same request, so same domains). */
function savedRunOf(request, m) {
  const prep = prepare(request);
  const sizes = prep.space.domainSizes(prep.space.start);
  const domains = Object.fromEntries(prep.space.blocks.filter((b) => b.enabled).map((b) => [b.id, sizes[b.id] ?? 1]));
  return normaliseRun({
    id: `bench-${m.name}`, schema: 2, at: '2026-10-15T00:00:00.000Z', target: { kind: prep.target.kind, key: prep.target.key, seconds: prep.target.seconds },
    objective: { kind: prep.objective.kind }, space: prep.requestEcho.space, budget: { level: prep.effort.level },
    headline: { evaluated: m.builds }, cost: { strategy: m.strategy, starts: m.starts, domains, lanes: m.lanes, fights: m.fights, elapsedMs: m.ms },
  });
}

/** One measured setup: the run's cost (as saved on the run) next to the estimate without and with it as history. */
async function measure(s) {
  const character = s.pvp ? withSelfOpponent(CH[s.ch]) : CH[s.ch];
  const request = { character, presetId: character.activePresetId, target: s.target, objective: s.objective, space: s.space, effort: 'quick', seed: 1 };
  const saved = FROM.find((x) => x.name === s.name);
  const t0 = Date.now();
  const result = saved ? { status: 'done' } : await optimize(request);
  const run = saved ? saved.run ?? savedRunOf(request, saved) : runFromResult(result, { id: `bench-${s.name}`, at: new Date(2026, 9, 15).toISOString() });
  return { name: s.name, ms: saved ? saved.ms : Date.now() - t0, status: result.status, run, prior: estimateRun(request), fed: estimateRun(request, { history: [run] }) };
}

const FROM = env.ESTIMATE_BENCH_FROM ? env.ESTIMATE_BENCH_FROM.split(';').flatMap((f) => JSON.parse(readFileSync(f, 'utf8'))) : [];
const band = (e, k) => [e[k].lo, e[k].likely, e[k].hi];
const brief = (r) => {
  const c = r.run.cost;
  const sweep = 1 + Object.values(c.domains).reduce((n, d) => n + d - 1, 0);
  return {
    name: r.name, ms: r.ms, strategy: c.strategy, builds: r.run.headline.evaluated, fights: c.fights, lanes: c.lanes,
    perBuild: Math.round(c.fights.total / c.lanes / r.run.headline.evaluated),
    starts: nominalStarts(c.domains), sweep, talentShare: sweep > 1 ? Math.max(0, (c.domains.talents ?? 1) - 1) / (sweep - 1) : 0,
    rho: c.strategy === 'local' ? r.run.headline.evaluated / (nominalStarts(c.domains) * sweepBuilds(c.domains, r.prior.family)) : null,
    prior: { builds: band(r.prior, 'builds'), fights: band(r.prior, 'fights') },
    fed: { builds: band(r.fed, 'builds'), fights: band(r.fed, 'fights'), tier: r.fed.source.tier },
    run: r.run,
  };
};

describe.skipIf(!env.ESTIMATE_BENCH)('estimate benchmark (real optimize runs)', () => {
  const out = [];
  const pick = env.ESTIMATE_BENCH_ONLY ? SETUPS.filter((s) => env.ESTIMATE_BENCH_ONLY.split(',').includes(s.name)) : SETUPS;
  for (const s of pick) {
    it(s.name, async () => {
      const r = await measure(s);
      expect(r.status).toBe('done');
      const b = brief(r);
      out.push(b);
      console.log(JSON.stringify({ ...b, run: undefined }));
      if (env.ESTIMATE_BENCH_OUT) writeFileSync(env.ESTIMATE_BENCH_OUT, JSON.stringify(out, null, 1));
      if (env.ESTIMATE_BENCH_CHECK) {
        const used = b.fights.total;
        expect(used).toBeGreaterThanOrEqual(b.prior.fights[0]);
        expect(used).toBeLessThanOrEqual(b.prior.fights[2]);
        expect(Math.abs(b.fed.fights[1] - used) / used).toBeLessThanOrEqual(0.3);
      }
    }, 1800000);
  }

  // leave one out: each measured run estimated from the other measured runs (the 'like' / 'family' tiers)
  it.skipIf(!FROM.length)('leave one out', () => {
    const rows = [];
    for (const s of pick) {
      const m = FROM.find((x) => x.name === s.name);
      if (!m) continue;
      const character = s.pvp ? withSelfOpponent(CH[s.ch]) : CH[s.ch];
      const request = { character, presetId: character.activePresetId, target: s.target, objective: s.objective, space: s.space, effort: 'quick', seed: 1 };
      const others = FROM.filter((x) => x.name !== s.name).map((x) => {
        const o = SETUPS.find((y) => y.name === x.name);
        const ch = o.pvp ? withSelfOpponent(CH[o.ch]) : CH[o.ch];
        return { ...(x.run ?? savedRunOf({ character: ch, presetId: ch.activePresetId, target: o.target, objective: o.objective, space: o.space, effort: 'quick' }, x)), at: `2026-10-15T00:00:${String(rows.length).padStart(2, '0')}.000Z` };
      });
      const e = estimateRun(request, { history: others });
      rows.push({ name: s.name, actual: m.fights.total, tier: e.source.tier, runs: e.source.runs, fights: band(e, 'fights') });
    }
    console.log(JSON.stringify(rows));
    if (env.ESTIMATE_BENCH_OUT) writeFileSync(`${env.ESTIMATE_BENCH_OUT}.loo.json`, JSON.stringify(rows, null, 1));
  });
});
