// Page registry: route id -> page component. Each page file is an adapter around the old screen
// until the slice that owns the page replaces it (plan §D), so later slices touch only their own file.
import CharacterOverviewPage from './CharacterOverviewPage.svelte';
import CharacterSkillsPage from './CharacterSkillsPage.svelte';
import CharacterGearPage from './CharacterGearPage.svelte';
import CharacterTalentsPage from './CharacterTalentsPage.svelte';
import CharacterSigilsPage from './CharacterSigilsPage.svelte';
import CharacterPetsPage from './CharacterPetsPage.svelte';
import CharacterMountsPage from './CharacterMountsPage.svelte';
import CharacterRelicsPage from './CharacterRelicsPage.svelte';
import CharacterAwakeningPage from './CharacterAwakeningPage.svelte';
import CharacterTranscendencePage from './CharacterTranscendencePage.svelte';
import BuildsPresetsPage from './BuildsPresetsPage.svelte';
import BuildsLoadoutPage from './BuildsLoadoutPage.svelte';
import BuildsSheetPage from './BuildsSheetPage.svelte';
import ToolsDropPage from './ToolsDropPage.svelte';
import ToolsOptimiserPage from './ToolsOptimiserPage.svelte';
import ToolsDuelPage from './ToolsDuelPage.svelte';
import ToolsOpponentsPage from './ToolsOpponentsPage.svelte';
import ToolsOblivionPage from './ToolsOblivionPage.svelte';
import ToolsSpecGuidePage from './ToolsSpecGuidePage.svelte';

export const PAGE_COMPONENTS = {
  'character/overview': CharacterOverviewPage,
  'character/skills': CharacterSkillsPage,
  'character/gear': CharacterGearPage,
  'character/talents': CharacterTalentsPage,
  'character/sigils': CharacterSigilsPage,
  'character/pets': CharacterPetsPage,
  'character/mounts': CharacterMountsPage,
  'character/relics': CharacterRelicsPage,
  'character/awakening': CharacterAwakeningPage,
  'character/transcendence': CharacterTranscendencePage,
  'builds/presets': BuildsPresetsPage,
  'builds/loadout': BuildsLoadoutPage,
  'builds/sheet': BuildsSheetPage,
  'tools/drop': ToolsDropPage,
  'tools/optimiser': ToolsOptimiserPage,
  'tools/duel': ToolsDuelPage,
  'tools/opponents': ToolsOpponentsPage,
  'tools/spec-guide': ToolsSpecGuidePage,
  'tools/oblivion': ToolsOblivionPage,
};
