// Mount source (a10): the ridden mount's base percentages plus its socketed minor-glyph secondaries.
// Pure; the caller resolves which glyphs are socketed on the ridden mount. Facts:
// docs/Reference/Game/mounts-glyphs.md §4, §5, §9.
import { GLYPH_SECONDARY_POOL } from '../../game/mountsGlyphs.js';
import { secondaryKey } from './pet.js';

/** MOUNT_LEVEL_STAT_BONUS (mounts-glyphs.md §4) */
const MOUNT_LEVEL_STAT_BONUS = 0.1;

/** @returns {import('../types.js').MountBonuses} the 27 keys (EMPTY_MOUNT_BONUSES, L1225037) */
export const emptyMountBonuses = () => ({
  attackPercent: 0, hpPercent: 0, healthPercent: 0, attackSpeed: 0, critChance: 0, critDamage: 0,
  hpRegen: 0, lifesteal: 0, damageReduction: 0, blockChance: 0, missChance: 0, blindChance: 0,
  paralyzeChance: 0, penetration: 0, doubleHit: 0, spellDamage: 0, spellResist: 0,
  spellCritChance: 0, spellVamp: 0, disruptionChance: 0, fearChance: 0, minionAttack: 0,
  minionHealth: 0, minionCritChance: 0, minionLifesteal: 0, soulLink: 0, minionAttackSpeed: 0,
});

// port of getMountEffectiveStats L1072522-1072546 (percent points)
export function mountEffectiveStats({ baseHp, baseAtk, level }) {
  const factor = 1 + MOUNT_LEVEL_STAT_BONUS * (level - 1);
  return { hp: Math.round(baseHp * factor), atk: Math.round(baseAtk * factor) };
}

const poolByStat = new Map();
for (const p of GLYPH_SECONDARY_POOL) {
  poolByStat.set(p.statEnum, p);
  poolByStat.set(p.stat, p);
}

// port of getGlyphSecondaryValue L1225432-1225546; stat may be the enum name or the camel key
export function glyphSecondaryValue({ stat, quality }) {
  const d = poolByStat.get(stat);
  if (!d) return 0;
  const q = Math.max(0, Math.min(1, quality));
  return parseFloat((d.minValue + (d.maxValue - d.minValue) * q).toFixed(d.decimals));
}

/**
 * port of calculateMountBonuses L1224876-1225023, on resolved inputs.
 * @param {{baseHp:number, baseAtk:number, level:number}|null} mount  the ridden mount (null = none: zeros)
 * @param {{sealed?: boolean, secondary?: {stat:string, quality:number}|null}[]} [glyphs]  the glyphs
 *   socketed on that mount. Sealed glyphs and glyphs without a secondary (major, mythic) add nothing.
 * @returns {import('../types.js').MountBonuses}
 */
export function calculateMountBonuses(mount, glyphs = []) {
  const out = emptyMountBonuses();
  if (!mount) return out;
  const eff = mountEffectiveStats(mount);
  out.attackPercent += eff.atk;
  out.hpPercent += eff.hp;
  for (const g of glyphs) {
    if (!g || g.sealed || !g.secondary) continue;
    const d = poolByStat.get(g.secondary.stat);
    if (!d) continue;
    const key = secondaryKey(d.statEnum);
    if (key in out) out[key] += glyphSecondaryValue(g.secondary);
  }
  return out;
}
