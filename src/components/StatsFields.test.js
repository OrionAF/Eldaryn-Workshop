import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StatsFields from './StatsFields.svelte';
import { offensiveStats } from '../lib/dps.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

const FIELDS = [
  { key: 'attack', label: 'Attack', kind: 'flat', base: 10 },
  { key: 'crit', label: 'Critical %', kind: 'pct', base: 0 },
];

it('renders formatted values and commits a parsed value on blur', () => {
  let lastChange = null;
  const values = offensiveStats({ attack: 48124, crit: 6.2 });
  const app = mount(StatsFields, {
    target,
    props: { values, fields: FIELDS, onChange: (k, v) => (lastChange = [k, v]) },
  });
  flushSync();

  const inputs = [...target.querySelectorAll('input')];
  expect(inputs[0].value).toBe('48.124'); // flat, "." thousands grouping
  expect(inputs[1].value).toBe('6.2'); // pct, "." decimal

  inputs[0].value = '2.664'; // "." thousands separator per the game's format
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  inputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  expect(lastChange).toEqual(['attack', 2664]);
  unmount(app);
});

it('Enter key blurs the field, committing the value', () => {
  let lastChange = null;
  const values = offensiveStats({ crit: 5 });
  const app = mount(StatsFields, {
    target,
    props: { values, fields: FIELDS, onChange: (k, v) => (lastChange = [k, v]) },
  });
  flushSync();

  const critInput = target.querySelectorAll('input')[1];
  critInput.focus(); // .blur() below is a no-op in jsdom unless actually focused first
  critInput.value = '9.5';
  critInput.dispatchEvent(new Event('input', { bubbles: true }));
  critInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();

  expect(lastChange).toEqual(['crit', 9.5]);
  unmount(app);
});

it('readOnly renders plain text, no inputs', () => {
  const values = offensiveStats({ attack: 100, crit: 5 });
  const app = mount(StatsFields, { target, props: { values, fields: FIELDS, readOnly: true } });
  flushSync();

  expect(target.querySelectorAll('input').length).toBe(0);
  expect(target.textContent).toContain('100');
  expect(target.textContent).toContain('5');
  unmount(app);
});

it('highlights a field only when it is numerically larger than otherValues', () => {
  const values = offensiveStats({ attack: 200, crit: 5 });
  const otherValues = offensiveStats({ attack: 100, crit: 5 });
  const app = mount(StatsFields, { target, props: { values, otherValues, fields: FIELDS, readOnly: true } });
  flushSync();

  const labels = [...target.querySelectorAll('label')];
  expect(labels[0].classList.contains('highlight')).toBe(true); // attack: 200 > 100
  expect(labels[1].classList.contains('highlight')).toBe(false); // crit: equal, no highlight
  unmount(app);
});

it('shows the derived PVP effect percentage next to pvp_attack/pvp_defense', () => {
  const values = offensiveStats({ pvp_attack: 303, pvp_defense: 283 });
  const app = mount(StatsFields, {
    target,
    props: {
      values,
      readOnly: true,
      fields: [
        { key: 'pvp_attack', label: 'PVP Attack', kind: 'flat', base: 0 },
        { key: 'pvp_defense', label: 'PVP Defense', kind: 'flat', base: 0 },
      ],
    },
  });
  flushSync();

  expect(target.textContent).toContain('60.2%');
  expect(target.textContent).toContain('58.6%');
  unmount(app);
});

// --- The capped-stat readout: EFFECTIVE / RAW / N% GAIN ---

const CAPPED_FIELDS = [
  { key: 'block_chance', label: 'Block Chance', kind: 'pct', base: 0, softCap: 40, cap: 80 },
  { key: 'crit', label: 'Critical %', kind: 'pct', base: 0, softCap: 50, cap: 90 },
];

it('an overcapped stat shows all three of the game stat sheet figures', () => {
  // The observation the curve was confirmed against: raw 56.4 -> 52.5 / 57% GAIN.
  const app = mount(StatsFields, {
    target,
    props: {
      values: offensiveStats({ block_chance: 52.452, crit: 20 }),
      rawValues: offensiveStats({ block_chance: 56.4, crit: 20 }),
      fields: CAPPED_FIELDS,
      readOnly: true,
    },
  });
  flushSync();

  const text = target.textContent.replace(/\s+/g, ' ');
  expect(text).toContain('52.452'); // EFFECTIVE - the only one combat uses
  expect(text).toContain('RAW 56.4 · 57% GAIN');
  unmount(app);
});

it('a stat below its soft cap shows the value alone - no RAW line, no GAIN', () => {
  const app = mount(StatsFields, {
    target,
    props: {
      values: offensiveStats({ block_chance: 20, crit: 20 }),
      rawValues: offensiveStats({ block_chance: 20, crit: 20 }),
      fields: CAPPED_FIELDS,
      readOnly: true,
    },
  });
  flushSync();

  const text = target.textContent;
  expect(text).not.toContain('RAW');
  expect(text).not.toContain('GAIN');
  unmount(app);
});
