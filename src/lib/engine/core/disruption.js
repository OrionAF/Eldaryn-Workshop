// Which status a class's Disruption Chance applies (stats.md §3.2, L1216943-1216988). Pure.

/**
 * 'SILENCE' by default; Necromancer FEAR; a Mystic in Bear form STAGGER, in Wolf form FEAR.
 * @param {string|null|undefined} playerClass
 * @param {'BEAR'|'WOLF'|null|undefined} [form]
 * @returns {'SILENCE'|'STAGGER'|'FEAR'}
 */
export function disruptionEffectFor(playerClass, form) {
  if (playerClass === 'NECROMANCER') return 'FEAR';
  if (playerClass === 'MYSTIC') {
    if (form === 'BEAR') return 'STAGGER';
    if (form === 'WOLF') return 'FEAR';
  }
  return 'SILENCE';
}
