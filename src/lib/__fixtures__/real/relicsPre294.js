// Relic tables before 2.9.4 (client 2.9.3 RELIC_DEFINITIONS; Game/relics.md §10 2.9.4 addendum): the real
// captures predate 2.9.4, so the server scored their relic stats with these endpoints. 2.9.4 raised every
// maxLevel by 5 and re-rounded max to one decimal, which moves a captured stat by a fraction of a point.
// id: [maxLevel, [max of each bonus, in catalogue order]]; base values did not change.
import { relicById } from '../../game/relics.js';

const PRE_294 = {
  relic_iron_heart: [10, [26]],
  relic_war_charm: [10, [20]],
  relic_stone_ward: [10, [10]],
  relic_basalt_guard: [10, [12]],
  relic_swift_emblem: [10, [0.35]],
  relic_mending_stone: [10, [8]],
  relic_guardian_signet: [15, [30, 12]],
  relic_crimson_edge: [15, [28, 10]],
  relic_fortune_token: [15, [14, 0.8]],
  relic_lifewell_charm: [15, [12, 12]],
  relic_dragon_core: [20, [22, 120]],
  relic_phoenix_feather: [20, [50, 180]],
  relic_titans_oath: [20, [26]],
  relic_fatebreaker: [20, [18, 1.2]],
  relic_falcons_eye: [10, [10]],
  relic_hunters_mark: [10, [26]],
  relic_phantom_veil: [10, [12]],
  relic_blinding_powder: [10, [10]],
  relic_swift_quiver: [10, [0.35]],
  relic_serpent_fang: [10, [10]],
  relic_wardens_totem: [15, [35, 13]],
  relic_viper_glyph: [15, [32, 10]],
  relic_deadeye_charm: [15, [14, 0.8]],
  relic_nerve_sigil: [15, [3, 10]],
  relic_void_arrow: [20, [22, 120]],
  relic_spirit_eagle: [20, [50, 180]],
  relic_shadowbind: [20, [6]],
  relic_eclipse_shard: [20, [18, 1.2]],
  relic_arcane_heart: [10, [26]],
  relic_runic_focus: [10, [40]],
  relic_warding_rune: [10, [10]],
  relic_null_ward: [10, [24]],
  relic_chrono_band: [10, [0.35]],
  relic_siphon_fang: [10, [20]],
  relic_aegis_rune: [15, [30, 24]],
  relic_void_lens: [15, [56, 10]],
  relic_arcanists_token: [15, [28, 0.8]],
  relic_mindshatter_charm: [15, [3, 12]],
  relic_riftpiercer: [20, [60, 120]],
  relic_astral_plume: [20, [50, 180]],
  relic_oblivion_bind: [20, [6, 36]],
  relic_eclipse_prism: [20, [36, 1.2]],
  relic_primal_fang: [10, [20]],
  relic_thornhide_totem: [10, [12]],
  relic_savage_glyph: [15, [28, 12]],
  relic_ironbark_ward: [15, [30, 12]],
  relic_worldroot_heart: [20, [26]],
  relic_moonfang_shard: [20, [18, 1.2]],
  relic_marrow_heart: [10, [26]],
  relic_hexfire_candle: [10, [40]],
  relic_gravecallers_bell: [10, [40]],
  relic_ossuary_ward: [10, [38]],
  relic_shroud_of_ash: [10, [24]],
  relic_bonechime_band: [10, [0.35]],
  relic_bloodless_chalice: [10, [20]],
  relic_ghoul_fang: [10, [20]],
  relic_sepulchre_seal: [15, [30, 24]],
  relic_cursed_grimoire: [15, [56, 10]],
  relic_lichs_eye: [15, [28, 0.8]],
  relic_bonelords_brand: [15, [56, 12]],
  relic_soulbound_phylactery: [15, [44, 10]],
  relic_dread_lantern: [15, [3, 12]],
  relic_soulreaver_shard: [20, [60, 120]],
  relic_deathless_crown: [20, [50, 180]],
  relic_nightmare_vial: [20, [6, 36]],
  relic_banner_of_the_risen: [20, [0.4, 36]],
  relic_doomsayers_skull: [20, [36, 1.2]],
  relic_deathlords_signet: [20, [36, 1.2]],
};

/** Sets the catalogue's relic endpoints to the pre-2.9.4 ones; returns a function that restores them. */
export function usePre294Relics() {
  const saved = [];
  for (const [id, [maxLevel, max]] of Object.entries(PRE_294)) {
    const def = relicById(id);
    saved.push([def, def.maxLevel, def.bonuses.map((b) => b.max)]);
    def.maxLevel = maxLevel;
    def.bonuses.forEach((b, k) => { b.max = max[k]; });
  }
  return () => {
    for (const [def, maxLevel, max] of saved) {
      def.maxLevel = maxLevel;
      def.bonuses.forEach((b, k) => { b.max = max[k]; });
    }
  };
}

/** Runs fn with the pre-2.9.4 relic endpoints, then restores them. */
export function withPre294Relics(fn) {
  const restore = usePre294Relics();
  try {
    return fn();
  } finally {
    restore();
  }
}
