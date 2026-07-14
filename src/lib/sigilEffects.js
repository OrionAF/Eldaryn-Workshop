/**
 * sigilEffects.js - turns a preset's equipped Sigils into simulation
 * EffectDefs (see simulation.js's hook contract). This is the ACTIVE half of
 * the Sigil integration: passive stats already flow through totals.js into
 * the final stat set the sim (and dps.js) receives, so this module only
 * models what happens on a timeline - activation damage, DoTs, and timed
 * stat buffs.
 *
 * ACTIVATION MODEL: every active sigil is auto-activated the moment it
 * comes off cooldown (the game fires them automatically in combat). PURE
 * SELF-BUFF sigils fire at t=0; ENEMY-TARGETING sigils (anything that deals
 * damage - the DAMAGE_KINDS) don't trigger until one second of combat has
 * passed (the in-game 59s mark), so their first activation is at
 * t=SIGIL_FIRST_HIT_DELAY_SEC. Cooldown starts AT activation, so activations
 * land at firstAt, firstAt+cd, firstAt+2cd, ... and a buff's steady-state
 * uptime is duration/cooldown.
 *
 * NUMBERS COME FROM THE CHARACTER: the catalogue (sigilsData.js) only
 * declares each sigil's structure - which stats, durations, cooldowns. The
 * actual stat/damage numbers scale with in-game sigil level and are entered
 * per character on the Sigils screen (character.sigilValues, see model.js's
 * SigilValues shape). buildSigilEffects resolves them; a sigil with no
 * entered numbers simulates as all-zeros.
 *
 * MECHANICS REGISTRY (SIGIL_MECHANICS): most sigils are covered by two
 * generic shapes - a NUKE (entered `damage` on every activation) and a
 * BUFF (entered `active` stat values applied for durationSec). The rest
 * have bespoke shapes the SigilDef schema can't express (stacking bleeds,
 * tick trains); their timing/stack params live HERE, their damage numbers
 * in character.sigilValues like everything else.
 *
 * NOT SIMULATED: sigils whose effect only exists against a boss that
 * fights back or has defenses. The sim's boss is a pure target dummy
 * (no defense stats, no incoming hits - see simulation.js's domain
 * assumptions), so:
 *  - sunder-mark / siegebreaker-mark strip enemy DMG Reduction / Block /
 *    Miss / Blind / HP Regen - a dummy has none to strip, zero DPS effect.
 *  - bulwark-of-thorns / elusive-supremacy build stacks from being hit /
 *    dodging - the dummy never attacks, so stacks never accumulate.
 *  - withering-touch's HP-Regen debuff and thunderbind's paralyze do
 *    nothing to a dummy; their activation DAMAGE still counts (nuke).
 * Each entry carries a `note` so the UI can say why. Modeling these needs
 * a boss model (defense stats + an incoming-attack timeline) - a scope
 * decision, not a code gap.
 *
 * BUFF STATS vs a target dummy: only damage-side stats change the outcome.
 * attack (flat) / attack_pct scale the swing's base damage; crit, crit_mult
 * and double_hit adjust the per-swing roll chances; speed adds swings
 * (via the engine's speedBonus hook). Defensive/sustain stats in a buff
 * (dmg_reduction, block_chance, hp_regen, lifesteal, miss_chance,
 * blind_chance, penetration...) are accepted but change nothing here.
 */

import { SIGILS_BY_CLASS } from './sigilsData.js';
import { SPECIAL_GLYPHS } from './constants.js';

/**
 * SPECIAL MOUNT GLYPHS (constants.js's SPECIAL_GLYPHS): a character-wide
 * equipped special glyph modifies one Sigil's simulated mechanic - e.g. the
 * Ember Curse glyph gives the ember-curse bleed +1 max stack and +10% damage
 * per stack. Resolved here (from character.glyphs) so both the sampled sim
 * (buildSigilEffects) and the optimizer's closed-form objective
 * (expectedSigilActiveDps) see the same numbers; pvpSimulation.js applies
 * the same bonuses via applySpecialGlyphsToMech.
 */

/** SPECIAL_GLYPHS ids currently EQUIPPED on this character (glyphs are character-wide). */
export function activeSpecialGlyphIds(character) {
  return (character?.glyphs?.entries || []).filter((g) => g.equipped && g.special).map((g) => g.special);
}

/**
 * Apply every listed special glyph that targets `sigilId` to a resolved
 * mechanic (one carrying its own tickDamage). Returns the mech untouched
 * when nothing applies.
 */
