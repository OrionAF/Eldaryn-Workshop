/**
 * Tests dps.js - the PVE DPS model and gear-swap comparison.
 * 1:1 port of EldarynTracker/test_dps.py (18 cases). This math silently
 * produces plausible-but-wrong numbers if a base value or stacking rule is off,
 * so coverage here is worth it.
 */
import { describe, it, expect } from 'vitest';
import * as dps from './dps.js';

const S = dps.offensiveStats;

// Match the Python approx(): abs(a-b) <= tol * max(1, abs(b)).
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

// --- Attack decompose / recombine ---
it('Attack decompose/recombine matches the real profile screenshot (48.124 @ +34.3%)', () => {
  const flat = dps.flatAttackFromDisplay(48.124, 34.3);
  expect(approx(flat, 35.833, 1e-4)).toBe(true);
  expect(approx(dps.finalAttack(flat, 34.3), 48.124, 1e-4)).toBe(true);
});

it('DPS with no crit/double-hit at base speed equals raw attack', () => {
  const p = S({ attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 0 });
  expect(approx(dps.computeDps(p), 100.0)).toBe(true);
});

it('Crit contribution: 50% crit at 200% mult gives 1.5x', () => {
  const p = S({ attack: 100, speed: 100, crit: 50, crit_mult: 200, double_hit: 0 });
  expect(approx(dps.computeDps(p), 150.0)).toBe(true);
});

it('Speed and Double Hit scale DPS (no crit case)', () => {
  const p = S({ attack: 100, speed: 200, crit: 0, crit_mult: 150, double_hit: 100 });
  expect(approx(dps.computeDps(p), 400.0)).toBe(true);
});

it('Double-hit second strike deals normal damage and cannot crit', () => {
  const p = S({ attack: 100, speed: 100, crit: 100, crit_mult: 200, double_hit: 100 });
  expect(approx(dps.computeDps(p), 300.0)).toBe(true);
  expect(approx(dps.computeDps(p), 400.0)).toBe(false);
});

// --- Timed Attack % buffs (SETTLED: additive into the total, owner 2026-07-28) ---
it('buffedAttack: an Attack % buff adds into the % total, it does not scale the displayed value', () => {
  // Owner's own example: 175% Attack %, +20% sigil -> 195%, not 175 x 1.2.
  const flat = 1000;
  const displayed = dps.finalAttack(flat, 175); // 2750
  expect(approx(displayed, 2750)).toBe(true);
  expect(approx(dps.buffedAttack(displayed, 175, 0, 20), dps.finalAttack(flat, 195))).toBe(true);
  // The wrong (old) model would have been displayed * 1.2 = 3300.
  expect(approx(dps.buffedAttack(displayed, 175, 0, 20), 3300)).toBe(false);
});

it('buffedAttack: a flat buff joins the flat pool BEFORE the percentage applies', () => {
  const displayed = dps.finalAttack(1000, 50); // 1500
  expect(approx(dps.buffedAttack(displayed, 50, 200, 0), dps.finalAttack(1200, 50))).toBe(true);
  // Combined flat + pct: both land in their own pool first.
  expect(approx(dps.buffedAttack(displayed, 50, 200, 25), dps.finalAttack(1200, 75))).toBe(true);
});

it('buffedAttack: with no existing Attack %, the two models coincide', () => {
  // This is why the bug hid for so long - it is invisible on a 0% build.
  expect(approx(dps.buffedAttack(1000, 0, 0, 20), 1200)).toBe(true);
});

// --- Swap math ---
it('Swapping a piece for an identical one produces no DPS change', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const piece = S({ attack: 5, attack_pct: 4, crit: 2 });
  const r = dps.compareSwap(profile, piece, piece);
  expect(approx(r.pct_change, 0.0)).toBe(true);
  expect(r.verdict).toBe('no change');
});

it('Pure +flat-attack swap is an upgrade with correct recombined attack', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ attack: 5 });
  const nw = S({ attack: 15 });
  const r = dps.compareSwap(profile, old, nw);
  expect(r.verdict).toBe('upgrade');
  const expectedFinal = (35.833 - 5 + 15) * 1.343;
  expect(approx(r.after.attack, expectedFinal, 1e-3)).toBe(true);
});

it('Flat-attack-up / attack%-down swap nets the two correctly', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ attack: 2, attack_pct: 10 });
  const nw = S({ attack: 52, attack_pct: 0 });
  const r = dps.compareSwap(profile, old, nw);
  const expectedFinal = (35.833 - 2 + 52) * (1 + 24.3 / 100);
  expect(approx(r.after.attack, expectedFinal, 1e-3)).toBe(true);
  expect(approx(r.after.attack_pct, 24.3)).toBe(true);
});

it('Swap that sheds a big Attack% for little flat Attack is a downgrade', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ attack: 1, attack_pct: 30 });
  const nw = S({ attack: 5, attack_pct: 0 });
  const r = dps.compareSwap(profile, old, nw);
  expect(r.verdict).toBe('downgrade');
});

it('Crit % swaps stack additively (base 0)', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ crit: 2 });
  const nw = S({ crit: 5 });
  const r = dps.compareSwap(profile, old, nw);
  expect(approx(r.after.crit, 6 - 2 + 5)).toBe(true);
  expect(r.verdict).toBe('upgrade');
});

it('Double Hit swaps stack additively (base 0)', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ double_hit: 2.8 });
  const nw = S({ double_hit: 10 });
  const r = dps.compareSwap(profile, old, nw);
  expect(approx(r.after.double_hit, 2.8 - 2.8 + 10)).toBe(true);
});

