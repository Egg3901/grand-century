/**
 * 0.6.0 / 0.7.0 track B — Technology tree ("The Inventive Century" + depth).
 *
 * Design notes (see docs/ROADMAP-0.6.0.md):
 *  - Five columns (army / navy / commerce / industry / culture), prereq-chained
 *    and year-gated across 1820→1920.
 *  - The eight pre-0.6.0 tech keys are preserved verbatim as the 1820 roots so
 *    existing saves, the bootstrap seed ('market_structure') and any string
 *    references keep working. All 31 M1 keys remain; depth techs are additive.
 *  - Army/navy tech keys deliberately contain the substrings that
 *    src/sim/systems/war.ts scores combat with ('army', 'navy', 'ironclad',
 *    'artillery', 'cavalry', 'guard', 'staff', 'professional', 'cannon') so the
 *    war engine deepens with the tree without rewriting combat math.
 *  - Typed `modifiers` are aggregated by src/sim/systems/research.ts and
 *    consumed by economy (throughput / factory profit), budget (tax + trade),
 *    pops (pop growth), war (movement / supply), and research itself.
 *  - `unlocksRecipes` gates production chains in gameData.
 */

import type { InventionDef, TechDef } from '../shared/types';

export const TECHS: TechDef[] = [
  // --- ARMY --------------------------------------------------------------
  {
    key: 'flintlock_drill', name: 'Flintlock Drill', category: 'army', cost: 5, year: 1700,
    effects: ['Foundation of early modern land warfare'],
  },
  {
    key: 'muzzle_loaded_rifles', name: 'Muzzle-loaded Rifles', category: 'army', cost: 8, year: 1820,
    prereq: 'flintlock_drill',
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
    key: 'army_field_logistics', name: 'Field Logistics', category: 'army', cost: 34, year: 1838,
    prereq: 'army_professional_drill',
    effects: ['+Army movement', '+Supply range'],
    modifiers: { armyMovement: 0.06, supplyRange: 0.5 },
  },
  {
    key: 'army_percussion_rifles', name: 'Percussion Rifles', category: 'army', cost: 42, year: 1842,
    prereq: 'army_field_logistics',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_cavalry_tactics', name: 'Cavalry Tactics', category: 'army', cost: 52, year: 1848,
    prereq: 'army_percussion_rifles',
    effects: ['+Cavalry effectiveness', '+Army movement'],
    modifiers: { armyMovement: 0.04 },
  },
  {
    key: 'army_rifled_artillery', name: 'Rifled Artillery', category: 'army', cost: 68, year: 1856,
    prereq: 'army_cavalry_tactics',
    effects: ['+Army combat power', '+Artillery effectiveness'],
  },
  {
    key: 'army_field_hospitals', name: 'Field Hospitals', category: 'army', cost: 78, year: 1860,
    prereq: 'army_rifled_artillery',
    effects: ['+Pop growth (military hygiene)', '+Army combat power'],
    modifiers: { popGrowth: 0.00001 },
  },
  {
    key: 'army_breech_loaders', name: 'Breech-loading Rifles', category: 'army', cost: 98, year: 1868,
    prereq: 'army_field_hospitals',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_railroad_logistics', name: 'Railroad Logistics', category: 'army', cost: 110, year: 1872,
    prereq: 'army_breech_loaders',
    effects: ['+Army movement', '+Supply range'],
    modifiers: { armyMovement: 0.1, supplyRange: 1.0 },
  },
  {
    key: 'army_staff_corps', name: 'Staff Corps', category: 'army', cost: 125, year: 1876,
    prereq: 'army_railroad_logistics',
    effects: ['+Army combat power', '+Guard effectiveness'],
  },
  {
    key: 'army_repeating_rifles', name: 'Repeating Rifles', category: 'army', cost: 165, year: 1886,
    prereq: 'army_staff_corps',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_smokeless_powder', name: 'Smokeless Powder', category: 'army', cost: 190, year: 1892,
    prereq: 'army_repeating_rifles',
    effects: ['+Army combat power', 'Unlocks Ammunition Works'],
    unlocksRecipes: ['factory_ammunition'],
  },
  {
    key: 'army_modern_cannon', name: 'Modern Cannon Doctrine', category: 'army', cost: 225, year: 1898,
    prereq: 'army_smokeless_powder',
    effects: ['+Army combat power', '+Artillery effectiveness'],
  },
  {
    key: 'army_machine_guns', name: 'Machine Guns', category: 'army', cost: 255, year: 1905,
    prereq: 'army_modern_cannon',
    effects: ['+Army combat power'],
  },
  {
    key: 'army_combined_arms', name: 'Combined Arms Doctrine', category: 'army', cost: 290, year: 1914,
    prereq: 'army_machine_guns',
    effects: ['+Army combat power', '+Army movement'],
    modifiers: { armyMovement: 0.05 },
  },
  {
    key: 'army_mobile_warfare', name: 'Mobile Warfare', category: 'army', cost: 330, year: 1922,
    prereq: 'army_combined_arms',
    effects: ['+Army combat power', '+Army movement'],
    modifiers: { armyMovement: 0.06, supplyRange: 0.5 },
  },
  {
    key: 'army_mechanized_operations', name: 'Mechanized Operations', category: 'army', cost: 370, year: 1930,
    prereq: 'army_mobile_warfare',
    effects: ['+Army combat power', '+Army movement', '+Supply range'],
    modifiers: { armyMovement: 0.08, supplyRange: 0.75 },
  },
  {
    key: 'army_operational_depth', name: 'Operational Depth', category: 'army', cost: 420, year: 1939,
    prereq: 'army_mechanized_operations',
    effects: ['+Army combat power', '+Supply range'],
    modifiers: { supplyRange: 1 },
  },
  {
    key: 'army_integrated_logistics', name: 'Integrated Logistics', category: 'army', cost: 470, year: 1945,
    prereq: 'army_operational_depth',
    effects: ['+Army movement', '+Supply range'],
    modifiers: { armyMovement: 0.08, supplyRange: 1.25 },
  },

  // --- NAVY --------------------------------------------------------------
  {
    key: 'sailing_design', name: 'Sailing Ship Design', category: 'navy', cost: 5, year: 1700,
    effects: ['Foundation of sailing fleets and oceanic logistics'],
  },
  {
    key: 'steamers', name: 'Steamers', category: 'navy', cost: 10, year: 1820,
    prereq: 'sailing_design',
    effects: ['Foundation of the navy column'],
  },
  {
    key: 'navy_clipper_design', name: 'Clipper Design', category: 'navy', cost: 28, year: 1830,
    prereq: 'steamers',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_screw_propulsion', name: 'Screw Propulsion', category: 'navy', cost: 46, year: 1845,
    prereq: 'navy_clipper_design',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_naval_gunnery', name: 'Naval Gunnery', category: 'navy', cost: 68, year: 1855,
    prereq: 'navy_screw_propulsion',
    effects: ['+Naval combat power'],
  },
  {
    key: 'navy_ironclad_warships', name: 'Ironclad Warships', category: 'navy', cost: 92, year: 1862,
    prereq: 'navy_naval_gunnery',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_steel_shipyards', name: 'Steel Shipyards', category: 'navy', cost: 150, year: 1880,
    prereq: 'navy_ironclad_warships',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_torpedo_boats', name: 'Torpedo Boats', category: 'navy', cost: 175, year: 1888,
    prereq: 'navy_steel_shipyards',
    effects: ['+Naval combat power'],
  },
  {
    key: 'navy_dreadnought_program', name: 'Dreadnought Program', category: 'navy', cost: 240, year: 1900,
    prereq: 'navy_torpedo_boats',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_oil_firing', name: 'Oil-fired Boilers', category: 'navy', cost: 270, year: 1908,
    prereq: 'navy_dreadnought_program',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_battlecruiser_doctrine', name: 'Battlecruiser Doctrine', category: 'navy', cost: 310, year: 1915,
    prereq: 'navy_oil_firing',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_carrier_aviation', name: 'Carrier Aviation', category: 'navy', cost: 345, year: 1922,
    prereq: 'navy_battlecruiser_doctrine',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_fleet_air_arm', name: 'Fleet Air Arm', category: 'navy', cost: 390, year: 1932,
    prereq: 'navy_carrier_aviation',
    effects: ['+Naval combat power', '+Colonial reach'],
  },
  {
    key: 'navy_radar_direction', name: 'Radar Fire Direction', category: 'navy', cost: 435, year: 1940,
    prereq: 'navy_fleet_air_arm',
    effects: ['+Naval combat power'],
  },
  {
    key: 'navy_amphibious_logistics', name: 'Amphibious Logistics', category: 'navy', cost: 480, year: 1945,
    prereq: 'navy_radar_direction',
    effects: ['+Naval combat power', '+Colonial reach'],
  },

  // --- COMMERCE ----------------------------------------------------------
  {
    key: 'chartered_trade', name: 'Chartered Trade', category: 'commerce', cost: 5, year: 1700,
    effects: ['Foundation of state-chartered long-distance commerce'],
  },
  {
    key: 'market_structure', name: 'Market Structure', category: 'commerce', cost: 8, year: 1820,
    prereq: 'chartered_trade',
    effects: ['+5% tax efficiency'],
    modifiers: { taxEfficiency: 0.05 },
  },
  {
    key: 'commerce_merchant_marine', name: 'Merchant Marine', category: 'commerce', cost: 32, year: 1835,
    prereq: 'market_structure',
    effects: ['+3% tax efficiency', '+3% tariff yield', 'Unlocks Fishing Wharf and Vintner Estate'],
    modifiers: { taxEfficiency: 0.03, tradeEfficiency: 0.03 },
    unlocksRecipes: ['factory_fishing_wharf', 'factory_vintners'],
  },
  {
    key: 'commerce_joint_stock', name: 'Joint-Stock Companies', category: 'commerce', cost: 48, year: 1842,
    prereq: 'commerce_merchant_marine',
    effects: ['+3% factory profit', '+2% tax efficiency'],
    modifiers: { factoryProfit: 0.03, taxEfficiency: 0.02 },
  },
  {
    key: 'commerce_stock_exchange', name: 'Stock Exchange', category: 'commerce', cost: 62, year: 1850,
    prereq: 'commerce_joint_stock',
    effects: ['+5% tax efficiency', '+5% research', '+4% tariff yield'],
    modifiers: { taxEfficiency: 0.05, researchRate: 0.05, tradeEfficiency: 0.04 },
  },
  {
    key: 'commerce_insurance_markets', name: 'Insurance Markets', category: 'commerce', cost: 88, year: 1858,
    prereq: 'commerce_stock_exchange',
    effects: ['+3% factory profit', '+3% tariff yield'],
    modifiers: { factoryProfit: 0.03, tradeEfficiency: 0.03 },
  },
  {
    key: 'commerce_limited_liability', name: 'Limited Liability', category: 'commerce', cost: 112, year: 1870,
    prereq: 'commerce_insurance_markets',
    effects: ['+4% tax efficiency', '+5% factory throughput'],
    modifiers: { taxEfficiency: 0.04, factoryThroughput: 0.05 },
  },
  {
    key: 'commerce_gold_standard', name: 'Gold Standard', category: 'commerce', cost: 145, year: 1878,
    prereq: 'commerce_limited_liability',
    effects: ['+4% tax efficiency', '+4% tariff yield'],
    modifiers: { taxEfficiency: 0.04, tradeEfficiency: 0.04 },
  },
  {
    key: 'commerce_central_banking', name: 'Central Banking', category: 'commerce', cost: 185, year: 1890,
    prereq: 'commerce_gold_standard',
    effects: ['+6% tax efficiency', '+4% factory profit'],
    modifiers: { taxEfficiency: 0.06, factoryProfit: 0.04 },
  },
  {
    key: 'commerce_modern_finance', name: 'Modern Finance', category: 'commerce', cost: 230, year: 1902,
    prereq: 'commerce_central_banking',
    effects: ['+5% tax efficiency', '+5% factory profit', '+5% tariff yield'],
    modifiers: { taxEfficiency: 0.05, factoryProfit: 0.05, tradeEfficiency: 0.05 },
  },
  {
    key: 'commerce_corporate_trusts', name: 'Corporate Trusts', category: 'commerce', cost: 275, year: 1912,
    prereq: 'commerce_modern_finance',
    effects: ['+4% factory throughput', '+4% factory profit'],
    modifiers: { factoryThroughput: 0.04, factoryProfit: 0.04 },
  },
  {
    key: 'commerce_managed_currency', name: 'Managed Currency', category: 'commerce', cost: 325, year: 1922,
    prereq: 'commerce_corporate_trusts',
    effects: ['+Tax efficiency', '+Factory profit'],
    modifiers: { taxEfficiency: 0.05, factoryProfit: 0.04 },
  },
  {
    key: 'commerce_national_accounts', name: 'National Accounts', category: 'commerce', cost: 365, year: 1932,
    prereq: 'commerce_managed_currency',
    effects: ['+Tax efficiency', '+Research'],
    modifiers: { taxEfficiency: 0.06, researchRate: 0.05 },
  },
  {
    key: 'commerce_wartime_planning', name: 'Wartime Planning', category: 'commerce', cost: 415, year: 1939,
    prereq: 'commerce_national_accounts',
    effects: ['+Factory throughput', '+Trade efficiency'],
    modifiers: { factoryThroughput: 0.06, tradeEfficiency: 0.04 },
  },
  {
    key: 'commerce_reconstruction_finance', name: 'Reconstruction Finance', category: 'commerce', cost: 465, year: 1945,
    prereq: 'commerce_wartime_planning',
    effects: ['+Factory profit', '+Tax efficiency'],
    modifiers: { factoryProfit: 0.06, taxEfficiency: 0.05 },
  },

  // --- INDUSTRY ----------------------------------------------------------
  {
    key: 'manufacture_system', name: 'Manufacture System', category: 'industry', cost: 5, year: 1700,
    effects: ['Foundation of workshops and centralized manufactures'],
  },
  {
    key: 'mechanical_production', name: 'Mechanical Production', category: 'industry', cost: 9, year: 1820,
    prereq: 'manufacture_system',
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
    key: 'industry_early_railroads', name: 'Early Railroads', category: 'industry', cost: 36, year: 1836,
    prereq: 'practical_steam_engine',
    effects: ['+Army movement', '+Supply range', '+3% RGO throughput', 'Unlocks Cement Works'],
    modifiers: { armyMovement: 0.08, supplyRange: 0.75, rgoThroughput: 0.03 },
    unlocksRecipes: ['factory_cement'],
  },
  {
    key: 'industry_mechanized_sawmills', name: 'Mechanized Sawmills', category: 'industry', cost: 42, year: 1838,
    prereq: 'industry_early_railroads',
    effects: ['+4% RGO throughput', 'Unlocks Lumber Mill and Furniture Works'],
    modifiers: { rgoThroughput: 0.04 },
    unlocksRecipes: ['factory_lumber_mill', 'factory_furniture'],
  },
  {
    key: 'industry_interchangeable_parts', name: 'Interchangeable Parts', category: 'industry', cost: 58, year: 1848,
    prereq: 'industry_mechanized_sawmills',
    effects: ['+5% factory throughput', 'Unlocks Clothing Mill'],
    modifiers: { factoryThroughput: 0.05 },
    unlocksRecipes: ['factory_clothing'],
  },
  {
    key: 'industry_machine_tooling', name: 'Machine Tooling', category: 'industry', cost: 78, year: 1855,
    prereq: 'industry_interchangeable_parts',
    effects: ['+6% factory throughput', 'Unlocks Machine Parts Works'],
    modifiers: { factoryThroughput: 0.06 },
    unlocksRecipes: ['factory_machine_parts'],
  },
  {
    key: 'industry_chemical_synthesis', name: 'Chemical Synthesis', category: 'industry', cost: 95, year: 1864,
    prereq: 'industry_machine_tooling',
    effects: ['+5% RGO throughput', 'Unlocks Fertilizer Works'],
    modifiers: { rgoThroughput: 0.05 },
    unlocksRecipes: ['factory_fertilizer'],
  },
  {
    key: 'industry_bessemer_steel', name: 'Bessemer Steel', category: 'industry', cost: 118, year: 1870,
    prereq: 'industry_chemical_synthesis',
    effects: ['+6% factory throughput', '+4% RGO throughput', 'Unlocks Artillery Foundry'],
    modifiers: { factoryThroughput: 0.06, rgoThroughput: 0.04 },
    unlocksRecipes: ['factory_artillery'],
  },
  {
    key: 'industry_organic_chemistry', name: 'Organic Chemistry', category: 'industry', cost: 145, year: 1878,
    prereq: 'industry_bessemer_steel',
    effects: ['+4% factory throughput', 'Unlocks Glassworks'],
    modifiers: { factoryThroughput: 0.04 },
    unlocksRecipes: ['factory_glassworks'],
  },
  {
    key: 'industry_oil_drilling', name: 'Oil Drilling', category: 'industry', cost: 175, year: 1886,
    prereq: 'industry_organic_chemistry',
    effects: ['+5% factory throughput', '+3% RGO throughput'],
    modifiers: { factoryThroughput: 0.05, rgoThroughput: 0.03 },
  },
  {
    key: 'industry_electrification', name: 'Electrification', category: 'industry', cost: 210, year: 1895,
    prereq: 'industry_oil_drilling',
    effects: ['+10% factory throughput'],
    modifiers: { factoryThroughput: 0.1 },
  },
  {
    key: 'industry_electrical_grid', name: 'Electrical Grid', category: 'industry', cost: 250, year: 1905,
    prereq: 'industry_electrification',
    effects: ['+8% factory throughput', '+Army movement'],
    modifiers: { factoryThroughput: 0.08, armyMovement: 0.04 },
  },
  {
    key: 'industry_synthetic_materials', name: 'Synthetic Materials', category: 'industry', cost: 290, year: 1914,
    prereq: 'industry_electrical_grid',
    effects: ['+6% factory throughput', '+4% RGO throughput'],
    modifiers: { factoryThroughput: 0.06, rgoThroughput: 0.04 },
  },
  {
    key: 'industry_mass_motorization', name: 'Mass Motorization', category: 'industry', cost: 335, year: 1922,
    prereq: 'industry_synthetic_materials',
    effects: ['+Factory throughput', '+Army movement'],
    modifiers: { factoryThroughput: 0.07, armyMovement: 0.05 },
  },
  {
    key: 'industry_high_pressure_chemistry', name: 'High-Pressure Chemistry', category: 'industry', cost: 375, year: 1930,
    prereq: 'industry_mass_motorization',
    effects: ['+Factory throughput', '+RGO throughput'],
    modifiers: { factoryThroughput: 0.06, rgoThroughput: 0.05 },
  },
  {
    key: 'industry_radar_electronics', name: 'Radar and Electronics', category: 'industry', cost: 425, year: 1938,
    prereq: 'industry_high_pressure_chemistry',
    effects: ['+Factory throughput', '+Research'],
    modifiers: { factoryThroughput: 0.06, researchRate: 0.06 },
  },
  {
    key: 'industry_automated_production', name: 'Automated Production', category: 'industry', cost: 475, year: 1945,
    prereq: 'industry_radar_electronics',
    effects: ['+Factory throughput'],
    modifiers: { factoryThroughput: 0.1 },
  },

  // --- CULTURE -----------------------------------------------------------
  {
    key: 'enlightenment', name: 'Enlightenment', category: 'culture', cost: 5, year: 1700,
    effects: ['Foundation of early modern scholarship and administration'],
  },
  {
    key: 'romanticism', name: 'Romanticism', category: 'culture', cost: 7, year: 1820,
    prereq: 'enlightenment',
    effects: ['+Prestige drip'],
    modifiers: { prestigeMonthly: 0.15 },
  },
  {
    key: 'idealism', name: 'Idealism', category: 'culture', cost: 9, year: 1820,
    prereq: 'romanticism',
    effects: ['+8% research'],
    modifiers: { researchRate: 0.08 },
  },
  {
    key: 'culture_public_hygiene', name: 'Public Hygiene', category: 'culture', cost: 38, year: 1840,
    prereq: 'idealism',
    effects: ['+Pop growth', '+Literacy growth'],
    modifiers: { popGrowth: 0.000015, literacyRate: 0.0002 },
  },
  {
    key: 'culture_realist_school', name: 'The Realist School', category: 'culture', cost: 56, year: 1848,
    prereq: 'culture_public_hygiene',
    effects: ['+Literacy growth', '+Prestige drip'],
    modifiers: { literacyRate: 0.0004, prestigeMonthly: 0.1 },
  },
  {
    key: 'culture_germ_theory', name: 'Germ Theory', category: 'culture', cost: 78, year: 1862,
    prereq: 'culture_realist_school',
    effects: ['+Pop growth', '+5% research'],
    modifiers: { popGrowth: 0.00002, researchRate: 0.05 },
  },
  {
    key: 'culture_empirical_science', name: 'Empirical Science', category: 'culture', cost: 102, year: 1866,
    prereq: 'culture_germ_theory',
    effects: ['+6% research', 'Unlocks Paper Mill'],
    modifiers: { researchRate: 0.06 },
    unlocksRecipes: ['factory_paper_mill'],
  },
  {
    key: 'culture_modern_medicine', name: 'Modern Medicine', category: 'culture', cost: 128, year: 1876,
    prereq: 'culture_empirical_science',
    effects: ['+Pop growth', '+Literacy growth'],
    modifiers: { popGrowth: 0.000025, literacyRate: 0.0003 },
  },
  {
    key: 'culture_mass_press', name: 'The Mass Press', category: 'culture', cost: 152, year: 1882,
    prereq: 'culture_modern_medicine',
    effects: ['+Literacy growth', '+5% research'],
    modifiers: { literacyRate: 0.0008, researchRate: 0.05 },
  },
  {
    key: 'culture_social_sciences', name: 'Social Sciences', category: 'culture', cost: 185, year: 1892,
    prereq: 'culture_mass_press',
    effects: ['+5% research', '+Prestige drip'],
    modifiers: { researchRate: 0.05, prestigeMonthly: 0.15 },
  },
  {
    key: 'culture_modernist_age', name: 'The Modernist Age', category: 'culture', cost: 230, year: 1900,
    prereq: 'culture_social_sciences',
    effects: ['+Prestige drip', '+6% research'],
    modifiers: { prestigeMonthly: 0.4, researchRate: 0.06 },
  },
  {
    key: 'culture_radio_broadcast', name: 'Radio Broadcast', category: 'culture', cost: 275, year: 1912,
    prereq: 'culture_modernist_age',
    effects: ['+Literacy growth', '+Prestige drip', '+5% research'],
    modifiers: { literacyRate: 0.0004, prestigeMonthly: 0.25, researchRate: 0.05 },
  },
  {
    key: 'culture_mass_cinema', name: 'Mass Cinema', category: 'culture', cost: 320, year: 1922,
    prereq: 'culture_radio_broadcast',
    effects: ['+Prestige', '+Literacy growth'],
    modifiers: { prestigeMonthly: 0.25, literacyRate: 0.0003 },
  },
  {
    key: 'culture_public_broadcasting', name: 'Public Broadcasting', category: 'culture', cost: 360, year: 1930,
    prereq: 'culture_mass_cinema',
    effects: ['+Literacy growth', '+Research'],
    modifiers: { literacyRate: 0.0004, researchRate: 0.05 },
  },
  {
    key: 'culture_applied_social_research', name: 'Applied Social Research', category: 'culture', cost: 410, year: 1938,
    prereq: 'culture_public_broadcasting',
    effects: ['+Research', '+Tax efficiency'],
    modifiers: { researchRate: 0.06, taxEfficiency: 0.04 },
  },
  {
    key: 'culture_international_institutions', name: 'International Institutions', category: 'culture', cost: 460, year: 1945,
    prereq: 'culture_applied_social_research',
    effects: ['+Prestige', '+Research'],
    modifiers: { prestigeMonthly: 0.3, researchRate: 0.06 },
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
    key: 'railway_timetables', name: 'Railway Timetables', prereqTech: 'industry_early_railroads', monthlyChance: 0.05,
    description: 'Trains run to the minute; armies follow.',
    modifiers: { armyMovement: 0.03, supplyRange: 0.25 },
  },
  {
    key: 'telegraph_networks', name: 'Telegraph Networks', prereqTech: 'commerce_stock_exchange', monthlyChance: 0.05,
    description: 'Prices and orders now travel faster than horses.',
    modifiers: { researchRate: 0.05, taxEfficiency: 0.02 },
  },
  {
    key: 'antiseptic_surgery', name: 'Antiseptic Surgery', prereqTech: 'culture_germ_theory', monthlyChance: 0.045,
    description: 'Carbolic acid keeps the wards from becoming morgues.',
    modifiers: { popGrowth: 0.00001 },
  },
  {
    key: 'dynamite', name: 'Dynamite', prereqTech: 'industry_machine_tooling', monthlyChance: 0.04,
    description: 'Stable high explosives open deeper seams.',
    modifiers: { rgoThroughput: 0.04 },
  },
  {
    key: 'pasteurization', name: 'Pasteurization', prereqTech: 'culture_empirical_science', monthlyChance: 0.04,
    description: 'Food keeps; cities grow healthier.',
    modifiers: { rgoThroughput: 0.02, literacyRate: 0.0002, popGrowth: 0.000008 },
  },
  {
    key: 'naval_observatories', name: 'Naval Observatories', prereqTech: 'navy_screw_propulsion', monthlyChance: 0.04,
    description: 'Precision charts burnish the fleet’s renown.',
    modifiers: { prestigeMonthly: 0.1 },
  },
  {
    key: 'double_entry_ledgers', name: 'Double-Entry Ledgers', prereqTech: 'commerce_joint_stock', monthlyChance: 0.05,
    description: 'Every shilling finds its column.',
    modifiers: { taxEfficiency: 0.02, factoryProfit: 0.02 },
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
    key: 'haber_process', name: 'Haber Process', prereqTech: 'industry_chemical_synthesis', monthlyChance: 0.04,
    description: 'Nitrogen from the air feeds the fields.',
    modifiers: { rgoThroughput: 0.04 },
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
  {
    key: 'radiotelegraphy', name: 'Radiotelegraphy', prereqTech: 'culture_radio_broadcast', monthlyChance: 0.05,
    description: 'Orders cross the sea without a cable.',
    modifiers: { researchRate: 0.04, prestigeMonthly: 0.1 },
  },
  {
    key: 'diesel_engines', name: 'Diesel Engines', prereqTech: 'industry_oil_drilling', monthlyChance: 0.04,
    description: 'Heavy engines that sip oil instead of coal.',
    modifiers: { factoryThroughput: 0.03, armyMovement: 0.02 },
  },
  {
    key: 'machine_gun_refinements', name: 'Machine Gun Refinements', prereqTech: 'army_machine_guns', monthlyChance: 0.05,
    description: 'Cooling jackets and belt feeds thin the ranks ahead.',
    modifiers: { prestigeMonthly: 0.05 },
  },
  {
    key: 'dreadnought_turrets', name: 'Dreadnought Turrets', prereqTech: 'navy_dreadnought_program', monthlyChance: 0.045,
    description: 'All-big-gun broadside becomes doctrine.',
    modifiers: { prestigeMonthly: 0.15 },
  },
];
