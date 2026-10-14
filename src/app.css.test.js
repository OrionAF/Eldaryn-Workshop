// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'app.css'), 'utf8');
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const fontDir = join(here, 'assets', 'fonts');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const outsideRoot = stripComments(css).replace(/:root\s*\{[^}]*\}/g, '');

describe('app.css tokens', () => {
  it('has no hex colour outside a :root block', () => {
    expect(outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it('defines the three font roles and numeric data in tabular mono', () => {
    expect(css).toMatch(/--font-display:\s*'Grenze'/);
    expect(css).toMatch(/--font-ui:\s*'Alegreya Sans'/);
    expect(css).toMatch(/--font-data:\s*'Red Hat Mono'/);
    expect(css).toMatch(/\.num[^{]*\{[^}]*var\(--font-data\)[^}]*tabular-nums/);
  });

  it('keeps legacy class aliases', () => {
    for (const c of ['.btn-gold', '.btn-ghost', '.btn-danger.is-confirming', '.rank-controls button', '.subheading', '.micro-label'])
      expect(css).toContain(c);
  });
});

describe('self-hosted fonts', () => {
  const families = {
    grenze: [700],
    'alegreya-sans': [400, 500, 700],
    'red-hat-mono': [400, 500, 600],
  };
  it('ships 14 woff2 files, each declared with font-display swap, plus OFL texts', () => {
    expect(existsSync(fontDir)).toBe(true);
    const files = readdirSync(fontDir).filter((f) => f.endsWith('.woff2'));
    expect(files).toHaveLength(14);
    for (const [slug, weights] of Object.entries(families))
      for (const w of weights)
        for (const sub of ['latin', 'latin-ext']) {
          const f = `${slug}-${sub}-${w}-normal.woff2`;
          expect(existsSync(join(fontDir, f)), f).toBe(true);
          expect(css).toContain(`assets/fonts/${f}`);
        }
    const faces = css.match(/@font-face\s*\{[^}]*assets\/fonts[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(14);
    for (const face of faces) expect(face).toContain('font-display: swap');
    expect(readdirSync(fontDir).filter((f) => f.startsWith('OFL-'))).toHaveLength(3);
  });

  it('declares size-adjust fallbacks', () => {
    expect(stripComments(css).match(/@font-face[^}]*[^-]size-adjust:/g)).toHaveLength(3);
  });

  it('index.html loads no remote fonts', () => {
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});

describe('text token contrast', () => {
  const tok = (n) => css.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))[1];
  const lum = (hex) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  it('text-ink/soft/muted reach 4.5:1 on every surface', () => {
    for (const t of ['text-ink', 'text-soft', 'text-muted'])
      for (const s of [0, 1, 2, 3, 4])
        expect(ratio(tok(t), tok(`surface-${s}`)), `${t} on surface-${s}`).toBeGreaterThanOrEqual(4.5);
  });
});
