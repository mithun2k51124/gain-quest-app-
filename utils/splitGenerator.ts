// utils/splitGenerator.ts — builds a weekly training split from the wizard's answers.
// Pure logic (no React / DB) so it can be tested on its own.
//
// How a plan is built
// 1. pickSplit() chooses the split from days per week and level.
// 2. Each session is a template of slots: squat, horizontal push, row, ...
// 3. Each slot is filled from a curated pool (constants/exercisePools.ts), keeping only what the
//    user can do: equipment they have, their strength (push-ups / pull-ups / squats), their level,
//    and technique lifts they've done before. Lifts they haven't done come in from block 2.
// 4. Plans run in blocks of a few weeks. Each new block rotates the exercises: accessories change
//    every block, main lifts every second block, so there's variety without losing progress.
//
// Rationale (summarised from research):
// - ACSM progression models: ~2–3 days/week for novices, 3–4 intermediate, 4–5 advanced.
// - Hitting each muscle about twice a week beats once a week when volume isn't matched
//   (Schoenfeld et al. meta-analyses); total weekly sets matter most.
// - Common practice: full body for 2–3 days, upper/lower for 4, PPL hybrids for 5, PPL×2 for 6.
import CATALOG from '../constants/exerciseCatalog.json';
import {
  EquipmentAnswers, EquipmentId, HOME_ITEMS, ownedItems, canDo, primaryItem, missingItems, countAvailable,
  DUMBBELL_KG, KETTLEBELL_KG, PLATES_KG,
} from '../constants/equipment';
import {
  Candidate, Level, PatternKey, SkillKey, PATTERNS, POOLS, SKILL_ORDER,
} from '../constants/exercisePools';
import {
  LOADS, KETTLEBELL_SIZES, PLATE_SIZES, MEDBALL_SIZES, BAR_KG, EZ_BAR_KG, SMITH_MIN_KG,
} from '../constants/startingLoads';

export type { Level };

export interface StrengthAnswers {
  push: number;   // 0 = none, 1 = 1–5, 2 = 6–15, 3 = 16–30, 4 = 30+
  pull: number;   // 0 = none, 1 = 1–3, 2 = 4–8, 3 = 9+ (only asked with a pull-up bar)
  squat: number;  // 0 = under 10, 1 = 10–25, 2 = 25–50, 3 = 50+
}

export const PUSH_OPTIONS = ['0', '1–5', '6–15', '16–30', '30+'];
export const PULL_OPTIONS = ['0', '1–3', '4–8', '9+'];
export const SQUAT_OPTIONS = ['<10', '10–25', '25–50', '50+'];

/** Starting guesses for the strength check, before the user adjusts them. */
export function strengthDefaults(level: Level): StrengthAnswers {
  if (level === 'advanced') return { push: 3, pull: 2, squat: 2 };
  if (level === 'intermediate') return { push: 2, pull: 1, squat: 2 };
  return { push: 1, pull: 0, squat: 1 };
}

export interface SplitAnswers {
  level: Level;
  minutes: number;          // per session
  daysPerWeek: number;      // 2–6
  restDays: number[];       // getDay() numbers (0 = Sunday), length = 7 - daysPerWeek
  equipment?: EquipmentAnswers;  // missing on splits made before the equipment step → full gym
  strength?: StrengthAnswers;    // missing → defaults for the level
  skills?: SkillKey[];           // technique lifts done before
  block?: number;                // 0 = first block; exercises rotate each block
  bodyweightKg?: number;         // for starting weights; missing → DEFAULT_BODYWEIGHT_KG
}

export interface ExerciseChoice {
  name: string;
  muscle: string;           // EXERCISE_LIBRARY key (Chest, Back, Legs, ...)
  sets: number;
  reps: string;
  load: string;             // starting weight: '10 kg each', 'Bodyweight', 'Medium band'
  kg?: number;              // the number in load, when there is one (for the log screen)
}

