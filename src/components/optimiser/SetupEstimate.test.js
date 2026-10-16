// The Optimiser setup's Estimate section (simulation.md §Estimates): what it shows from a saved Push run and
// from a run saved before runs kept their cost (its debug summary).
import { describe, it, expect } from 'vitest';
import { setup as mount } from '../ui/testkit.js';
import SetupEstimate from './SetupEstimate.svelte';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { prepare } from '../../lib/search/search.js';
import { requestOf } from '../../lib/ui/optimiserSetup.js';
import { normaliseRun } from '../../lib/model/runs.js';

const character = fixtureCharacter('WARRIOR');
const SETUP = { presetId: 'p1', target: { kind: 'chapter', chapter: 7, level: 1 }, objective: { kind: 'push', target: 0.95 }, space: {}, effort: 'quick', seed: 1 };

/** A saved Push run of SETUP that optimised one rung: 9.18 M fights in 173 s. */
function pushRun(o = {}) {
  const prep = prepare(requestOf(SETUP, character));
  const sizes = prep.space.domainSizes(prep.space.start);
  const domains = Object.fromEntries(prep.space.blocks.filter((b) => b.enabled).map((b) => [b.id, sizes[b.id] ?? 1]));
  return normaliseRun({
    id: 'p', schema: 2, at: '2026-10-15T23:56:47.000Z', target: { kind: 'chapter', key: prep.target.key }, objective: { kind: 'push', target: 0.95 },
    space: prep.requestEcho.space, budget: { level: 'quick' }, headline: { evaluated: 0 },
    cost: { strategy: 'local', starts: 5, domains, lanes: 1, evaluated: 11266, rung: { key: prep.target.key, label: 'level 7-1' }, fights: { search: 5854984, minimise: 3323840, confirm: 3192 }, elapsedMs: 173000 },
    ...o,
  });
}

describe('SetupEstimate', () => {
  it('a saved Push run of this setup sets the figures and the time at its observed speed', () => {
    const ui = mount(SetupEstimate, { setup: SETUP, character, history: [pushRun()] });
    expect(ui.q('[data-testid="estimate-source"]').textContent).toBe('From your past run of this setup.');
    expect(ui.q('[data-testid="estimate-fights"] .num').textContent).toBe('9,182,016');
    expect(ui.q('[data-testid="estimate-time"]').textContent).toMatch(/about 2 min|about 3 min/);
    expect(ui.q('[data-testid="estimate-push"]')).not.toBeNull();
    ui.done();
  });

  it('a run with only a debug summary says where its figures come from', () => {
    const { cost, ...rest } = pushRun();
    const old = normaliseRun({
      ...rest,
      debug: {
        level: 'builds', blocks: [],
        phases: [{ id: 'screen', builds: 4, fights: 152, wallMs: 1000 }, { id: 'search', builds: 11266, fights: 5854832, wallMs: 108000 }, { id: 'minimise', builds: 10494, fights: 3323840, wallMs: 64000 }],
        totals: { builds: 22828, fights: 9272288, wallMs: 188770 },
      },
    });
    expect(cost.rung.label).toBe('level 7-1');
    const ui = mount(SetupEstimate, { setup: SETUP, character, history: [old] });
    expect(ui.q('[data-testid="estimate-source"]').textContent).toMatch(/^From your past run of this setup\. It was saved before runs kept their cost: fights per build and speed come from its debug summary/);
    ui.done();
  });
});