export function applySpecialGlyphsToMech(sigilId, mech, specialGlyphIds) {
  if (!mech || !specialGlyphIds?.length) return mech;
  let out = mech;
  for (const glyphId of specialGlyphIds) {
    const glyph = SPECIAL_GLYPHS.find((s) => s.id === glyphId);
    if (!glyph || glyph.sigilId !== sigilId) continue;
    out = {
      ...out,
      maxStacks: (out.maxStacks || 8) + (glyph.extraStacks || 0),
      tickDamage: (out.tickDamage || 0) * (glyph.tickDamageMult || 1),
    };
  }
  return out;
}

// The catalogue is static, so the id lookup per class is built once - the
// optimizer's fast objective calls into this module thousands of times.
const DEF_BY_ID = new Map();
export function sigilDefById(characterClass) {
  let byId = DEF_BY_ID.get(characterClass);
  if (!byId) {
    const defs = SIGILS_BY_CLASS[characterClass];
    if (!defs) return null;
    byId = new Map(defs.map((d) => [d.id, d]));
    DEF_BY_ID.set(characterClass, byId);
  }
  return byId;
}

/**
 * Per-sigil mechanic entries. `kind`:
 *   'nuke'         active.damage once per activation (default when active.damage > 0)
 *   'buff'         active.stats for durationSec (default when active.stats.length > 0)
 *                  (a sigil with both damage and stats gets both behaviors)
 *   'tick-train'   activation deals active.damage as a tick every
 *                  `tickIntervalSec` across durationSec (first tick at
 *                  activation + tickIntervalSec)
 *   'dot'          activation deals active.damage up front, then
 *                  `tickDamage` every tickIntervalSec for durationSec
 *   'stacking-dot' activation deals active.damage up front and adds one
 *                  stack (max maxStacks, never decays); one shared tick
 *                  every tickIntervalSec deals stacks * tickDamage
 *   'unsupported'  no sim effect; `note` explains why
 */
export const SIGIL_MECHANICS = {
  // --- Warrior ---
  'blade-of-judgment': { kind: 'nuke' },
  'cataclysm': { kind: 'nuke' },
  'arrowstorm': { kind: 'tick-train', tickIntervalSec: 2 },
  'withering-touch': { kind: 'nuke', note: 'HP-Regen debuff not simulated (target dummy has no regen)' },
  'hemorrhage': { kind: 'stacking-dot', tickIntervalSec: 2, maxStacks: 8 },
  'sunder-mark': { kind: 'unsupported', note: 'strips enemy defenses - no effect vs a defenseless target dummy' },
  'bulwark-of-thorns': { kind: 'unsupported', note: 'stacks build from blocked hits - the dummy never attacks' },
  // --- Sentinel ---
  'crimson-arrow': { kind: 'nuke' },
  'venom-wound': { kind: 'dot', tickIntervalSec: 1 },
  'ember-curse': { kind: 'stacking-dot', tickIntervalSec: 2, maxStacks: 8 },
  'thunderbind': { kind: 'nuke', note: 'paralyze not simulated (target dummy does not act)' },
  'elusive-supremacy': { kind: 'unsupported', note: 'stacks build from dodged hits - the dummy never attacks' },
  'siegebreaker-mark': { kind: 'unsupported', note: 'strips enemy defenses - no effect vs a defenseless target dummy' },
};

export const DAMAGE_KINDS = new Set(['nuke', 'tick-train', 'dot', 'stacking-dot']);
const TICK_KINDS = new Set(['dot', 'stacking-dot']);

/** Enemy-targeting activations don't fire until 1s into combat (the 59s mark). */
export const SIGIL_FIRST_HIT_DELAY_SEC = 1;

/**
 * Sigils whose enemy HP-Regen debuff strength scales with sigil level, so
 * the % is a user-entered number (character.sigilValues[id].regenDebuffPct)
 * rather than a registry constant. The debuff itself only acts in PVP
 * (pvpSimulation.js) - the PVE target dummy has no regen.
 */
export const REGEN_DEBUFF_SIGIL_IDS = new Set(['withering-touch']);

/**
 * Which damage numbers this sigil takes as user input (drives the Sigils
 * screen's fields): `damage` for every damage-dealing mechanic, `tickDamage`
 * only for the DoT/bleed shapes whose per-tick number is separate from the
 * up-front hit, `regenDebuffPct` for the level-scaled enemy HP-Regen debuff.
 */
export function sigilDamageInputs(def) {
  const kind = SIGIL_MECHANICS[def.id]?.kind;
  return {
    damage: DAMAGE_KINDS.has(kind),
    tickDamage: TICK_KINDS.has(kind),
    regenDebuffPct: REGEN_DEBUFF_SIGIL_IDS.has(def.id),
  };
}

