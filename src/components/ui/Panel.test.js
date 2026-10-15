import { it, expect } from 'vitest';
import Panel from './Panel.svelte';
import { setup, html } from './testkit.js';

it('is a section labelled by its own heading, with a unique id per instance', () => {
  const a = setup(Panel, { title: 'Identity', children: html('<p>a</p>') });
  const b = setup(Panel, { title: 'Identity', children: html('<p>b</p>') });
  const idA = a.q('section').getAttribute('aria-labelledby');
  const idB = b.q('section').getAttribute('aria-labelledby');
  expect(idA).not.toBe(idB);
  expect(document.getElementById(idA).textContent).toBe('Identity');
  a.done();
  b.done();
});

it('level primary adds the .primary frame; secondary does not', () => {
  const p = setup(Panel, { title: 'T', level: 'primary' });
  const s = setup(Panel, { title: 'T' });
  expect(p.q('.panel').classList.contains('primary')).toBe(true);
  expect(s.q('.panel').classList.contains('primary')).toBe(false);
  p.done();
  s.done();
});

it('renders exactly one scope badge, as text, with the oblivion realm ring', () => {
  const { qa, q, done } = setup(Panel, { title: 'Relics', scope: 'oblivion' });
  expect(qa('.scope-badge').length).toBe(1);
  expect(q('.scope-badge').textContent).toBe('Oblivion');
  expect(q('.panel').classList.contains('realm-oblivion')).toBe(true);
  done();
});

it('has no badge without a scope, and scopeLabel overrides the name', () => {
  const none = setup(Panel, { title: 'T' });
  expect(none.qa('.scope-badge').length).toBe(0);
  none.done();
  const named = setup(Panel, { title: 'T', scope: 'preset', scopeLabel: 'Preset: Farm build' });
  expect(named.q('.scope-badge').textContent).toBe('Preset: Farm build');
  named.done();
});

it('stale shows the STALE tag', () => {
  const { q, done } = setup(Panel, { title: 'T', stale: true });
  expect(q('.stale-tag').textContent).toBe('Stale');
  done();
});

it('loading keeps the header, skeletons the body and sets aria-busy', () => {
  const { q, done } = setup(Panel, { title: 'T', loading: true, children: html('<p class="real">x</p>') });
  expect(q('h2').textContent).toBe('T');
  expect(q('[data-skeleton]')).not.toBeNull();
  expect(q('.real')).toBeNull();
  expect(q('section').getAttribute('aria-busy')).toBe('true');
  done();
});

it('error puts an alert banner on top of the body', () => {
  const { q, done } = setup(Panel, { title: 'T', error: 'Could not load', children: html('<p>x</p>') });
  expect(q('[role=alert]').textContent).toContain('Could not load');
  done();
});
