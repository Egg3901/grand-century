import type { Nation, RegimentType, ShipType } from '../shared/types';

export interface RegimentSpec {
  type: RegimentType;
  label: string;
  shortLabel: string;
  cost: number;
  manpowerDrain: number;
  baseStrength: number;
  organizationBonus: number;
  requiredConscription: number;
  requiredProfessionalism: number;
  requiredTech?: string;
  combat: {
    offense: number;
    defense: number;
    siege: number;
    mobility: number;
    pursuit: number;
  };
}

export interface ShipSpec {
  type: ShipType;
  label: string;
  shortLabel: string;
  cost: number;
  combatPower: number;
  transportCapacity: number;
  requiredTech?: string;
}

export interface MilitaryAvailability {
  available: boolean;
  reason: string;
}

type MilitaryNation = Pick<Nation, 'techs' | 'reforms'>;

export const REGIMENT_TYPES: readonly RegimentType[] = [
  'infantry',
  'cavalry',
  'artillery',
  'guard',
  'armor',
  'aircraft',
];

export const SHIP_TYPES: readonly ShipType[] = [
  'transport',
  'frigate',
  'manofwar',
  'ironclad',
  'destroyer',
  'submarine',
  'carrier',
];

const REGIMENT_SPECS: Record<RegimentType, RegimentSpec> = {
  infantry: {
    type: 'infantry', label: 'Infantry', shortLabel: 'Inf',
    cost: 24, manpowerDrain: 70, baseStrength: 1000, organizationBonus: 0,
    requiredConscription: 0, requiredProfessionalism: 0,
    combat: { offense: 1, defense: 1.05, siege: 1, mobility: 1, pursuit: 0.9 },
  },
  cavalry: {
    type: 'cavalry', label: 'Cavalry', shortLabel: 'Cav',
    cost: 31, manpowerDrain: 82, baseStrength: 930, organizationBonus: 3,
    requiredConscription: 1, requiredProfessionalism: 0,
    combat: { offense: 0.92, defense: 0.82, siege: 0.5, mobility: 1.24, pursuit: 1.45 },
  },
  artillery: {
    type: 'artillery', label: 'Artillery', shortLabel: 'Art',
    cost: 38, manpowerDrain: 90, baseStrength: 820, organizationBonus: -5,
    requiredConscription: 1, requiredProfessionalism: 1,
    combat: { offense: 1.42, defense: 0.64, siege: 1.9, mobility: 0.76, pursuit: 0.72 },
  },
  guard: {
    type: 'guard', label: 'Guard', shortLabel: 'Gd',
    cost: 45, manpowerDrain: 96, baseStrength: 1000, organizationBonus: 8,
    requiredConscription: 2, requiredProfessionalism: 2,
    combat: { offense: 1.25, defense: 1.26, siege: 1.12, mobility: 0.95, pursuit: 1.02 },
  },
  armor: {
    type: 'armor', label: 'Armor', shortLabel: 'Arm',
    cost: 82, manpowerDrain: 72, baseStrength: 860, organizationBonus: 4,
    requiredConscription: 2, requiredProfessionalism: 2,
    requiredTech: 'army_mechanized_operations',
    combat: { offense: 1.9, defense: 1.4, siege: 1.45, mobility: 1.2, pursuit: 1.28 },
  },
  aircraft: {
    type: 'aircraft', label: 'Aircraft', shortLabel: 'Air',
    cost: 96, manpowerDrain: 48, baseStrength: 720, organizationBonus: -2,
    requiredConscription: 2, requiredProfessionalism: 2,
    requiredTech: 'army_military_aviation',
    combat: { offense: 1.65, defense: 0.58, siege: 1.05, mobility: 1.42, pursuit: 1.55 },
  },
};

