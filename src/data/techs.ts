/**
 * 0.6.0 — "The Inventive Century": the full 1820-1920 technology tree and
 * invention list.
 *
 * Design notes (see docs/ROADMAP-0.6.0.md):
 *  - Five columns (army / navy / commerce / industry / culture), each a linear
 *    prereq chain paced across the century by `year` gates and rising costs.
 *  - The eight pre-0.6.0 tech keys are preserved verbatim as the 1820 roots so
 *    existing saves, the bootstrap seed ('market_structure') and any string
 *    references keep working.
 *  - Army/navy tech keys deliberately contain the substrings that
 *    src/sim/systems/war.ts scores combat with ('army', 'navy', 'ironclad',
 *    'artillery', 'cavalry', 'guard', 'staff', 'professional', 'cannon') so the
 *    war engine deepens with the tree without touching combat code.
 *  - Typed `modifiers` are aggregated by src/sim/systems/research.ts and
 *    consumed by economy (throughput), budget (tax efficiency) and research
 *    itself. `unlocksRecipes` gates the new production chains in gameData.
 */

import type { InventionDef, TechDef } from '../shared/types';

export const TECHS: TechDef[] = [
  // --- ARMY --------------------------------------------------------------
  {
    key: 'muzzle_loaded_rifles', name: 'Muzzle-loaded Rifles', category: 'army', cost: 8, year: 1820,
    effects: ['Foundation of the army column'],
  },
  {
    key: 'post_napoleonic_thought', name: 'Post-Napoleonic Thought', category: 'army', cost: 9, year: 1820,
    prereq: 'muzzle_loaded_rifles',
    effects: ['Foundation of modern doctrine'],
  },
  {
    key: 'army_professional_drill', name: 'Professional Drill', category: 'army', cost: 24, year: 1832,
    prereq: 'post_napoleonic_thought',
    effects: ['+Army combat power', '+Guard effectiveness'],
  },
  {
    key: 'army_percussion_rifles', name: 'Percussion Rifles', category: 'army', cost: 42, year: 1842,
    prereq: 'army_professional_drill',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_rifled_artillery', name: 'Rifled Artillery', category: 'army', cost: 68, year: 1856,
    prereq: 'army_percussion_rifles',
    effects: ['+Army combat power', '+Artillery effectiveness'],
  },
  {
    key: 'army_breech_loaders', name: 'Breech-loading Rifles', category: 'army', cost: 98, year: 1868,
    prereq: 'army_rifled_artillery',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_staff_corps', name: 'Staff Corps', category: 'army', cost: 125, year: 1876,
    prereq: 'army_breech_loaders',
    effects: ['+Army combat power', '+Guard effectiveness'],
  },
  {
    key: 'army_repeating_rifles', name: 'Repeating Rifles', category: 'army', cost: 165, year: 1886,
    prereq: 'army_staff_corps',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_modern_cannon', name: 'Modern Cannon Doctrine', category: 'army', cost: 225, year: 1898,
    prereq: 'army_repeating_rifles',
    effects: ['+Army combat power', '+Artillery effectiveness'],
  },

  // --- NAVY --------------------------------------------------------------
  {
    key: 'steamers', name: 'Steamers', category: 'navy', cost: 10, year: 1820,
    effects: ['Foundation of the navy column'],
  },
  {
    key: 'navy_screw_propulsion', name: 'Screw Propulsion', category: 'navy', cost: 46, year: 1845,
    prereq: 'steamers',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_ironclad_warships', name: 'Ironclad Warships', category: 'navy', cost: 92, year: 1862,
    prereq: 'navy_screw_propulsion',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_steel_shipyards', name: 'Steel Shipyards', category: 'navy', cost: 150, year: 1880,
    prereq: 'navy_ironclad_warships',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_dreadnought_program', name: 'Dreadnought Program', category: 'navy', cost: 240, year: 1900,
    prereq: 'navy_steel_shipyards',
    effects: ['+Naval combat power', '+Colonial reach'],
  },

  // --- COMMERCE ----------------------------------------------------------
  {
    key: 'market_structure', name: 'Market Structure', category: 'commerce', cost: 8, year: 1820,
    effects: ['+5% tax efficiency'],
    modifiers: { taxEfficiency: 0.05 },
  },
  {
    key: 'commerce_merchant_marine', name: 'Merchant Marine', category: 'commerce', cost: 32, year: 1835,
    prereq: 'market_structure',
    effects: ['+3% tax efficiency', 'Unlocks Fishing Wharf and Vintner Estate'],
    modifiers: { taxEfficiency: 0.03 },
    unlocksRecipes: ['factory_fishing_wharf', 'factory_vintners'],
  },
  {
    key: 'commerce_stock_exchange', name: 'Stock Exchange', category: 'commerce', cost: 62, year: 1850,
    prereq: 'commerce_merchant_marine',
    effects: ['+5% tax efficiency', '+5% research'],
    modifiers: { taxEfficiency: 0.05, researchRate: 0.05 },
  },
  {
    key: 'commerce_limited_liability', name: 'Limited Liability', category: 'commerce', cost: 112, year: 1870,
    prereq: 'commerce_stock_exchange',
    effects: ['+4% tax efficiency', '+5% factory throughput'],
    modifiers: { taxEfficiency: 0.04, factoryThroughput: 0.05 },
  },
  {
    key: 'commerce_central_banking', name: 'Central Banking', category: 'commerce', cost: 185, year: 1890,
    prereq: 'commerce_limited_liability',
    effects: ['+8% tax efficiency'],
    modifiers: { taxEfficiency: 0.08 },
  },

  // --- INDUSTRY ----------------------------------------------------------
  {
    key: 'mechanical_production', name: 'Mechanical Production', category: 'industry', cost: 9, year: 1820,
    effects: ['+6% factory throughput'],
    modifiers: { factoryThroughput: 0.06 },
  },
  {
    key: 'practical_steam_engine', name: 'Practical Steam Engine', category: 'industry', cost: 11, year: 1820,
    prereq: 'mechanical_production',
    effects: ['+6% RGO throughput'],
    modifiers: { rgoThroughput: 0.06 },
  },
  {
    key: 'industry_mechanized_sawmills', name: 'Mechanized Sawmills', category: 'industry', cost: 42, year: 1838,
    prereq: 'practical_steam_engine',
    effects: ['+4% RGO throughput', 'Unlocks Lumber Mill and Furniture Works'],
    modifiers: { rgoThroughput: 0.04 },
    unlocksRecipes: ['factory_lumber_mill', 'factory_furniture'],
  },
  {
    key: 'industry_machine_tooling', name: 'Machine Tooling', category: 'industry', cost: 78, year: 1855,
    prereq: 'industry_mechanized_sawmills',
    effects: ['+6% factory throughput', 'Unlocks Machine Parts Works'],
    modifiers: { factoryThroughput: 0.06 },
    unlocksRecipes: ['factory_machine_parts'],
  },
  {
    key: 'industry_bessemer_steel', name: 'Bessemer Steel', category: 'industry', cost: 118, year: 1870,
    prereq: 'industry_machine_tooling',
    effects: ['+6% factory throughput', '+4% RGO throughput', 'Unlocks Artillery Foundry'],
    modifiers: { factoryThroughput: 0.06, rgoThroughput: 0.04 },
    unlocksRecipes: ['factory_artillery'],
  },
  {
    key: 'industry_electrification', name: 'Electrification', category: 'industry', cost: 210, year: 1895,
    prereq: 'industry_bessemer_steel',
    effects: ['+12% factory throughput'],
    modifiers: { factoryThroughput: 0.12 },
  },

  // --- CULTURE -----------------------------------------------------------
  {
    key: 'romanticism', name: 'Romanticism', category: 'culture', cost: 7, year: 1820,
    effects: ['+Prestige drip'],
    modifiers: { prestigeMonthly: 0.15 },
  },
  {
    key: 'idealism', name: 'Idealism', category: 'culture', cost: 9, year: 1820,
    prereq: 'romanticism',
    effects: ['+10% research'],
    modifiers: { researchRate: 0.1 },
  },
  {
    key: 'culture_realist_school', name: 'The Realist School', category: 'culture', cost: 56, year: 1848,
    prereq: 'idealism',
    effects: ['+Literacy growth', '+Prestige drip'],
    modifiers: { literacyRate: 0.0004, prestigeMonthly: 0.1 },
  },
  {
    key: 'culture_empirical_science', name: 'Empirical Science', category: 'culture', cost: 102, year: 1866,
    prereq: 'culture_realist_school',
    effects: ['+15% research'],
    modifiers: { researchRate: 0.15 },
  },
  {
    key: 'culture_mass_press', name: 'The Mass Press', category: 'culture', cost: 152, year: 1882,
    prereq: 'culture_empirical_science',
    effects: ['+Literacy growth', '+5% research'],
    modifiers: { literacyRate: 0.0008, researchRate: 0.05 },
  },
  {
    key: 'culture_modernist_age', name: 'The Modernist Age', category: 'culture', cost: 230, year: 1900,
    prereq: 'culture_mass_press',
    effects: ['+Prestige drip', '+10% research'],
    modifiers: { prestigeMonthly: 0.4, researchRate: 0.1 },
  },
];