it('Speed and Crit Mult stack additively', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8 });
  const old = S({ speed: 30, crit_mult: 12 });
  const nw = S({ speed: 50, crit_mult: 20 });
  const r = dps.compareSwap(profile, old, nw);
  expect(approx(r.after.speed, 232 - 30 + 50)).toBe(true);
  expect(approx(r.after.crit_mult, 162 - 12 + 20)).toBe(true);
});

// --- HPS ---
it('HPS regen component = health * hp_regen%', () => {
  const p = S({ health: 1000, hp_regen: 5, lifesteal: 0, attack: 0 });
  const h = dps.computeHps(p);
  expect(approx(h.hps_regen, 50.0)).toBe(true);
  expect(approx(h.hps_lifesteal, 0.0)).toBe(true);
  expect(approx(h.total_hps, 50.0)).toBe(true);
});

it('HPS lifesteal = DPS * lifesteal% and inherits the crit bonus', () => {
  const p = S({ attack: 100, speed: 100, crit: 50, crit_mult: 200, double_hit: 0, health: 0, hp_regen: 0, lifesteal: 10 });
  const dpsVal = dps.computeDps(p);
  const h = dps.computeHps(p);
  expect(approx(dpsVal, 150.0)).toBe(true);
  expect(approx(h.hps_lifesteal, 15.0)).toBe(true);
  expect(h.hps_lifesteal).toBeGreaterThan(100 * 0.1);
});

it('Total HPS is regen + lifesteal', () => {
  const p = S({ attack: 100, speed: 100, crit: 0, crit_mult: 150, health: 1000, hp_regen: 2, lifesteal: 10 });
  const h = dps.computeHps(p);
  expect(approx(h.total_hps, h.hps_regen + h.hps_lifesteal)).toBe(true);
  expect(approx(h.hps_regen, 20.0)).toBe(true);
  expect(approx(h.hps_lifesteal, 10.0)).toBe(true);
});

it('Health swaps decompose/recombine like Attack', () => {
  const profile = S({ attack: 48, attack_pct: 34.3, health: 1000, health_pct: 25 });
  const old = S({ health: 10, health_pct: 5 });
  const nw = S({ health: 110, health_pct: 0 });
  const after = dps.applySwap(profile, old, nw);
  const flat = 1000 / 1.25;
  const newFlat = flat - 10 + 110;
  const newPct = 25 - 5 + 0;
  expect(approx(after.health, newFlat * (1 + newPct / 100))).toBe(true);
  expect(approx(after.health_pct, 20)).toBe(true);
});

// Pins the removal so the HPS fields cannot drift back in.
it('compare_swap reports no HPS fields, and a lifesteal-only swap is DPS-neutral', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, speed: 232, crit: 6, crit_mult: 162, double_hit: 2.8, health: 94.943, health_pct: 27.6, hp_regen: 3.4, lifesteal: 22.9 });
  const old = S({ lifesteal: 2 });
  const nw = S({ lifesteal: 12 });
  const r = dps.compareSwap(profile, old, nw);
  expect(approx(r.pct_change, 0.0)).toBe(true);
  expect(r.verdict).toBe('no change');
  for (const k of ['current_hps', 'new_hps', 'hps_delta', 'hps_pct_change']) {
    expect(r).not.toHaveProperty(k);
  }
  expect(approx(r.after.lifesteal, 32.9)).toBe(true);
});

// --- Defensive/PVP fields: carried, but inert in THIS module (see dps.js's
// scope statement; they are read elsewhere) ---
it('offensiveStats defaults every defensive/PVP field to 0', () => {
  const p = S();
  for (const k of ['block_chance', 'miss_chance', 'blind_chance', 'penetration', 'dmg_reduction', 'paralyze_chance', 'pvp_attack', 'pvp_defense']) {
    expect(p[k]).toBe(0);
  }
});

it('Defensive/PVP fields stack additively through applySwap, same as crit/lifesteal', () => {
  const profile = S({ attack: 48.124, attack_pct: 34.3, block_chance: 4, dmg_reduction: 10, pvp_attack: 100, pvp_defense: 50 });
  const old = S({ block_chance: 1, dmg_reduction: 2, pvp_attack: 20, pvp_defense: 10 });
  const nw = S({ block_chance: 3, dmg_reduction: 5, pvp_attack: 220, pvp_defense: 30 });
  const after = dps.applySwap(profile, old, nw);
  expect(approx(after.block_chance, 4 - 1 + 3)).toBe(true);
  expect(approx(after.dmg_reduction, 10 - 2 + 5)).toBe(true);
  expect(approx(after.pvp_attack, 100 - 20 + 220)).toBe(true);
  expect(approx(after.pvp_defense, 50 - 10 + 30)).toBe(true);
});

it('Defensive/PVP fields do not affect DPS/HPS', () => {
  const base = { attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 0, health: 1000, hp_regen: 5, lifesteal: 0 };
  const plain = dps.computeDps(S(base));
  const loaded = dps.computeDps(S({ ...base, block_chance: 50, miss_chance: 50, dmg_reduction: 90, pvp_attack: 500, pvp_defense: 500 }));
  expect(approx(plain, loaded)).toBe(true);
});

it('pvpEffect matches the diminishing-returns formula from a real combat example', () => {
  expect(approx(dps.pvpEffect(303), 60.2, 0.05)).toBe(true);
  expect(approx(dps.pvpEffect(283), 58.6, 0.05)).toBe(true);
  expect(dps.pvpEffect(0)).toBe(0);
});