/** Swing-roll keys a buff can move directly (everything else is either handled specially or inert vs a dummy). */
const BUFF_SWING_KEYS = { crit: 'critChance', crit_mult: 'critMult', double_hit: 'doubleHitChance' };

function buffValue(active, statKey) {
  let sum = 0;
  for (const s of active.stats) if (s.statKey === statKey) sum += s.value;
  return sum;
}

/**
 * How (and whether) one SigilDef participates in the simulation - drives
 * both effect construction and the UI's "simulated?" badges.
 * Returns { simulated: boolean, summary: string, note?: string }.
 */
export function sigilSimSupport(def) {
  const mech = SIGIL_MECHANICS[def.id];
  if (mech?.kind === 'unsupported') return { simulated: false, summary: 'not simulated', note: mech.note };
  if (!def.active) return { simulated: false, summary: 'passive only', note: 'passive stats feed Calculated totals directly' };
  const parts = [];
  if (mech?.kind === 'tick-train') parts.push('damage ticks');
  if (mech?.kind === 'dot') parts.push('hit + DoT');
  if (mech?.kind === 'stacking-dot') parts.push('hit + stacking bleed');
  if (mech?.kind === 'nuke') parts.push('damage on cooldown');
  if ((!mech?.kind || mech.kind === 'nuke') && def.active.stats.length > 0) parts.push('timed buff');
  if (parts.length === 0) parts.push('timed buff');
  return { simulated: true, summary: parts.join(' + '), note: mech?.note };
}

/**
 * Build one EffectDef for an active sigil. Assumes def.active exists and the
 * mechanic isn't 'unsupported'. `mechanicOverride` lets tests exercise a
 * mechanic shape with fixture numbers without touching SIGIL_MECHANICS.
 */
export function makeSigilEffect(def, mechanicOverride = null) {
  const mech = mechanicOverride ?? SIGIL_MECHANICS[def.id] ?? {};
  const active = def.active;
  const cd = Number(active.cooldownSec) || 0;
  const duration = Number(active.durationSec) || 0;
  const damage = Number(active.damage) || 0;
  const tag = `sigil_${def.id}`;
  const hasBuff = active.stats.length > 0 && duration > 0;
  const speedBuff = hasBuff ? buffValue(active, 'speed') : 0;

  const effect = {
    id: tag,

    onRunStart(ctx) {
      if (cd <= 0) return; // never comes off cooldown -> never re-activates; nothing to schedule
      const state = { buffUntil: 0, stacks: 0, tickerStarted: false };
      ctx.state.set(tag, state);

      const activate = () => {
        const now = ctx.time;

        switch (mech.kind) {
          case 'tick-train': {
            // "Deals X every Ns for Ds": D/N ticks, first at activation + N.
            const interval = mech.tickIntervalSec || 1;
            for (let t = interval; t <= duration + 1e-9; t += interval) {
              ctx.schedule(now + t, () => ctx.addDamage(damage, tag));
            }
            break;
          }
          case 'dot': {
            ctx.addDamage(damage, tag); // up-front hit
            const interval = mech.tickIntervalSec || 1;
            for (let t = interval; t <= duration + 1e-9; t += interval) {
              ctx.schedule(now + t, () => ctx.addDamage(mech.tickDamage || 0, tag));
            }
            break;
          }
          case 'stacking-dot': {
            ctx.addDamage(damage, tag); // up-front hit
            state.stacks = Math.min(state.stacks + 1, mech.maxStacks || 8);
            if (!state.tickerStarted) {
              state.tickerStarted = true;
              const interval = mech.tickIntervalSec || 1;
              const tick = () => {
                ctx.addDamage(state.stacks * (mech.tickDamage || 0), tag);
                ctx.schedule(ctx.time + interval, tick);
              };
              ctx.schedule(now + interval, tick);
            }
            break;
          }
          default: {
            // Generic: flat damage and/or a timed buff.
            if (damage > 0) ctx.addDamage(damage, tag);
            break;
          }
        }

        if (hasBuff) state.buffUntil = now + duration;
        ctx.schedule(now + cd, activate); // cooldown starts at activation
      };

      // Damage mechanics target the enemy: first trigger at 1s, not t=0.
      const targetsEnemy = DAMAGE_KINDS.has(mech.kind) || damage > 0;
      ctx.schedule(targetsEnemy ? SIGIL_FIRST_HIT_DELAY_SEC : 0, activate);
    },
  };

  if (hasBuff) {
    const attackFlat = buffValue(active, 'attack');
    const attackPct = buffValue(active, 'attack_pct');
    effect.modifySwing = (swing, ctx) => {
      const state = ctx.state.get(tag);
      if (!state || ctx.time >= state.buffUntil) return;
      swing.baseDamage = (swing.baseDamage + attackFlat) * (1 + attackPct / 100);
      for (const [statKey, swingKey] of Object.entries(BUFF_SWING_KEYS)) {
        swing[swingKey] += buffValue(active, statKey);
      }
    };
  }
  if (speedBuff !== 0) {
    effect.speedBonus = (ctx) => {
      const state = ctx.state.get(tag);
      return state && ctx.time < state.buffUntil ? speedBuff : 0;
    };
  }

  return effect;
}

