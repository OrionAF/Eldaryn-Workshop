/**
 * mountsData.js - the fixed catalogue of Mounts that exist in the game.
 * Like relicsData.js this is static domain data, not persisted state: every
 * character always has exactly these mounts (name/rarity fixed), and only the
 * player-entered base HP%/ATK% and which one is being ridden are saved.
 * Ordered by rarity progression as the in-game stable lists them.
 */

export const MOUNT_DEFS = [
  { id: 'night_wolf', name: 'Night Wolf', rarity: 'Common' },
  { id: 'frostfang_wolf', name: 'Frostfang Wolf', rarity: 'Common' },
  { id: 'thundermaw', name: 'Thundermaw', rarity: 'Uncommon' },
  { id: 'crystal_beast', name: 'Crystal Beast', rarity: 'Uncommon' },
  { id: 'scorpion_hound', name: 'Scorpion Hound', rarity: 'Uncommon' },
  { id: 'abyss_crawler', name: 'Abyss Crawler', rarity: 'Rare' },
  { id: 'infernal_hellhound', name: 'Infernal Hellhound', rarity: 'Rare' },
  { id: 'bonecrawler', name: 'Bonecrawler', rarity: 'Rare' },
  { id: 'void_stalker', name: 'Void Stalker', rarity: 'Rare' },
  { id: 'storm_roc', name: 'Storm Roc', rarity: 'Epic' },
  { id: 'crystal_drake', name: 'Crystal Drake', rarity: 'Epic' },
];