export const DEFAULT_BODYWEIGHT_KG = 70;

export interface PlannedExercise extends ExerciseChoice {
  compound: boolean;
  alternatives: ExerciseChoice[];   // other exercises that fit this slot, best first
}

export interface PlannedDay {
  weekday: number;          // 0 = Sunday
  dayName: string;          // 'Monday'
  title: string;            // 'Upper A' | 'Rest Day'
  rest: boolean;
  exercises: PlannedExercise[];
}

/** A muscle the user's equipment can't train yet, and the item that would help most. */
export interface EquipmentGap {
  muscle: string;
  suggestion: EquipmentId | null;
}

export interface SplitPlan {
  name: string;             // 'Upper / Lower'
  summary: string;          // why this split
  prescription: string;     // e.g. '3 × 8–12 · 60–90 s rest'
  days: PlannedDay[];       // Monday → Sunday
  gaps: EquipmentGap[];
  laterSkills: SkillKey[];  // technique lifts held back until the next block
  available: number;        // library exercises that fit the user's equipment
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
export const ROTATE_OPTIONS = [1, 2, 3, 4];     // weeks per block
export const DEFAULT_ROTATE_WEEKS = 4;

/** Rest days that spread training evenly through the week. */
export function defaultRestDays(daysPerWeek: number): number[] {
  const training: Record<number, number[]> = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
  };
  const t = training[Math.min(6, Math.max(2, daysPerWeek))];
  return [0, 1, 2, 3, 4, 5, 6].filter(d => !t.includes(d));
}

/** Days/week we'd suggest for each level. */
export const RECOMMENDED_DAYS: Record<Level, number> = { beginner: 3, intermediate: 4, advanced: 5 };