export const INVENTIONS: InventionDef[] = [
  {
    key: 'sewing_machine', name: 'Sewing Machine', prereqTech: 'mechanical_production', monthlyChance: 0.05,
    description: 'Mass-produced garments transform the mills.',
    modifiers: { factoryThroughput: 0.02 },
  },
  {
    key: 'mechanical_reaper', name: 'Mechanical Reaper', prereqTech: 'practical_steam_engine', monthlyChance: 0.05,
    description: 'Horse-drawn reapers multiply the harvest.',
    modifiers: { rgoThroughput: 0.03 },
  },
  {
    key: 'telegraph_networks', name: 'Telegraph Networks', prereqTech: 'commerce_stock_exchange', monthlyChance: 0.05,
    description: 'Prices and orders now travel faster than horses.',
    modifiers: { researchRate: 0.05, taxEfficiency: 0.02 },
  },
  {
    key: 'dynamite', name: 'Dynamite', prereqTech: 'industry_machine_tooling', monthlyChance: 0.04,
    description: 'Stable high explosives open deeper seams.',
    modifiers: { rgoThroughput: 0.04 },
  },
  {
    key: 'pasteurization', name: 'Pasteurization', prereqTech: 'culture_empirical_science', monthlyChance: 0.04,
    description: 'Food keeps; cities grow healthier.',
    modifiers: { rgoThroughput: 0.02, literacyRate: 0.0002 },
  },
  {
    key: 'naval_observatories', name: 'Naval Observatories', prereqTech: 'navy_screw_propulsion', monthlyChance: 0.04,
    description: 'Precision charts burnish the fleet’s renown.',
    modifiers: { prestigeMonthly: 0.1 },
  },
  {
    key: 'bessemer_refinements', name: 'Converter Refinements', prereqTech: 'industry_bessemer_steel', monthlyChance: 0.05,
    description: 'Cheaper steel with every blast.',
    modifiers: { factoryThroughput: 0.03 },
  },
  {
    key: 'refrigerated_shipping', name: 'Refrigerated Shipping', prereqTech: 'commerce_limited_liability', monthlyChance: 0.04,
    description: 'Beef and grain cross oceans without spoiling.',
    modifiers: { rgoThroughput: 0.03, taxEfficiency: 0.02 },
  },
  {
    key: 'telephone_exchange', name: 'Telephone Exchange', prereqTech: 'commerce_central_banking', monthlyChance: 0.05,
    description: 'The exchange floor is now a wire away.',
    modifiers: { taxEfficiency: 0.03, researchRate: 0.05 },
  },
  {
    key: 'electric_lighting', name: 'Electric Lighting', prereqTech: 'industry_electrification', monthlyChance: 0.06,
    description: 'Factories work past sundown.',
    modifiers: { factoryThroughput: 0.04 },
  },
  {
    key: 'assembly_line', name: 'Assembly Line', prereqTech: 'industry_electrification', monthlyChance: 0.04,
    description: 'The work moves; the workers stand still.',
    modifiers: { factoryThroughput: 0.06 },
  },
  {
    key: 'cheap_newsprint', name: 'Cheap Newsprint', prereqTech: 'culture_mass_press', monthlyChance: 0.05,
    description: 'A paper in every parlor.',
    modifiers: { literacyRate: 0.0005 },
  },
];
