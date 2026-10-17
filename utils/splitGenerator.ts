// utils/splitGenerator.ts — builds a weekly training split from a few answers.
// Pure logic (no React / DB) so it can be tested on its own.
//
// Rationale (summarised from research):
// - ACSM progression models: ~2–3 days/week for novices, 3–4 intermediate, 4–5 advanced.
// - Hitting each muscle about twice a week beats once a week when volume isn't matched
//   (Schoenfeld et al. meta-analyses); total weekly sets matter most.
// - Common practice: full body for 2–3 days, upper/lower for 4, PPL hybrids for 5, PPL×2 for 6.

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface SplitAnswers {
  level: Level;
  minutes: number;          // per session
  daysPerWeek: number;      // 2–6
  restDays: number[];       // getDay() numbers (0 = Sunday), length = 7 - daysPerWeek
}

export interface PlannedExercise {
  name: string;
  muscle: string;           // EXERCISE_LIBRARY key (Chest, Back, Legs, ...)
  sets: number;
  reps: string;
  compound: boolean;
}

export interface PlannedDay {
  weekday: number;          // 0 = Sunday
  dayName: string;          // 'Monday'
  title: string;            // 'Upper A' | 'Rest Day'
  rest: boolean;
  exercises: PlannedExercise[];
}

export interface SplitPlan {
  name: string;             // 'Upper / Lower'
  summary: string;          // why this split
  prescription: string;     // e.g. '3 × 8–12 · 60–90 s rest'
  days: PlannedDay[];       // Monday → Sunday
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

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

// ── Templates ───────────────────────────────────────────────────────────────
// Ordered by priority: big compound lifts first, then accessories. A session takes
// as many as fit the time available.

type Slot = [name: string, muscle: string, compound?: boolean];

const T: Record<string, Slot[]> = {
  'Full Body A': [
    ['Barbell Full Squat', 'Legs', true], ['Barbell Bench Press - Medium Grip', 'Chest', true], ['Bent Over Barbell Row', 'Back', true],
    ['Standing Military Press', 'Shoulders', true], ['Romanian Deadlift', 'Legs', true], ['Wide-Grip Lat Pulldown', 'Back'],
    ['Dumbbell Bicep Curl', 'Biceps'], ['Triceps Pushdown', 'Triceps'], ['Plank', 'Core'],
  ],
  'Full Body B': [
    ['Barbell Deadlift', 'Back', true], ['Incline Dumbbell Press', 'Chest', true], ['Pullups', 'Back', true],
    ['Leg Press', 'Legs', true], ['Side Lateral Raise', 'Shoulders'], ['Seated Cable Rows', 'Back'],
    ['Hammer Curls', 'Biceps'], ['EZ-Bar Skullcrusher', 'Triceps'], ['Hanging Leg Raise', 'Core'],
  ],
  'Full Body C': [
    ['Front Barbell Squat', 'Legs', true], ['Dumbbell Shoulder Press', 'Shoulders', true], ['One-Arm Dumbbell Row', 'Back', true],
    ['Close-Grip Barbell Bench Press', 'Triceps', true], ['Barbell Hip Thrust', 'Legs'], ['Face Pull', 'Shoulders'],
    ['Incline Dumbbell Flyes', 'Chest'], ['Standing Calf Raises', 'Legs'], ['Russian Twist', 'Core'],
  ],
  'Upper A': [
    ['Barbell Bench Press - Medium Grip', 'Chest', true], ['Bent Over Barbell Row', 'Back', true], ['Standing Military Press', 'Shoulders', true],
    ['Wide-Grip Lat Pulldown', 'Back'], ['Incline Dumbbell Press', 'Chest'], ['Side Lateral Raise', 'Shoulders'],
    ['Barbell Curl', 'Biceps'], ['Triceps Pushdown', 'Triceps'],
  ],
  'Upper B': [
    ['Barbell Incline Bench Press - Medium Grip', 'Chest', true], ['Pullups', 'Back', true], ['Dumbbell Shoulder Press', 'Shoulders', true],
    ['Seated Cable Rows', 'Back'], ['Incline Dumbbell Flyes', 'Chest'], ['Face Pull', 'Shoulders'],
    ['Hammer Curls', 'Biceps'], ['Standing Dumbbell Triceps Extension', 'Triceps'],
  ],
  'Lower A': [
    ['Barbell Full Squat', 'Legs', true], ['Romanian Deadlift', 'Legs', true], ['Leg Press', 'Legs'],
    ['Lying Leg Curls', 'Legs'], ['Standing Calf Raises', 'Legs'], ['Plank', 'Core'], ['Leg Extensions', 'Legs'],
  ],
  'Lower B': [
    ['Barbell Deadlift', 'Back', true], ['Front Barbell Squat', 'Legs', true], ['Split Squat with Dumbbells', 'Legs'],
    ['Barbell Hip Thrust', 'Legs'], ['Leg Extensions', 'Legs'], ['Standing Calf Raises', 'Legs'], ['Hanging Leg Raise', 'Core'],
  ],
  'Push': [
    ['Barbell Bench Press - Medium Grip', 'Chest', true], ['Standing Military Press', 'Shoulders', true], ['Incline Dumbbell Press', 'Chest'],
    ['Side Lateral Raise', 'Shoulders'], ['Cable Crossover', 'Chest'], ['Triceps Pushdown', 'Triceps'],
    ['Standing Dumbbell Triceps Extension', 'Triceps'], ['Dips - Chest Version', 'Chest'],
  ],
  'Pull': [
    ['Barbell Deadlift', 'Back', true], ['Pullups', 'Back', true], ['Bent Over Barbell Row', 'Back', true],
    ['Wide-Grip Lat Pulldown', 'Back'], ['Face Pull', 'Shoulders'], ['Barbell Curl', 'Biceps'],
    ['Hammer Curls', 'Biceps'], ['Seated Bent-Over Rear Delt Raise', 'Shoulders'],
  ],
  'Legs': [
    ['Barbell Full Squat', 'Legs', true], ['Romanian Deadlift', 'Legs', true], ['Leg Press', 'Legs'],
    ['Lying Leg Curls', 'Legs'], ['Leg Extensions', 'Legs'], ['Standing Calf Raises', 'Legs'], ['Hanging Leg Raise', 'Core'],
  ],
  'Push B': [
    ['Barbell Incline Bench Press - Medium Grip', 'Chest', true], ['Dumbbell Shoulder Press', 'Shoulders', true], ['Close-Grip Barbell Bench Press', 'Triceps', true],
    ['Incline Dumbbell Flyes', 'Chest'], ['Cable Seated Lateral Raise', 'Shoulders'], ['EZ-Bar Skullcrusher', 'Triceps'],
    ['Dips - Triceps Version', 'Triceps'], ['Butterfly', 'Chest'],
  ],
  'Pull B': [
    ['Pullups', 'Back', true], ['One-Arm Dumbbell Row', 'Back', true], ['Seated Cable Rows', 'Back'],
    ['Wide-Grip Lat Pulldown', 'Back'], ['Face Pull', 'Shoulders'], ['Incline Dumbbell Curl', 'Biceps'],
    ['Preacher Curl', 'Biceps'], ['Barbell Shrug', 'Shoulders'],
  ],
  'Legs B': [
    ['Front Barbell Squat', 'Legs', true], ['Barbell Hip Thrust', 'Legs', true], ['Hack Squat', 'Legs'],
    ['Split Squat with Dumbbells', 'Legs'], ['Lying Leg Curls', 'Legs'], ['Standing Calf Raises', 'Legs'], ['Cable Crunch', 'Core'],
  ],
};

// Easier swaps for beginners (technique-friendly, machine/guided versions)
const BEGINNER_SWAP: Record<string, string> = {
  'Pullups': 'Wide-Grip Lat Pulldown',
  'Front Barbell Squat': 'Goblet Squat',
  'Barbell Deadlift': 'Romanian Deadlift',
  'Dips - Chest Version': 'Cable Crossover',
  'Dips - Triceps Version': 'Triceps Pushdown',
  'Hanging Leg Raise': 'Crunches',
  'Split Squat with Dumbbells': 'Dumbbell Lunges',
  'Hack Squat': 'Leg Press',
};

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

export function exercisesPerSession(level: Level, minutes: number): number {
  return Math.max(3, Math.min(8, Math.floor((minutes - 5) / MINUTES_PER_EXERCISE[level])));
}

export function generateSplit(a: SplitAnswers): SplitPlan {
  const days = Math.max(2, Math.min(6, a.daysPerWeek));
  const split = pickSplit(a.level, days);
  const count = exercisesPerSession(a.level, a.minutes);
  const trainingDays = WEEK_ORDER.filter(d => !a.restDays.includes(d)).slice(0, days);

  let i = 0;
  const planned: PlannedDay[] = WEEK_ORDER.map(weekday => {
    if (!trainingDays.includes(weekday)) {
      return { weekday, dayName: DAY_NAMES[weekday], title: 'Rest Day', rest: true, exercises: [] };
    }
    const title = split.sessions[i++ % split.sessions.length];
    const seen = new Set<string>();
    const exercises: PlannedExercise[] = [];
    for (const [rawName, muscle, compound = false] of T[title]) {
      if (exercises.length >= count) break;
      const name = a.level === 'beginner' ? BEGINNER_SWAP[rawName] ?? rawName : rawName;
      if (seen.has(name)) continue;
      seen.add(name);
      exercises.push({ name, muscle, compound, ...dose(a.level, compound) });
    }
    return { weekday, dayName: DAY_NAMES[weekday], title, rest: false, exercises };
  });

  return { name: split.name, summary: split.summary, prescription: PRESCRIPTION[a.level], days: planned };
}