/** Where the user is in the current block, from its local YYYY-MM-DD start date. */
export function blockProgress(blockStart: string | undefined, weeks: number, today: Date = new Date()):
  { week: number; due: boolean } | null {
  const [y, m, d] = (blockStart ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.max(0, Math.round((now.getTime() - start.getTime()) / 86400000));
  const week = Math.floor(days / 7) + 1;
  return { week, due: week > weeks };
}

// ── Templates ───────────────────────────────────────────────────────────────
// Slots in priority order: big compound lifts first, then accessories. A session takes as many
// as fit the time available. The number is a variant offset, so the same pattern on two days
// of the week (or twice in one session) gets different exercises.

type Slot = [pattern: PatternKey, variant?: number];

const T: Record<string, Slot[]> = {
  'Full Body A': [['squat'], ['hPush'], ['hPull'], ['vPush'], ['hinge'], ['vPull'], ['biceps'], ['triceps'], ['core']],
  'Full Body B': [['hinge', 1], ['inclinePush'], ['vPull', 1], ['squat', 1], ['lateral'], ['hPull', 1], ['biceps', 1], ['triceps', 1], ['core', 1]],
  'Full Body C': [['squat', 2], ['vPush', 1], ['hPull', 2], ['lunge'], ['glute'], ['rearDelt'], ['chestFly'], ['calf'], ['core', 2]],
  'Upper A': [['hPush'], ['hPull'], ['vPush'], ['vPull'], ['inclinePush'], ['lateral'], ['biceps'], ['triceps']],
  'Upper B': [['inclinePush', 1], ['vPull', 1], ['vPush', 1], ['hPull', 1], ['chestFly'], ['rearDelt'], ['biceps', 1], ['triceps', 1]],
  'Lower A': [['squat'], ['hinge'], ['lunge'], ['hamCurl'], ['calf'], ['core'], ['quadIso']],
  'Lower B': [['hinge', 1], ['squat', 1], ['lunge', 1], ['glute'], ['quadIso'], ['calf', 1], ['core', 1]],
  'Push': [['hPush'], ['vPush'], ['inclinePush'], ['lateral'], ['chestFly'], ['triceps'], ['triceps', 1], ['hPush', 1]],
  'Pull': [['hinge'], ['vPull'], ['hPull'], ['vPull', 1], ['rearDelt'], ['biceps'], ['biceps', 1], ['hPull', 1]],
  'Legs': [['squat'], ['hinge', 1], ['squat', 1], ['hamCurl'], ['quadIso'], ['calf'], ['core']],
  'Push B': [['inclinePush', 1], ['vPush', 1], ['hPush', 2], ['chestFly', 1], ['lateral', 1], ['triceps', 2], ['triceps', 3], ['vPush', 2]],
  'Pull B': [['vPull', 2], ['hPull', 2], ['hPull', 3], ['vPull', 3], ['rearDelt', 1], ['biceps', 2], ['biceps', 3], ['rearDelt', 2]],
  'Legs B': [['squat', 2], ['glute'], ['squat', 3], ['lunge'], ['hamCurl', 1], ['calf', 1], ['core', 1]],
};

// When a slot has nothing the user can do, a related movement takes its place
const FALLBACK: Partial<Record<PatternKey, PatternKey[]>> = {
  inclinePush: ['hPush'], chestFly: ['hPush'], vPush: ['inclinePush', 'hPush'],
  rearDelt: ['hPull'], hPull: ['vPull'], vPull: ['hPull'], hinge: ['glute'], glute: ['hinge'],
  hamCurl: ['hinge', 'glute'], quadIso: ['lunge', 'squat'], lunge: ['squat'],
};

// Extra slots for sessions that come up short on limited equipment
const FILL: Record<'upper' | 'lower' | 'full', Slot[]> = {
  upper: [['hPush', 1], ['hPull', 1], ['vPush', 1], ['triceps', 1], ['core'], ['core', 1]],
  lower: [['lunge', 1], ['glute', 1], ['hinge', 1], ['squat', 1], ['core'], ['core', 1]],
  full: [['lunge'], ['glute'], ['hPush', 1], ['hPull', 1], ['core'], ['core', 1]],
};
const sessionType = (title: string) =>
  /^(Upper|Push|Pull)/.test(title) ? 'upper' : /^(Lower|Legs)/.test(title) ? 'lower' : 'full';

const MUSCLE_PATTERNS: [string, PatternKey[]][] = [
  ['Back', ['hPull', 'vPull']],
  ['Chest', ['hPush', 'inclinePush', 'chestFly']],
  ['Shoulders', ['vPush', 'lateral', 'rearDelt']],
  ['Legs', ['squat', 'lunge', 'hinge', 'glute', 'hamCurl', 'quadIso', 'calf']],
  ['Biceps', ['biceps']],
  ['Triceps', ['triceps']],
  ['Core', ['core']],
];

function pickSplit(level: Level, days: number): { name: string; summary: string; sessions: string[] } {
  switch (days) {
    case 2:
      return { name: 'Full Body', summary: 'Two full-body days train every muscle twice a week — the most efficient use of limited days.',
        sessions: ['Full Body A', 'Full Body B'] };
    case 3:
      return level === 'advanced'
        ? { name: 'Push / Pull / Legs', summary: 'Each session focuses on one movement pattern, so you can push more volume per muscle.',
            sessions: ['Push', 'Pull', 'Legs'] }
        : { name: 'Full Body', summary: 'Three full-body days hit every muscle ~3× a week — the most proven setup for building a base.',
            sessions: ['Full Body A', 'Full Body B', 'Full Body C'] };
    case 4:
      return { name: 'Upper / Lower', summary: 'Upper and lower days twice each: every muscle trained twice a week with time to recover.',
        sessions: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] };
    case 5:
      return level === 'beginner'
        ? { name: 'Upper / Lower / Full Body', summary: 'Upper/lower twice plus a full-body day — high frequency without overly long sessions.',
            sessions: ['Upper A', 'Lower A', 'Full Body A', 'Upper B', 'Lower B'] }
        : { name: 'PPL + Upper / Lower', summary: 'Push/pull/legs then upper/lower: each muscle twice a week with focused sessions.',
            sessions: ['Push', 'Pull', 'Legs', 'Upper A', 'Lower B'] };
    default:
      return level === 'beginner'
        ? { name: 'Upper / Lower ×3', summary: 'Alternating upper and lower days keeps sessions manageable on a 6-day week.',
            sessions: ['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Upper A', 'Lower A'] }
        : { name: 'Push / Pull / Legs ×2', summary: 'The classic 6-day PPL: every muscle trained twice a week with plenty of volume.',
            sessions: ['Push', 'Pull', 'Legs', 'Push B', 'Pull B', 'Legs B'] };
  }
}

