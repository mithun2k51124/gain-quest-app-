// constants/equipment.ts — the equipment a user can have, and what each exercise needs.
// exerciseEquipment.json lists, for every catalog exercise, the items it needs (all of them).
// 'none' = no equipment; floor, wall, chair, stairs, a towel and the like are assumed.
// Each entry was checked against the exercise's own instructions, not just the dataset label.
import REQUIRES from './exerciseEquipment.json';

export type EquipmentId =
  | 'dumbbells' | 'barbell' | 'kettlebell' | 'kettlebell_pair' | 'bench' | 'adj_bench' | 'rack'
  | 'ez_bar' | 'plate' | 'bands' | 'pullup_bar' | 'dip_bars' | 'rings' | 'box' | 'med_ball'
  | 'stability_ball' | 'ab_wheel' | 'jump_rope' | 'foam_roller' | 'cable' | 'smith' | 'machines'
  | 'cardio' | 'strongman' | 'specialty' | 'partner';

export type Place = 'gym' | 'home' | 'bodyweight';

export interface EquipmentAnswers {
  place: Place;
  items: EquipmentId[];
  dumbbellMaxKg?: number;     // heaviest dumbbell
  kettlebellMaxKg?: number;   // heaviest kettlebell
  plateTotalKg?: number;      // all barbell plates together
}

export const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  dumbbells: 'Dumbbells', barbell: 'Barbell', kettlebell: 'Kettlebell', kettlebell_pair: 'Second kettlebell',
  bench: 'Bench', adj_bench: 'Adjustable bench', rack: 'Squat rack', ez_bar: 'EZ curl bar', plate: 'Weight plate',
  bands: 'Resistance bands', pullup_bar: 'Pull-up bar', dip_bars: 'Dip bars', rings: 'Rings / TRX', box: 'Plyo box',
  med_ball: 'Medicine ball', stability_ball: 'Exercise ball', ab_wheel: 'Ab wheel', jump_rope: 'Jump rope',
  foam_roller: 'Foam roller', cable: 'Cable machine', smith: 'Smith machine', machines: 'Weight machines',
  cardio: 'Cardio machines', strongman: 'Strongman gear', specialty: 'Specialty gear', partner: 'Training partner',
};

/** Home checklist, most useful first. */
export const HOME_ITEMS: EquipmentId[] = [
  'dumbbells', 'barbell', 'kettlebell', 'bench', 'bands', 'pullup_bar', 'dip_bars', 'rings',
  'box', 'med_ball', 'stability_ball', 'ab_wheel', 'jump_rope', 'foam_roller',
];
/** Shown behind "More equipment". */
export const MORE_ITEMS: EquipmentId[] = ['cable', 'smith', 'machines'];
/** What a commercial gym is assumed to have. */
export const GYM_ITEMS: EquipmentId[] = [
  'dumbbells', 'barbell', 'rack', 'ez_bar', 'bench', 'adj_bench', 'kettlebell', 'kettlebell_pair',
  'cable', 'smith', 'machines', 'pullup_bar', 'dip_bars', 'bands', 'box', 'med_ball',
  'stability_ball', 'ab_wheel', 'jump_rope', 'foam_roller', 'cardio',
];

/** Checklist when a gym user edits what their gym has. */
export const GYM_CHECKLIST: EquipmentId[] = [
  'dumbbells', 'barbell', 'rack', 'ez_bar', 'bench', 'adj_bench', 'kettlebell', 'cable', 'smith',
  'machines', 'pullup_bar', 'dip_bars', 'bands', 'rings', 'box', 'med_ball', 'stability_ball', 'ab_wheel',
];

// Follow-up chips (kg). The last option means "or more".
export const DUMBBELL_KG = [5, 10, 20, 30];
export const KETTLEBELL_KG = [8, 12, 16, 24];
export const PLATES_KG = [20, 50, 100, 150];

const REQ = REQUIRES as Record<string, string[]>;

/** Items the user effectively has: their answers plus what those imply. No answers = full gym. */
export function ownedItems(eq?: EquipmentAnswers | null): Set<string> {
  const owned = new Set<string>(['none', ...(eq ? eq.items : GYM_ITEMS)]);
  if (owned.has('barbell')) owned.add('plate');
  if (owned.has('adj_bench')) owned.add('bench');
  if (owned.has('kettlebell_pair')) owned.add('kettlebell');
  return owned;
}

/** Main piece of equipment for an exercise ('none' for bodyweight), or null if unknown. */
export function primaryItem(name: string): string | null {
  return REQ[name]?.[0] ?? null;
}

export function canDo(name: string, owned: Set<string>): boolean {
  const req = REQ[name];
  return !!req && req.every(i => owned.has(i));
}

export function missingItems(name: string, owned: Set<string>): string[] {
  return (REQ[name] ?? []).filter(i => !owned.has(i));
}

/** How many library exercises fit this equipment (partner exercises left out). */
export function countAvailable(eq?: EquipmentAnswers | null): number {
  const owned = ownedItems(eq);
  return Object.values(REQ).filter(r => !r.includes('partner') && r.every(i => owned.has(i))).length;
}