/** Buff stats that move damage output vs a target dummy (mirrors modifySwing + speedBonus). */
const BUFF_DPS_KEYS = ['attack', 'attack_pct', 'crit', 'crit_mult', 'double_hit', 'speed'];

/**
 * Closed-form expectation of what buildSigilEffects would do on the sim's
 * timeline - the optimizer's fast objective uses this instead of sampling.
 * The activation schedule is fully deterministic (activate at firstAt,
 * firstAt+cd, ... where firstAt is 1s for damage mechanics, 0 for buffs;
 * events strictly before the horizon fire, matching runSingle's event loop),
 * so the FLAT damage side (nukes, DoT/bleed ticks) is exact, including
 * end-of-fight truncation and the stacking-dot's shared ticker.
 *
 * Returns { flatDps, segments }:
 *   flatDps   total scheduled sigil damage / durationSeconds - add to DPS.
 *   segments  the fight's buff timeline cut into intervals by which buff
 *             sigils are simultaneously active: one { statAdds, fraction }
 *             per distinct nonempty combination, where statAdds sums the
 *             entered damage-side stats (BUFF_DPS_KEYS) of every buff active
 *             in that interval and fraction is the interval's share of the
 *             fight. Windows are the exact deterministic activation windows
 *             (firstAt + k*cd, clipped at the horizon); windows of the SAME
 *             sigil are unioned first, matching makeSigilEffect's buffUntil
 *             semantics (a re-activation extends, never stacks). The caller
 *             mixes buffed vs unbuffed swing DPS per segment, so overlap
 *             between different buff sigils is captured exactly.
 */