/** Without any back exercises, split days would be thin, so every session is full body. */
function fullBodySplit(days: number) {
  return {
    name: 'Full Body',
    summary: 'Full-body sessions make the most of your equipment, so every workout has enough to do.',
    sessions: ['Full Body A', 'Full Body B', 'Full Body C'].slice(0, Math.min(3, days)),
  };
}

function dose(level: Level, compound: boolean): { sets: number; reps: string } {
  if (level === 'beginner') return { sets: 3, reps: '8–12' };
  if (level === 'intermediate') return compound ? { sets: 4, reps: '6–10' } : { sets: 3, reps: '10–12' };
  return compound ? { sets: 4, reps: '5–8' } : { sets: 3, reps: '8–12' };
}

const MINUTES_PER_EXERCISE: Record<Level, number> = { beginner: 7, intermediate: 8, advanced: 9 };
const PRESCRIPTION: Record<Level, string> = {
  beginner: '3 sets × 8–12 reps · 60–90 s rest · add weight when you hit 12',
  intermediate: 'Main lifts 4 × 6–10, accessories 3 × 10–12 · 1.5–2 min rest',
  advanced: 'Main lifts 4 × 5–8 (2–3 min rest), accessories 3 × 8–12',
};
const BODYWEIGHT_PRESCRIPTION = 'Stop 1–2 reps short of failure · 60–90 s rest · when you hit the top of the range, take the harder version';

export function exercisesPerSession(level: Level, minutes: number): number {
  return Math.max(3, Math.min(8, Math.floor((minutes - 5) / MINUTES_PER_EXERCISE[level])));
}

// ── Choosing exercises ──────────────────────────────────────────────────────

const RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const GROUP = new Map((CATALOG as { n: string; g: string }[]).map(e => [e.n, e.g]));
// Equipment that adds load; a plan without any of it gets bodyweight guidance
const LOADED = new Set(['dumbbells', 'kettlebell', 'barbell', 'ez_bar', 'plate', 'cable', 'smith', 'machines', 'bands', 'med_ball']);
// Items worth suggesting when a muscle can't be trained (gym-only ones only for gym users)
const GYM_ONLY = new Set(['cable', 'smith', 'machines', 'rack']);

interface Ctx {
  level: Level;
  rank: number;
  owned: Set<string>;
  strength: StrengthAnswers;
  skills: Set<SkillKey>;
  block: number;
  light: Record<string, boolean>;   // equipment whose heaviest weight is light for this lifter
  ranked: Map<PatternKey, Candidate[]>;
  bodyweight: number;
  // Heaviest weights a home user has (kg); undefined = no limit (gym, or the "or more" answer)
  caps: { dumbbell?: number; kettlebell?: number; plates?: number };
}