const SHIP_SPECS: Record<ShipType, ShipSpec> = {
  transport: {
    type: 'transport', label: 'Transport', shortLabel: 'T',
    cost: 55, combatPower: 0.5, transportCapacity: 2,
  },
  frigate: {
    type: 'frigate', label: 'Frigate', shortLabel: 'F',
    cost: 70, combatPower: 1.1, transportCapacity: 0,
  },
  manofwar: {
    type: 'manofwar', label: 'Man-of-war', shortLabel: 'M',
    cost: 95, combatPower: 1.55, transportCapacity: 0,
  },
  ironclad: {
    type: 'ironclad', label: 'Ironclad', shortLabel: 'I',
    cost: 120, combatPower: 2.2, transportCapacity: 0,
    requiredTech: 'navy_ironclad_warships',
  },
  destroyer: {
    type: 'destroyer', label: 'Destroyer', shortLabel: 'D',
    cost: 150, combatPower: 2.65, transportCapacity: 0,
    requiredTech: 'navy_torpedo_boats',
  },
  submarine: {
    type: 'submarine', label: 'Submarine', shortLabel: 'S',
    cost: 165, combatPower: 2.45, transportCapacity: 0,
    requiredTech: 'navy_oil_firing',
  },
  carrier: {
    type: 'carrier', label: 'Aircraft Carrier', shortLabel: 'C',
    cost: 260, combatPower: 4.2, transportCapacity: 0,
    requiredTech: 'navy_carrier_aviation',
  },
};

export function regimentSpec(type: RegimentType): RegimentSpec {
  return REGIMENT_SPECS[type];
}

export function shipSpec(type: ShipType): ShipSpec {
  return SHIP_SPECS[type];
}

export function regimentAvailability(nation: MilitaryNation, type: RegimentType): MilitaryAvailability {
  const spec = regimentSpec(type);
  const conscription = Math.max(0, Math.floor(nation.reforms.conscription_level ?? 0));
  if (conscription < spec.requiredConscription) {
    return { available: false, reason: `Requires conscription level ${spec.requiredConscription}` };
  }
  const professionalism = Math.max(0, Math.floor(nation.reforms.army_professionalism ?? 0));
  if (professionalism < spec.requiredProfessionalism) {
    return { available: false, reason: `Requires army professionalism level ${spec.requiredProfessionalism}` };
  }
  if (spec.requiredTech && !nation.techs.includes(spec.requiredTech)) {
    return { available: false, reason: `Requires ${spec.requiredTech}` };
  }
  return { available: true, reason: '' };
}

export function shipAvailability(nation: MilitaryNation, type: ShipType): MilitaryAvailability {
  const requiredTech = shipSpec(type).requiredTech;
  if (requiredTech && !nation.techs.includes(requiredTech)) {
    return { available: false, reason: `Requires ${requiredTech}` };
  }
  return { available: true, reason: '' };
}

export function availableRegimentTypes(nation: MilitaryNation): RegimentType[] {
  return REGIMENT_TYPES.filter((type) => regimentAvailability(nation, type).available);
}

export function availableShipTypes(nation: MilitaryNation): ShipType[] {
  return SHIP_TYPES.filter((type) => shipAvailability(nation, type).available);
}

export function aiRegimentPlan(nation: MilitaryNation, count: number): RegimentType[] {
  const available = new Set(availableRegimentTypes(nation));
  const plan: RegimentType[] = [];
  for (let index = 0; index < Math.max(0, count); index++) {
    if (available.has('armor') && index % 4 === 0) plan.push('armor');
    else if (available.has('aircraft') && index % 6 === 5) plan.push('aircraft');
    else if (available.has('artillery') && index % 4 === 3) plan.push('artillery');
    else if (available.has('guard') && index % 5 === 2) plan.push('guard');
    else if (available.has('cavalry') && index % 4 === 1) plan.push('cavalry');
    else plan.push('infantry');
  }
  return plan;
}

export function aiShipType(nation: MilitaryNation, greatPower: boolean): ShipType {
  const available = new Set(availableShipTypes(nation));
  const priority: ShipType[] = greatPower
    ? ['carrier', 'destroyer', 'submarine', 'ironclad', 'manofwar', 'frigate', 'transport']
    : ['submarine', 'destroyer', 'ironclad', 'frigate', 'transport'];
  return priority.find((type) => available.has(type)) ?? 'transport';
}
