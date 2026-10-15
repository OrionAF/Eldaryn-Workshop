// @vitest-environment node
// Guards the end of the legacy-styling migration: no component draws a rarity fill, uses the retired
// --color-* / old spacing aliases, hardcodes a colour, or ships a bare native <select>.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(here).filter((f) => !/\.test\.js$/.test(f) && /\.(svelte|css|js)$/.test(f));
const svelte = files.filter((f) => f.endsWith('.svelte'));
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => relative(here, f);
const css = read(join(here, 'app.css'));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('legacy styling remnants', () => {
  it('nothing references the retired --color-* aliases, and app.css no longer defines them', () => {
    const users = files.filter((f) => /--color-/.test(stripComments(read(f)))).map(rel);
    expect(users).toEqual([]);
  });

  it('the old spacing / radius / heading / nav aliases are gone', () => {
    const re = /--(space-\d|radius(-[a-z]+)?\b|font-heading|font-body|nav-[a-z]+|content-max-width|bottom-bar-h)/;
    const users = files.filter((f) => re.test(stripComments(read(f)))).map(rel);
    expect(users).toEqual([]);
  });

  it('no component hardcodes a colour', () => {
    const bad = svelte.filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(stripComments(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });

  it('no component paints a rarity fill or the game border colour', () => {
    const bad = svelte.filter((f) => /--rarity-(bg|border)\b/.test(read(f))).map(rel);
    expect(bad).toEqual([]);
  });

  it('every native <select> lives in ui/Select', () => {
    const bad = svelte.filter((f) => /<select\b/.test(read(f)) && !f.endsWith('ui/Select.svelte')).map(rel);
    expect(bad).toEqual([]);
  });

  it('rarity cards are an edge and glow on s3, titles use the on-raised hue', () => {
    const card = css.match(/\.rarity-card\s*\{[^}]*\}/)[0];
    expect(card).toContain('var(--surface-3)');
    expect(card).toContain('inset 4px 0 0 var(--r-edge');
    expect(card).not.toContain('--rarity-bg');
    expect(css.match(/\.rarity-title\s*\{[^}]*\}/)[0]).toContain('var(--r-up');
    for (const t of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ancient', 'divine', 'eternal', 'oblivion'])
      expect(css.match(new RegExp(`\\.rarity-${t} \\{[^}]*\\}`))[0]).toContain(`--r-up: var(--rarity-${t}-fg-on-raised)`);
  });

  it('talent descriptions are prose in the UI face, not the legacy mono list', () => {
    expect(stripComments(css)).not.toMatch(/\.talent-value/);
    expect(read(join(here, 'components/talents/TalentTierList.svelte'))).toMatch(/\.talent-value \{[^}]*font-family: var\(--font-ui\)/);
  });
});