function makeCtx(a: SplitAnswers): Ctx {
  const rank = RANK[a.level];
  const eq = a.equipment;
  return {
    level: a.level,
    rank,
    owned: ownedItems(eq),
    strength: a.strength ?? strengthDefaults(a.level),
    skills: new Set(a.skills ?? []),
    block: Math.max(0, a.block ?? 0),
    light: {
      dumbbells: eq?.dumbbellMaxKg !== undefined && eq.dumbbellMaxKg <= (rank === 0 ? 5 : 10),
      kettlebell: eq?.kettlebellMaxKg !== undefined && eq.kettlebellMaxKg <= (rank === 0 ? 8 : 12),
      barbell: eq?.plateTotalKg !== undefined && eq.plateTotalKg <= (rank === 2 ? 50 : rank === 1 ? 20 : 0),
    },
    ranked: new Map(),
    bodyweight: Math.min(150, Math.max(40, a.bodyweightKg || DEFAULT_BODYWEIGHT_KG)),
    caps: eq?.place === 'home' ? {
      dumbbell: below(eq.dumbbellMaxKg, DUMBBELL_KG),
      kettlebell: below(eq.kettlebellMaxKg, KETTLEBELL_KG),
      plates: below(eq.plateTotalKg, PLATES_KG),
    } : {},
  };
}

/** A home weight answer as a limit, unless it's the last ("or more") option. */
const below = (kg: number | undefined, options: number[]) =>
  kg !== undefined && kg < options[options.length - 1] ? kg : undefined;

/** The user's level on the scale a bodyweight candidate is measured on, or null. */
function ability(c: Candidate, ctx: Ctx): { have: number; need: number } | null {
  if (c.push !== undefined) return { have: ctx.strength.push, need: c.push };
  if (c.pull !== undefined) return { have: ctx.strength.pull, need: c.pull };
  if (c.squat !== undefined) return { have: ctx.strength.squat, need: c.squat };
  return null;
}

type Verdict = 'ok' | 'later' | 'no';

function check(c: Candidate, ctx: Ctx): Verdict {
  if (!canDo(c.name, ctx.owned)) return 'no';
  if (c.min && ctx.rank < RANK[c.min]) return 'no';
  const ab = ability(c, ctx);
  if (ab && ab.have < ab.need) return 'no';
  if (c.skill && !ctx.skills.has(c.skill)) {
    switch (c.skill) {
      // Big barbell lifts: start with simpler versions, learn these from block 2
      case 'bbSquat': case 'deadlift': case 'bench': case 'ohp':
        return ctx.block >= 1 ? 'ok' : 'later';
      case 'kbSwing': case 'kbClean':
        return ctx.rank >= 1 || ctx.block >= 1 ? 'ok' : 'later';
      case 'dips': return ctx.strength.push >= 3 ? 'ok' : 'no';
      case 'hangingRaise': return ctx.strength.pull >= 2 ? 'ok' : 'no';
      case 'plyo': return ctx.rank >= 1 ? 'ok' : 'no';
      case 'hspu': return 'no';
    }
  }
  return 'ok';
}

function score(c: Candidate, index: number, pattern: PatternKey, ctx: Ctx): number {
  let s = index;
  if (ctx.rank === 0 && c.easy) s -= 3;
  // First block: lifts the user already knows come first
  if (ctx.block === 0 && c.skill && ctx.skills.has(c.skill)) s -= 2;
  // Light weights can't load two-leg moves enough: prefer single-leg work
  const primary = primaryItem(c.name);
  if (PATTERNS[pattern].lower && primary && ctx.light[primary]) s += c.uni ? -3 : 2;
  // Bodyweight versions: one step below the user's limit gives the best rep range; far below is
  // too easy. (Pull-ups are the exception — doing a few is still the best back work.)
  const ab = ability(c, ctx);
  if (ab) {
    const gap = ab.have - ab.need;
    if (gap === 0 && c.pull === undefined) s += 2;
    if (gap >= 2) s += 3 * (gap - 1);
  }
  return s;
}

/** Every exercise that fits a slot for this user, best first. */
function rankedFor(pattern: PatternKey, ctx: Ctx): Candidate[] {
  let list = ctx.ranked.get(pattern);
  if (!list) {
    list = POOLS[pattern]
      .map((c, i) => ({ c, i, s: score(c, i, pattern, ctx) }))
      .filter(x => check(x.c, ctx) === 'ok')
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map(x => x.c);
    ctx.ranked.set(pattern, list);
  }
  return list;
}

