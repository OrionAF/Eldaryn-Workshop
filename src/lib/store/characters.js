// store/characters.js (M1): roster-level and character-core mutators. Every mutator ends with persist().
import { newCharacter, normaliseCharacter } from '../model/index.js';
import { normaliseClass, normaliseLevel, normaliseBaseResidual } from '../model/character.js';
import { importRoster, downloadRoster } from '../storage.js';

export function createCharactersStore(ctx) {
  /** @returns {string} the new character's id (it becomes the current character). */
  function addCharacter(name, cls = null) {
    const roster = ctx.roster();
    const c = newCharacter(name || 'New Character', cls);
    roster.characters.push(c);
    roster.currentId = c.id;
    ctx.persist();
    return c.id;
  }

  function renameCharacter(id, name) {
    const c = ctx.findCharacter(id);
    if (c && name && name.trim()) {
      c.name = name.trim();
      ctx.persist();
    }
  }

  function deleteCharacter(id) {
    const roster = ctx.roster();
    if (roster.characters.length <= 1) return false; // never delete the last character
    const idx = roster.characters.findIndex((ch) => ch.id === id);
    if (idx === -1) return false;
    roster.characters.splice(idx, 1);
    if (roster.currentId === id) roster.currentId = roster.characters[0].id;
    ctx.persist();
    return true;
  }

  function selectCharacter(id) {
    const roster = ctx.roster();
    if (roster.characters.some((ch) => ch.id === id)) {
      roster.currentId = id;
      ctx.persist();
    }
  }

  /**
   * Set (or clear, with null) a character's class. A different class has different talent trees,
   * relics, sigils and gear gating, so the character is re-normalised under the new class; every
   * domain's normaliser drops what no longer resolves. Accepts 'Warrior' as well as 'WARRIOR'.
   */
  function setCharacterClass(id, className) {
    const roster = ctx.roster();
    const idx = roster.characters.findIndex((ch) => ch.id === id);
    if (idx === -1) return;
    const cls = normaliseClass(className);
    if (roster.characters[idx].class === cls) return;
    const snapshot = JSON.parse(JSON.stringify(roster.characters[idx]));
    snapshot.class = cls;
    roster.characters[idx] = normaliseCharacter(snapshot);
    ctx.persist();
  }

  function setCharacterLevel(level) {
    ctx.edit((c) => {
      c.level = normaliseLevel(level);
    });
  }

  /** Merge a partial {attack,hp,attackSpeed,critChance,critDamage} into the tier-1 base (plan §4). */
  function setBaseResidual(partial) {
    ctx.edit((c) => {
      c.baseResidual = normaliseBaseResidual({ ...c.baseResidual, ...partial });
    });
  }

  /** Oblivion unlock (plan §2.5): locking it also returns the active realm to 'base'. */
  function setOblivionUnlocked(unlocked) {
    ctx.edit((c) => {
      c.oblivion.unlocked = unlocked === true;
      if (!c.oblivion.unlocked) c.oblivion.activeRealm = 'base';
    });
  }

  /** Replace the whole roster from exported JSON (v1 or v2). Throws on unparseable JSON. */
  function importFromJson(text) {
    ctx.setRoster(importRoster(text));
    ctx.persist();
  }

  function exportDownload() {
    downloadRoster(ctx.roster());
  }

  return {
    addCharacter,
    renameCharacter,
    deleteCharacter,
    selectCharacter,
    setCharacterClass,
    setCharacterLevel,
    setBaseResidual,
    setOblivionUnlocked,
    importFromJson,
    exportDownload,
  };
}