export function expectedSigilActiveDps(character, preset, durationSeconds = 60) {
  const result = { flatDps: 0, segments: [] };
  const buffWindows = []; // per buff sigil: { windows: [[start, end)...] (disjoint), statAdds }
  const defById = sigilDefById(character.class);
  if (!defById) return result;
  const specialGlyphIds = activeSpecialGlyphIds(character);
  const fires = (t) => t < durationSeconds - 1e-9; // runSingle's horizon rule

  let totalFlat = 0;
  for (const sigilId of preset.sigilIds || []) {
    const def = defById.get(sigilId);
    if (!def?.active) continue;
    const mech = SIGIL_MECHANICS[def.id];
    if (mech?.kind === 'unsupported') continue;
    const cd = Number(def.active.cooldownSec) || 0;
    if (cd <= 0) continue; // never comes off cooldown -> never activates
    const duration = Number(def.active.durationSec) || 0;
    const entered = character.sigilValues?.[sigilId] || {};
    const damage = Math.max(0, Number(entered.damage) || 0);
    const tickDamage = Math.max(0, Number(entered.tickDamage) || 0);

    const firstAt = DAMAGE_KINDS.has(mech?.kind) || damage > 0 ? SIGIL_FIRST_HIT_DELAY_SEC : 0;
    const activations = [];
    for (let k = 0; fires(firstAt + k * cd); k++) activations.push(firstAt + k * cd);

    switch (mech?.kind) {
      case 'tick-train': {
        const interval = mech.tickIntervalSec || 1;
        for (const a of activations) {
          for (let t = interval; t <= duration + 1e-9; t += interval) {
            if (fires(a + t)) totalFlat += damage;
          }
        }
        break;
      }
      case 'dot': {
        const interval = mech.tickIntervalSec || 1;
        for (const a of activations) {
          totalFlat += damage; // up-front hit
          for (let t = interval; t <= duration + 1e-9; t += interval) {
            if (fires(a + t)) totalFlat += tickDamage;
          }
        }
        break;
      }
      case 'stacking-dot': {
        // Special mount glyphs can raise the stack cap / per-stack damage
        // (same adjustment buildSigilEffects hands the sampled sim).
        const glyphed = applySpecialGlyphsToMech(def.id, { ...mech, tickDamage }, specialGlyphIds);
        const interval = mech.tickIntervalSec || 1;
        const maxStacks = glyphed.maxStacks || 8;
        totalFlat += activations.length * damage; // up-front hit per activation
        // One shared ticker from the first activation + interval, forever.
        // At an activation/tick tie the activation fires first (it was
        // scheduled earlier), so a tick at time t sees activations <= t.
        for (let t = firstAt + interval; fires(t); t += interval) {
          let stacks = 0;
          for (const a of activations) if (a <= t + 1e-9) stacks += 1;
          totalFlat += Math.min(stacks, maxStacks) * glyphed.tickDamage;
        }
        break;
      }
      default:
        totalFlat += activations.length * damage; // generic nuke (and/or buff)
    }

    // Timed buff: collect the entered damage-side stat values and the exact
    // activation windows (same-sigil overlap merges - buffUntil extends).
    if (def.active.stats.length > 0 && duration > 0) {
      const statAdds = {};
      let any = false;
      for (const key of BUFF_DPS_KEYS) {
        const declared = def.active.stats.some((s) => s.statKey === key);
        const value = declared ? Number(entered.active?.[key]) || 0 : 0;
        if (value !== 0) {
          statAdds[key] = value;
          any = true;
        }
      }
      if (any) {
        const windows = [];
        for (const a of activations) {
          const start = a;
          const end = Math.min(a + duration, durationSeconds);
          if (end <= start) continue;
          const last = windows[windows.length - 1];
          if (last && start <= last[1] + 1e-9) last[1] = Math.max(last[1], end);
          else windows.push([start, end]);
        }
        if (windows.length > 0) buffWindows.push({ windows, statAdds });
      }
    }
  }

  result.flatDps = durationSeconds > 0 ? totalFlat / durationSeconds : 0;

  // Sweep the union of all window edges; group intervals by WHICH buffs are
  // active so each distinct combination becomes one segment with the summed
  // stat adds - exact overlap, no independence approximation.
  if (buffWindows.length > 0 && durationSeconds > 0) {
    const bounds = [...new Set(buffWindows.flatMap(({ windows }) => windows.flat()))].sort((a, b) => a - b);
    const byCombo = new Map(); // combo key -> { statAdds, length }
    for (let i = 0; i < bounds.length - 1; i++) {
      const mid = (bounds[i] + bounds[i + 1]) / 2;
      let key = '';
      let statAdds = null;
      for (let b = 0; b < buffWindows.length; b++) {
        const { windows, statAdds: adds } = buffWindows[b];
        if (!windows.some(([s, e]) => s <= mid && mid < e)) continue;
        key += `${b},`;
        statAdds = statAdds || {};
        for (const [k, v] of Object.entries(adds)) statAdds[k] = (statAdds[k] || 0) + v;
      }
      if (!statAdds) continue;
      const seg = byCombo.get(key);
      if (seg) seg.length += bounds[i + 1] - bounds[i];
      else byCombo.set(key, { statAdds, length: bounds[i + 1] - bounds[i] });
    }
    for (const { statAdds, length } of byCombo.values()) {
      result.segments.push({ statAdds, fraction: length / durationSeconds });
    }
  }

  return result;
}

/**
 * EffectDefs for every equipped sigil of `preset` that participates in the
 * simulation, with the catalogue structure resolved against the character's
 * entered numbers (character.sigilValues) - append these to DEFAULT_EFFECTS
 * when calling runSimulation.
 */
export function buildSigilEffects(character, preset) {
  const defById = sigilDefById(character.class);
  if (!defById) return [];
  const specialGlyphIds = activeSpecialGlyphIds(character);
  const effects = [];
  for (const sigilId of preset.sigilIds || []) {
    const def = defById.get(sigilId);
    if (!def?.active) continue;
    const mech = SIGIL_MECHANICS[def.id];
    if (mech?.kind === 'unsupported') continue;

    // Resolve the catalogue's structure into a def carrying the character's
    // entered numbers (a sigil with none entered simulates as all-zeros).
    const entered = character.sigilValues?.[sigilId] || {};
    const resolved = {
      ...def,
      active: {
        ...def.active,
        stats: def.active.stats.map((s) => ({ statKey: s.statKey, value: Number(entered.active?.[s.statKey]) || 0 })),
        damage: Math.max(0, Number(entered.damage) || 0),
      },
    };
    const mechWithTick = mech ? { ...mech, tickDamage: Math.max(0, Number(entered.tickDamage) || 0) } : null;
    effects.push(makeSigilEffect(resolved, applySpecialGlyphsToMech(def.id, mechWithTick, specialGlyphIds)));
  }
  return effects;
}