/** Pick for one slot: rotate through the top few with the block, skipping names already used. */
function pickFor(pattern: PatternKey, variant: number, ctx: Ctx, used: Set<string>): Candidate | null {
  const ranked = rankedFor(pattern, ctx);
  if (!ranked.length) return null;
  const compound = PATTERNS[pattern].compound;
  const window = Math.min(ranked.length, compound ? 3 : 4);
  const shift = compound ? Math.floor(ctx.block / 2) : ctx.block;
  const start = (variant + shift) % window;
  for (let k = 0; k < ranked.length; k++) {
    const c = ranked[k < window ? (start + k) % window : k];
    if (!used.has(c.name)) return c;
  }
  return null;
}

function pullUpReps(have: number, gap: number): string {
  if (have >= 3) return gap <= 0 ? '4–8' : gap === 1 ? '6–10' : '8–12';
  if (have === 2) return gap <= 0 ? '3–6' : '5–8';
  return '1–3';
}

// ── Starting weights ────────────────────────────────────────────────────────

const LEVEL_LOAD: Record<Level, number> = { beginner: 1, intermediate: 1.35, advanced: 1.7 };
const PUSH_PATTERNS = new Set<PatternKey>(['hPush', 'inclinePush', 'chestFly', 'vPush', 'lateral', 'triceps']);
const PULL_PATTERNS = new Set<PatternKey>(['hPull', 'vPull', 'rearDelt', 'biceps']);
const BAND_LABEL: Record<Level, string> = { beginner: 'Light band', intermediate: 'Medium band', advanced: 'Heavy band' };

/** The strength check scaled around 1: stronger answers start a little heavier. */
function strengthFactor(pattern: PatternKey, ctx: Ctx): number {
  if (PUSH_PATTERNS.has(pattern)) return 0.8 + 0.1 * ctx.strength.push;    // 0.8 – 1.2
  if (PULL_PATTERNS.has(pattern)) return 0.85 + 0.1 * ctx.strength.pull;   // 0.85 – 1.15
  if (PATTERNS[pattern].lower) return 0.85 + 0.1 * ctx.strength.squat;     // 0.85 – 1.15
  return 1;
}

const roundTo = (kg: number, step: number) => Math.round(kg / step) * step;
/** The largest size that isn't much heavier than the target (the smallest if all are). */
const nearestSize = (kg: number, sizes: number[]) =>
  sizes.filter(s => s <= kg * 1.1).pop() ?? sizes[0];
const capAt = (kg: number, cap?: number) => (cap !== undefined ? Math.min(kg, cap) : kg);

/** How heavy to start an exercise, as a label for the plan and a number for the log screen. */
function startingLoad(name: string, pattern: PatternKey, ctx: Ctx): { load: string; kg?: number } {
  const entry = LOADS[name];
  if (!entry || entry[0] === 'bw') {
    return { load: primaryItem(name) === 'bands' ? BAND_LABEL[ctx.level] : 'Bodyweight' };
  }
  const [type, ratio] = entry;
  const target = ctx.bodyweight * ratio * LEVEL_LOAD[ctx.level] * strengthFactor(pattern, ctx);
  const { dumbbell, kettlebell, plates } = ctx.caps;
  const out = (kg: number, label = `${kg} kg`) => ({ load: label, kg });
  switch (type) {
    case 'db':
    case 'db1': {
      // Light dumbbells go up in 1 kg steps, heavier ones in 2.5 kg
      const kg = capAt(target < 10 ? Math.max(1, Math.round(target)) : roundTo(target, 2.5), dumbbell);
      return out(kg, type === 'db' ? `${kg} kg each` : `${kg} kg`);
    }
    case 'kb':
    case 'kb2': {
      const sizes = KETTLEBELL_SIZES.filter(s => kettlebell === undefined || s <= kettlebell);
      const kg = nearestSize(target, sizes.length ? sizes : [KETTLEBELL_SIZES[0]]);
      return out(kg, type === 'kb2' ? `${kg} kg each` : `${kg} kg`);
    }
    case 'barbell':
      return out(capAt(Math.max(BAR_KG, roundTo(target, 2.5)), plates !== undefined ? plates + BAR_KG : undefined));
    case 'ez':
      return out(capAt(Math.max(EZ_BAR_KG, roundTo(target, 2.5)), plates !== undefined ? plates + EZ_BAR_KG : undefined));
    case 'smith':
      return out(Math.max(SMITH_MIN_KG, roundTo(target, 2.5)));
    case 'stack':
      return out(Math.max(2.5, roundTo(target, 2.5)));
    case 'sled':
      return out(Math.max(10, roundTo(target, 5)));
    case 'plate': {
      const kg = nearestSize(target, PLATE_SIZES);
      return out(kg, `${kg} kg plate`);
    }
    case 'medball': {
      const kg = nearestSize(target, MEDBALL_SIZES);
      return out(kg, `${kg} kg ball`);
    }
    case 'added': {
      const kg = roundTo(target, 2.5);
      return kg > 0 ? out(kg, `+${kg} kg`) : { load: 'Bodyweight' };
    }
  }
  return { load: 'Bodyweight' };
}

