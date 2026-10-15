import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { setup, click } from '../ui/testkit.js';
import JobsTray from './JobsTray.svelte';
import { __resetJobs, startJob } from '../../lib/jobs.svelte.js';

let ui;
beforeEach(() => localStorage.clear());
afterEach(() => ui?.done());

const step = (id, o = {}) => ({ id, state: 'queued', reason: null, pass: 0, tried: 0, fights: 0, improved: false, ...o });

it('the Jobs tray lists the search steps of a running optimiser job, leaving out the blocks turned off', () => {
  let post;
  __resetJobs({
    run: (request, { onProgress }) => {
      post = onProgress;
      return { promise: new Promise(() => {}), cancel() {} };
    },
  });
  startJob({ tool: 'optimiser', title: 'Optimise Main', request: { mode: 'optimize' } });
  post({ phases: [{ id: 'search', label: 'Search', state: 'current' }], searchSteps: [
    step('equipmentSet', { state: 'done', pass: 1, tried: 2, fights: 40, improved: true }),
    step('spec', { state: 'skipped', reason: 'off' }),
    step('talents', { state: 'running', pass: 1, tried: 5, fights: 90 }),
  ] });
  ui = setup(JobsTray);
  flushSync();
  const btn = ui.q('.steplist .toggle');
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  click(btn);
  expect(ui.qa('.steplist li .what').map((e) => e.textContent.replace(/\s+/g, ' ').trim())).toEqual(['1. Gear set: done', '2. Talents: in progress']);
});

it('a job with no search steps (Push, Drop Check) shows no list', () => {
  let post;
  __resetJobs({ run: (request, { onProgress }) => { post = onProgress; return { promise: new Promise(() => {}), cancel() {} }; } });
  startJob({ tool: 'optimiser', title: 'Optimise Main', request: { mode: 'optimize' } });
  post({ phases: [{ id: 'search', label: 'Search', state: 'current' }] });
  ui = setup(JobsTray);
  flushSync();
  expect(ui.q('.steplist')).toBeNull();
});