function choice(c: Candidate, pattern: PatternKey, ctx: Ctx): ExerciseChoice {
  const { compound, muscle } = PATTERNS[pattern];
  const base = dose(ctx.level, compound);
  const start = startingLoad(c.name, pattern, ctx);
  const out = (reps: string): ExerciseChoice => ({
    name: c.name,
    muscle: muscle === 'Core' ? 'Core' : GROUP.get(c.name) ?? muscle,
    sets: base.sets,
    reps,
    ...start,
  });
  if (c.reps) return out(c.reps);
  const ab = ability(c, ctx);
  if (ab) {
    const gap = ab.have - ab.need;
    // Pull-ups and chin-ups: few reps until the user can do several
    if (c.pull !== undefined && (pattern === 'vPull' || pattern === 'biceps')) return out(pullUpReps(ab.have, gap));
    if (c.squat !== undefined) return out(gap <= 0 ? '8–12' : gap === 1 ? '12–20' : '20–25');
    if (c.pull !== undefined) return out(gap <= 0 ? '6–10' : '8–15');
    return out(gap <= 0 ? (ab.have <= 1 ? '3–5' : '5–8') : gap === 1 ? '8–12' : '12–20');
  }
  const primary = primaryItem(c.name);
  if (primary && ctx.light[primary]) return out('12–20');
  return out(base.reps);
}

function buildSession(title: string, count: number, ctx: Ctx, patternsUsed: Set<PatternKey>): PlannedExercise[] {
  const slots = T[title];
  const used = new Set<string>();
  const picked: { c: Candidate; pattern: PatternKey }[] = [];

  const fill = (pattern: PatternKey, variant: number): boolean => {
    if (picked.length >= count) return false;
    const c = pickFor(pattern, variant, ctx, used);
    if (!c) return false;
    used.add(c.name);
    picked.push({ c, pattern });
    return true;
  };

  for (const [pattern, variant = 0] of slots) {
    if (picked.length >= count) break;
    patternsUsed.add(pattern);
    if (!fill(pattern, variant)) {
      for (const alt of FALLBACK[pattern] ?? []) if (fill(alt, variant + 1)) break;
    }
  }
  // Short session (limited equipment): add other movements first, then more variations
  const extra: Slot[] = [...FILL[sessionType(title)], ...slots];
  for (let round = 1; round <= 3 && picked.length < count; round++) {
    let progress = false;
    for (const [pattern, variant = 0] of extra) if (fill(pattern, variant + round)) progress = true;
    if (!progress) break;
  }

  return picked.map(({ c, pattern }) => ({
    ...choice(c, pattern, ctx),
    compound: PATTERNS[pattern].compound,
    alternatives: rankedFor(pattern, ctx)
      .filter(a => !used.has(a.name))
      .slice(0, 6)
      .map(a => choice(a, pattern, ctx)),
  }));
}

/** The single item that would unlock the most exercises for these slots. */
function suggestItem(patterns: PatternKey[], ctx: Ctx, gym: boolean): EquipmentId | null {
  const tally = new Map<string, number>();
  for (const p of patterns) {
    for (const c of POOLS[p]) {
      const miss = missingItems(c.name, ctx.owned);
      if (miss.length !== 1) continue;
      const item = miss[0];
      if (!gym && GYM_ONLY.has(item)) continue;
      tally.set(item, (tally.get(item) ?? 0) + 1);
    }
  }
  // Most exercises unlocked wins; ties go to the more common home item
  const order = (x: string) => { const i = HOME_ITEMS.indexOf(x as EquipmentId); return i < 0 ? 99 : i; };
  const best = [...tally].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))[0];
  return best ? (best[0] as EquipmentId) : null;
}

/** Technique lifts the user could be shown, given their equipment, level and strength. */
export function skillOptions(a: SplitAnswers): SkillKey[] {
  const ctx = makeCtx({ ...a, block: 0, skills: [] });
  const all = Object.values(POOLS).flat();
  return SKILL_ORDER.filter(skill => all.some(c => {
    if (c.skill !== skill || !canDo(c.name, ctx.owned)) return false;
    if (c.min && ctx.rank < RANK[c.min]) return false;
    const ab = ability(c, ctx);
    return !ab || ab.have >= ab.need;
  }));
}

export function generateSplit(a: SplitAnswers): SplitPlan {
  const ctx = makeCtx(a);
  const days = Math.max(2, Math.min(6, a.daysPerWeek));
  const canTrainBack = rankedFor('hPull', ctx).length + rankedFor('vPull', ctx).length > 0;
  const split = canTrainBack ? pickSplit(a.level, days) : fullBodySplit(days);
  const count = exercisesPerSession(a.level, a.minutes);
  const trainingDays = WEEK_ORDER.filter(d => !a.restDays.includes(d)).slice(0, days);
  const patternsUsed = new Set<PatternKey>();

  let i = 0;
  const planned: PlannedDay[] = WEEK_ORDER.map(weekday => {
    if (!trainingDays.includes(weekday)) {
      return { weekday, dayName: DAY_NAMES[weekday], title: 'Rest Day', rest: true, exercises: [] };
    }
    const title = split.sessions[i++ % split.sessions.length];
    return { weekday, dayName: DAY_NAMES[weekday], title, rest: false, exercises: buildSession(title, count, ctx, patternsUsed) };
  });

  // Muscles the plan meant to train but the equipment can't reach (not just strength: those
  // unlock as the user gets stronger)
  const gaps: EquipmentGap[] = [];
  for (const [muscle, patterns] of MUSCLE_PATTERNS) {
    const wanted = patterns.filter(p => patternsUsed.has(p));
    if (wanted.length && wanted.every(p => POOLS[p].every(c => !canDo(c.name, ctx.owned)))) {
      gaps.push({ muscle, suggestion: suggestItem(wanted, ctx, a.equipment?.place !== 'home' && a.equipment?.place !== 'bodyweight') });
    }
  }

  // Lifts held back for now that come in next block
  const later = new Set<SkillKey>();
  for (const p of patternsUsed) {
    for (const c of POOLS[p]) if (c.skill && check(c, ctx) === 'later') later.add(c.skill);
  }

  const loaded = planned.some(d => d.exercises.some(e => LOADED.has(primaryItem(e.name) ?? '')));

  return {
    name: split.name,
    summary: split.summary,
    prescription: loaded ? PRESCRIPTION[a.level] : BODYWEIGHT_PRESCRIPTION,
    days: planned,
    gaps,
    laterSkills: SKILL_ORDER.filter(s => later.has(s)),
    available: countAvailable(a.equipment),
  };
}
